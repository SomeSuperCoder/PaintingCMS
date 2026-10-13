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

Everything runs through the Justfile (`just --list`):

```sh
cp .env.example .env   # then set POSTGRES_* (PUBLIC_URL/BOT_TOKEN optional in dev)
just install           # pnpm install (workspace deps)
just dev               # postgres + migrations + Vite (:5173) + NestJS (:3000)
```

Open http://localhost:5173. The local prod-like stack (db + api + caddy) is
`just up`; stop it with `just down`, follow it with `just logs`.

## Deploy

Deploys are manual, on the server — CI never touches production.

1. On the server, put the real secrets in `.env` (see `.env.example`):
   `PUBLIC_URL=https://<domain>`, `POSTGRES_PASSWORD` (URL-safe),
   `BOT_TOKEN`. DNS must point at the host and ports 80/443 must be open
   (Caddy auto-TLS).
2. Run `just deploy`. It pulls, rebuilds the stack, and waits until the `api`
   container is healthy; on failure it prints the logs and the DB recovery hint.

`.env` is the single source of truth for bare-metal dev, `just`, and the
podman containers (compose reads it automatically and streams it into the api
container). `DATABASE_URL` is derived — you never set it by hand.

> ⚠ Postgres only reads `POSTGRES_PASSWORD` when it first creates the data
> volume. Set it before the first `just up` and don't change it later; if you
> must, `just backup` then `just db-reset` (destroys local data).

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

- Copy `.env.example` → `.env` and set real values: `PUBLIC_URL`
  (`https://<domain>`, also used in BotFather `/setdomain`), `BOT_TOKEN`
  (BotFather), `POSTGRES_PASSWORD`. DNS must point at the host, ports 80/443
  open.
- Secrets live only in `.env` — never in code, git, or CI.
- Rollback: `podman-compose down` + previous image; migrations have `down`
  files.
- `just backup` → `pg_dump` into `backups/` (gitignored).

## Layout

```
apps/web/          React 19 SPA (Vite) — scaffolded, code lands next wave
apps/api/          NestJS 11 API + Dockerfile — scaffolded, code lands next wave
packages/shared/   shared DTO types / constants — scaffolded, code lands next wave
podman-compose.yml db + api + caddy topology (D9); reads .env
.github/workflows/ci.yml  verify → e2e (deploys are manual: `just deploy`)
Justfile           install/dev/up/down/logs/migrate/backup/deploy (D9)
```
