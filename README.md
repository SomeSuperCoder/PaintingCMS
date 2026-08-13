# PaintingCMS

Telegram Mini App CMS for a painter — a single-owner catalog of paintings with
photos and sale locations. Backend: NestJS 11 (REST API). Frontend: React 19 +
Vite SPA (Russian-only UI). DB: PostgreSQL 16 + Drizzle ORM. Bot: grammY
(UX only, never blocks CRUD). Served via Caddy with auto-TLS.

## Stack

- **Monorepo:** pnpm workspace — `apps/web`, `apps/api`, `packages/shared`
  (shared DTO types/constants)
- **Web:** Vite + React 19 (React Compiler) + Tailwind v4 + shadcn/ui
- **API:** NestJS 11 + Drizzle + Postgres 16, TMA initData auth (D2)
- **Tests:** Vitest (unit), Playwright (E2E, mocked TMA)
- **Deploy:** podman-compose — `db` (postgres:16) + `api` + `caddy` (80/443)
- **CI:** GitHub Actions — verify → e2e → deploy (main only)

## Quick start

All developer tasks run through the Justfile (`just --list` shows all recipes):

```sh
just install   # pnpm install (workspace deps)
just db-up     # start postgres:16 container (healthchecked, localhost:5432)
just migrate   # apply Drizzle migrations to the dev DB
just dev       # Vite on :5173 (proxies /api → NestJS on :3000)
```

Then open http://localhost:5173. Production-like stack: `just compose-up`
(db + api + caddy). Deploy: `just deploy` (git pull + compose up + /health
smoke).

## Script contract (for engineers)

Root `package.json` delegates to workspace packages via `pnpm -r` / `pnpm
--filter`. Each app must provide its own scripts — CI/Justfile call these
names, and `pnpm -r` silently skips packages that lack a script:

| Package | Scripts required |
|---------|------------------|
| `@painting/web` | `dev`, `lint`, `typecheck`, `test`, `test:e2e`, `build` |
| `@painting/api` | `dev`, `lint`, `typecheck`, `test`, `build`, `db:generate`, `db:migrate` |
| `@painting/shared` | (none — pure types/constants) |

Cross-package imports use `workspace:*` (e.g. `"@painting/shared":
"workspace:*"`).

## Production notes

- Copy `.env.example` → `.env` and set real values: `BOT_TOKEN` (BotFather),
  `WEBAPP_URL` (https, BotFather `/setdomain`), `CADDY_DOMAIN` (DNS must point
  at the host, ports 80/443 open).
- Secrets live only in `.env` / CI secrets — never in code or git.
- Rollback: `podman-compose down` + previous image; migrations have `down`
  files.
- `just backup` → `pg_dump` into `backups/` (gitignored).

## Layout

```
apps/web/          React 19 SPA (Vite) — scaffolded, code lands next wave
apps/api/          NestJS 11 API + Dockerfile — scaffolded, code lands next wave
packages/shared/   shared DTO types / constants — scaffolded, code lands next wave
podman-compose.yml db + api + caddy topology (D9)
.github/workflows/ci.yml  verify → e2e → deploy (D9)
Justfile           install/dev/db/quality/compose/deploy recipes (D9)
```
