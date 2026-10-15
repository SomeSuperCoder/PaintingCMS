# PaintingCMS — task runner
# -----------------------------------------------------------------------------
# `.env` (repo root) is the single source of truth; `set dotenv-load` loads it
# so recipes see POSTGRES_*, PUBLIC_URL, BOT_TOKEN, ... Run `just --list`.
set dotenv-load := true
set shell := ["bash", "-uc"]

default:
    @just --list

# ── Essentials ──────────────────────────────────────────────

# Install all workspace dependencies (pnpm only — never npm/npx)
install:
    pnpm install

# Local dev: postgres + migrations + shared build, then Vite (:5173) + NestJS (:3000)
dev:
    @test -f .env || { echo "Missing .env — run: cp .env.example .env"; exit 1; }
    podman-compose up -d db
    @echo "Waiting for postgres ..."
    @for i in $(seq 1 30); do podman-compose exec -T db pg_isready -U ${POSTGRES_USER:?set POSTGRES_USER in .env} >/dev/null 2>&1 && break; sleep 1; done
    pnpm --filter @painting/shared build
    DATABASE_URL=postgresql://${POSTGRES_USER:?set POSTGRES_USER in .env}:${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}@localhost:5432/${POSTGRES_DB:?set POSTGRES_DB in .env} pnpm --filter @painting/api db:migrate
    DATABASE_URL=postgresql://${POSTGRES_USER:?set POSTGRES_USER in .env}:${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}@localhost:5432/${POSTGRES_DB:?set POSTGRES_DB in .env} pnpm dev

# Build + start the production-like stack (db + api + caddy) in the background
up:
    @test -f .env || { echo "Missing .env — run: cp .env.example .env and fill PUBLIC_URL, POSTGRES_PASSWORD, BOT_TOKEN"; exit 1; }
    @test -n "${PUBLIC_URL:-}" || { echo "PUBLIC_URL is empty in .env"; exit 1; }
    @test -n "${POSTGRES_PASSWORD:-}" || { echo "POSTGRES_PASSWORD is empty in .env"; exit 1; }
    @test -n "${BOT_TOKEN:-}" || { echo "BOT_TOKEN is empty in .env"; exit 1; }
    podman-compose up -d --build

# Stop the stack (named volumes / data are preserved)
down:
    podman-compose down

# Tail container logs
logs:
    podman-compose logs -f --tail=100

# Apply Drizzle migrations to the local dev DB
migrate:
    DATABASE_URL=postgresql://${POSTGRES_USER:?set POSTGRES_USER in .env}:${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}@localhost:5432/${POSTGRES_DB:?set POSTGRES_DB in .env} pnpm --filter @painting/api db:migrate

# pg_dump the DB into backups/<timestamp>.sql (gitignored)
backup:
    mkdir -p backups
    podman-compose exec -T db pg_dump -U ${POSTGRES_USER:?set POSTGRES_USER in .env} ${POSTGRES_DB:?set POSTGRES_DB in .env} > backups/$(date +%Y%m%d-%H%M%S).sql

# ── Deploy (run on the server) ──────────────────────────────

# Resolve the running api container ID.
#
# NOT `podman-compose ps -q api`: podman-compose's `ps` takes NO positional
# service (v1.6.0 accepts only -q), so that call dies with "unrecognized
# arguments: api". Worse, inside the `[ -n "$(...)" ]` skip-check it fails
# SILENTLY — bash discards a command substitution's exit status inside a test,
# so the condition is just false and every deploy rebuilt as if nothing had
# changed. Resolve it through native podman using the label podman-compose
# stamps on every container it creates.
#
# `status=running`, NOT `-a`: podman-compose's ps always passes -a, which would
# also match a stopped container and wrongly let us skip a rebuild.
#
# Scoped by service label only. If a second compose project on this host also
# had an `api` service it could match the wrong container; adding a project
# label means hardcoding podman-compose's project-name derivation, which is not
# worth it for a single-app box.
api_cid := "podman ps -q --filter label=io.podman.compose.service=api --filter status=running | head -1"

# Same container, ANY state (running or not). Used to tell "still booting" apart
# from "crashed": a container that has exited will never become healthy on its
# own, so waiting the full timeout for it is pointless. Without this, a crash
# and a slow start both surface as an empty id and are indistinguishable.
api_cid_any := "podman ps -aq --filter label=io.podman.compose.service=api | head -1"

# `podman inspect --format` wants Go templates, and Go templates use {{...}} —
# which `just` would try to interpret as its own interpolation. Declaring them
# as variables keeps the braces literal (verified: the value is NOT re-parsed).
go_state := "{{.State.Status}}"
go_health := "{{.State.Health.Status}}"
go_exit_code := "{{.State.ExitCode}}"

# Everything that determines the image — exactly what the Dockerfile COPYs.
# The Dockerfile itself lives under apps/api so it is covered here; .dockerignore
# is listed because it decides which files enter the context at all.
#
# podman-compose.yml is deliberately NOT here: it configures env/volumes at `up`
# time and does not change the image, so editing it must not force a rebuild.
# Neither are Justfile / README / .github / .env.example / docs — a typo fix in
# any of them cannot alter the built artifact, and must never cost a rebuild.
deploy_inputs := "apps/api apps/web packages/shared pnpm-lock.yaml pnpm-workspace.yaml .npmrc .dockerignore"

# Deploy: pull, rebuild ONLY if a build input changed, restart, wait for health.
#
# The build is the expensive step (pnpm install + shared/api/web builds +
# pnpm deploy), so the gate is on WHAT THE IMAGE DEPENDS ON, not on the commit.
# A commit that touches only Justfile/README/CI leaves every byte the Dockerfile
# reads identical, so it must reuse the existing image.
#
# Rebuild when ANY of these hold:
#   - force=true was passed (`just deploy force=true` — the escape hatch)
#   - .deploy-stamp is missing, or does not name a resolvable commit
#   - something under deploy_inputs has uncommitted changes (including new
#     untracked files — COPY picks those up, so they DO change the image)
#   - something under deploy_inputs differs between the stamp commit and HEAD
#   - no api container is running (image pruned / container removed → we cannot
#     assume the deployed image still exists)
#
# Every failure path here leads to a BUILD, never to a skip: an unresolvable
# stamp or a failed `git diff` must not be able to silently deploy stale code.
# Over-eager is the safe direction (e.g. editing a test file under apps/web
# still rebuilds) — so the filter is deliberately NOT a copy of .dockerignore;
# duplicating those rules in two places is how they silently rot.
#
# `.deploy-stamp` is written ONLY after the health check passes, so it means
# "deployed AND verified". A build that produces a broken image therefore gets
# retried on the next deploy instead of being remembered as good.
#
# Deploy: pull, rebuild only if a build input changed, restart, wait for health.
deploy force="false":
    @test -f .env || { echo "Missing .env — run: cp .env.example .env and fill PUBLIC_URL, POSTGRES_PASSWORD, BOT_TOKEN"; exit 1; }
    @test -n "${PUBLIC_URL:-}" || { echo "PUBLIC_URL is empty in .env"; exit 1; }
    @test -n "${POSTGRES_PASSWORD:-}" || { echo "POSTGRES_PASSWORD is empty in .env"; exit 1; }
    @test -n "${BOT_TOKEN:-}" || { echo "BOT_TOKEN is empty in .env"; exit 1; }
    git pull --ff-only
    @stamp=.deploy-stamp; build=1; \
     if [ "{{force}}" = "true" ]; then \
       echo "force=true — rebuilding the api image."; \
     elif [ -f "$stamp" ] && sha=$(cat "$stamp" 2>/dev/null) && git cat-file -e "${sha}^{commit}" 2>/dev/null; then \
       uncommitted=$(git status --porcelain -- {{deploy_inputs}}); \
       committed=$(git diff --name-only "$sha..HEAD" -- {{deploy_inputs}}) || committed="<diff-failed>"; \
       if [ -z "$uncommitted" ] && [ -z "$committed" ] && [ -n "$({{api_cid}})" ]; then build=0; fi; \
     fi; \
     if [ "$build" = "1" ]; then \
       echo "Building the api image ..."; \
       podman-compose up -d --build --force-recreate; \
     else \
       echo "No build inputs changed since the last verified deploy — reusing the image."; \
       podman-compose up -d --force-recreate; \
     fi
    @echo "Waiting for api to become healthy ..."
    @attempts=40; fails=0; asked=0; \
     for i in $(seq 1 $attempts); do \
       cid=$({{api_cid}}); \
       if [ -n "$cid" ]; then \
         if podman healthcheck run "$cid" >/dev/null 2>&1; then \
           echo "  api is healthy (attempt $i/$attempts)."; \
           git rev-parse HEAD > .deploy-stamp; \
           echo "  Recorded .deploy-stamp (verified deploy)."; \
           exit 0; \
         fi; \
         health=$(podman inspect --format {{go_health}} "$cid" 2>/dev/null); \
         echo "  [$i/$attempts] not healthy yet (health=${health:-unknown})"; \
       else \
         any=$({{api_cid_any}}); \
         if [ -z "$any" ]; then \
           echo "  [$i/$attempts] no api container created yet"; \
         else \
           state=$(podman inspect --format {{go_state}} "$any" 2>/dev/null); \
           code=$(podman inspect --format {{go_exit_code}} "$any" 2>/dev/null); \
           if [ "$state" = "exited" ] || [ "$state" = "dead" ]; then \
             echo "  [$i/$attempts] the api container EXITED (state=$state, exit code=${code:-?})."; \
             echo "  It will not recover on its own. Container logs:"; \
             podman-compose logs --tail=20 api; \
             echo; \
             echo "  If this is an env problem, fix .env and re-run 'just deploy'."; \
             exit 1; \
           fi; \
           echo "  [$i/$attempts] api container state=${state:-unknown}, waiting to start"; \
         fi; \
       fi; \
       fails=$((fails+1)); \
       if [ "$fails" -eq 3 ] && [ "$asked" = "0" ]; then \
         asked=1; \
         if [ -t 0 ]; then \
           printf "  Still not healthy after %s attempts. Would you like to see the container logs now? [y/N] " "$fails"; \
           if read -t 60 -r ans; then \
             case "$ans" in [yY]*) echo; podman-compose logs --tail=20 api; exit 1;; esac; \
           fi; \
           echo; \
         else \
           echo "  (non-interactive — continuing to wait; use 'just logs' in another shell to watch)"; \
         fi; \
       fi; \
       sleep 3; \
     done; \
     echo "api did not become healthy in $attempts attempts (~$((attempts*3))s). Last logs:"; \
     podman-compose logs --tail=20 api; \
     echo; \
     echo "If this is a Postgres password error: restore the old POSTGRES_PASSWORD in .env,"; \
     echo "or run 'just backup' and then 'just db-reset' (DESTROYS data)."; \
     exit 1

# ── Recovery ────────────────────────────────────────────────────────────────

# Clear the ownership singleton so the NEXT validated user claims it. Use on a
# database that was smoke-tested while ownership still persisted (before the
# DEV_MODE bypass), so the painter is not locked out behind a stale test owner.
# Only app_state is touched — paintings, photos, locations and the audit trail
# are preserved. The leftover dev user row is harmless: it is never the owner.
#
# Clear the current owner so the next person to open the app becomes the owner.
owner-reset:
    @test -n "${POSTGRES_USER:-}" || { echo "set POSTGRES_USER in .env"; exit 1; }
    @test -n "${POSTGRES_DB:-}" || { echo "set POSTGRES_DB in .env"; exit 1; }
    @echo "This clears the current owner. The NEXT person to open the app becomes the owner."
    @read -p "Type 'yes' to continue: " ans; [ "${ans:-}" = "yes" ] || { echo "aborted"; exit 1; }
    podman-compose exec -T db psql -v ON_ERROR_STOP=1 -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c 'DELETE FROM app_state'
    @echo "Ownership cleared."

# DESTRUCTIVE: wipe the db volume and recreate it (use after changing POSTGRES_PASSWORD)
db-reset:
    @read -p "This DESTROYS all database data. Type 'yes' to continue: " ans; [ "${ans:-}" = "yes" ] || { echo "aborted"; exit 1; }
    podman-compose down -v
    podman-compose up -d db
