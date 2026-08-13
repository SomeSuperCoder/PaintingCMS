# PaintingCMS — task runner (see README.md)
# Loads .env so recipes see POSTGRES_*, DATABASE_URL, BOT_TOKEN, ...
set dotenv-load := true
set shell := ["bash", "-uc"]

default:
    @just --list

# ── Install ─────────────────────────────────────────────────

# Install all workspace dependencies (pnpm only — never npm/npx)
install:
    pnpm install

# ── Local dev (bare-metal) ──────────────────────────────────

# Vite on :5173 proxies /api → NestJS on :3000 (requires `just db-up` first)
# Depends on build-shared — dev runs `pnpm -r --parallel` so the compiled
# @painting/shared dist must exist before Vite/Nest resolve it.
dev: build-shared
    pnpm dev

# ── Database (podman-compose) ───────────────────────────────

# Start the postgres:16 container (healthchecked, localhost:5432)
db-up:
    podman-compose up -d db

# Stop the db container (data preserved in the pgdata volume)
db-down:
    podman-compose down

# Wipe the pgdata volume and recreate the db (DESTROYS dev data)
db-reset:
    podman-compose down -v
    podman-compose up -d db

# Apply Drizzle migrations to the dev DB (@painting/api db:migrate)
migrate:
    pnpm --filter @painting/api db:migrate

# Generate a Drizzle migration from the schema (@painting/api db:generate)
db-generate:
    pnpm --filter @painting/api db:generate

# ── Quality ─────────────────────────────────────────────────

lint:
    pnpm lint

typecheck:
    pnpm typecheck

test:
    pnpm test

# Playwright E2E (apps/web; API + test DB are wired by the Test Engineer's
# Playwright config — same path CI uses)
test-e2e:
    pnpm --filter @painting/web test:e2e

# Build the @painting/shared package (compiled dist consumed by api + web)
build-shared:
    pnpm --filter @painting/shared build

build:
    pnpm build

# ── Containers (production-like stack) ──────────────────────

# Build + start db + api + caddy via podman-compose
compose-up:
    podman-compose up -d --build

# Prod deploy: pull, rebuild, restart, health smoke via Caddy :80
deploy:
    git pull --ff-only
    podman-compose up -d --build
    curl -fsS --retry 10 --retry-delay 3 --retry-all-errors http://localhost/health

# Tail container logs
logs:
    podman-compose logs -f --tail=100

# pg_dump the db to backups/<timestamp>.sql (gitignored)
backup:
    mkdir -p backups
    podman-compose exec -T db pg_dump -U ${POSTGRES_USER:-paintingcms} ${POSTGRES_DB:-paintingcms} > backups/$(date +%Y%m%d-%H%M%S).sql

# Health smoke (via Caddy on :80 → api /health)
health:
    curl -fsS http://localhost/health
