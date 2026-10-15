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

# Deploy: pull, rebuild, restart, then wait until the api container is healthy
deploy:
    @test -f .env || { echo "Missing .env — run: cp .env.example .env and fill PUBLIC_URL, POSTGRES_PASSWORD, BOT_TOKEN"; exit 1; }
    @test -n "${PUBLIC_URL:-}" || { echo "PUBLIC_URL is empty in .env"; exit 1; }
    @test -n "${POSTGRES_PASSWORD:-}" || { echo "POSTGRES_PASSWORD is empty in .env"; exit 1; }
    @test -n "${BOT_TOKEN:-}" || { echo "BOT_TOKEN is empty in .env"; exit 1; }
    git pull --ff-only
    podman-compose up -d --build
    @echo "Waiting for api to become healthy ..."
    @cid=$(podman-compose ps -q api); \
     for i in $(seq 1 40); do \
       podman healthcheck run "$cid" >/dev/null 2>&1 && { echo "api is healthy."; exit 0; }; \
       sleep 3; \
     done; \
     echo "api did not become healthy in time. Last logs:"; \
     podman-compose logs --tail=80 api; \
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
