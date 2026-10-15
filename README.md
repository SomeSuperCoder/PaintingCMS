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
- **CI:** GitHub Actions — verify → e2e (deploys are manual: `just deploy`)

Everything runs through the Justfile (`just --list`). `.env` at the repo root is
the single source of truth for bare-metal dev, `just`, and the podman
containers; `DATABASE_URL` is derived — you never set it by hand.

---

## Tutorial 1 — Smoke test in a browser (no Telegram)

**Goal:** run the app on a server and confirm from a web browser that CRUD
actually works — with no Telegram client and no real bot token. `DEV_MODE`
bypasses auth entirely (every request is the shared `DEV_USER` mock) so a plain
browser is enough.

**Prerequisites (on the server):** Node 22+, pnpm 10 (`corepack enable`),
podman + podman-compose, and `just`.

1. **Configure the environment**

   ```sh
   cp .env.example .env
   ```

   Edit `.env`:
   - `POSTGRES_PASSWORD` → any URL-safe value (e.g. `devpassword`)
   - `DEV_MODE=true`
   - leave `BOT_TOKEN` empty and `PUBLIC_URL` unchanged — neither is used here.

2. **Install dependencies**

   ```sh
   just install
   ```

3. **Start the dev stack**

   ```sh
   just dev
   ```

   This boots postgres, applies migrations, then runs Vite (`:5173`) and NestJS
   (`:3000`) in parallel.

4. **Open it in a browser**
   - Same machine: <http://localhost:5173>
   - Remote server: forward the Vite port from your laptop —
     `ssh -L 5173:localhost:5173 user@server` — then open
     <http://localhost:5173>. The Vite dev proxy forwards `/api` to NestJS
     server-side, so `:5173` is the only port you need.

5. **Verify it actually works**
   - You land straight on the painting catalog — in DEV_MODE ownership is
     bypassed, so there is no owner to claim and nobody can be locked out.
   - Create a painting, upload a photo, add/reuse a location, then edit and
     delete.
   - Reload — the data persists in postgres.
   - Note: nothing is written to the `users` table and no ownership row is
     created, so the dev session leaves no ownership trace behind.

6. **Stop**

   `Ctrl-C`, then `just down`.

> ⚠ `DEV_MODE` skips authentication *and* ownership completely — every request
> is the mock `DEV_USER` and nothing is recorded. Never enable it in production:
> the API refuses to boot when `DEV_MODE=true` together with
> `NODE_ENV=production`.

---

## Tutorial 2 — Deploy as a real Telegram Mini App

**Goal:** serve the app over HTTPS on your own domain and open it from inside
Telegram as a Mini App. Caddy obtains the TLS certificate automatically.

**Prerequisites:**
- A server reachable at a public domain (DNS `A`/`AAAA` → the server IP).
- Ports **80** and **443** open (Let's Encrypt + the app).
- **rootful** podman, so Caddy can bind 80/443 (rootless works too if the host
  sets `net.ipv4.ip_unprivileged_port_start=80`).
- `git`, `just`.

1. **Create the bot (BotFather)**
   - Talk to [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token.
   - Optional: `/setdomain` (or `/mybots` → *Bot Settings* → *Menu Button*)
     points the Mini App at your domain. The bot already ships an
     «Открыть каталог» button, so this only adds the Telegram menu shortcut.

2. **Configure production secrets** — on the server, in the repo root:

   ```sh
   cp .env.example .env
   ```

   Set:
   - `PUBLIC_URL=https://your.domain` — drives Caddy's TLS domain, the API CORS
     allow-list, the Telegram webhook base, and the bot's Mini App button.
   - `BOT_TOKEN=<token from BotFather>` — HMAC secret for every initData check;
     the API refuses to boot without it.
   - `POSTGRES_PASSWORD=<url-safe password>`
   - `DEV_MODE=false`

3. **Deploy**

   ```sh
   sudo just deploy
   ```

   It pulls the latest code, rebuilds the stack (`db` + `api` + `caddy`), and
   waits until the `api` container is healthy. On failure it prints the logs
   plus the DB-password recovery hint.

4. **Verify from the outside**

   ```sh
   curl https://your.domain/health
   ```

   Then open `https://your.domain` in a browser — you get the SPA (an auth
   error / «Сессия истекла» is expected outside Telegram, since there is no
   initData).

5. **Open the Mini App in Telegram**
   - Open a chat with your bot and send `/start`.
   - Tap «Открыть каталог» — the Mini App opens inside Telegram.

6. **Ownership**
   - The **first user to open** the app becomes the owner (claim-on-first-open).
     Make sure the painter opens it first, or open it yourself and transfer.
   - To transfer: the new owner must have opened the app at least once (so they
     are registered). The current owner uses the in-app transfer with the
     target's `@username`; the target becomes owner on their **next** open.
   - If the database was smoke-tested with `DEV_MODE` *before* the ownership
     bypass existed, it may already hold a stale test owner. Clear it once —
     paintings, photos, locations and the audit trail are preserved, and the
     first person to open the app then becomes the owner:

     ```sh
     just owner-reset
     ```

7. **Operate**

   | Command | What it does |
   |---------|--------------|
| `just logs` | tail container logs |
| `just backup` | `pg_dump` into `backups/` (gitignored) |
| `just down` | stop the stack (data preserved) |
| `just owner-reset` | clear the current owner (next opener claims it) |

   Rollback: check out the previous commit and run `sudo just deploy` again;
   migrations ship with `down` files.

> ⚠ Postgres only reads `POSTGRES_PASSWORD` when it first creates the data
> volume. Set it before the first `just deploy` and don't change it later; if
> you must, `just backup` then `just db-reset` (destroys local data).

---

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

- Secrets live only in `.env` — never in code, git, or CI.
- Deploys are manual, on the server — CI never touches production.
- `PUBLIC_URL` must be `https://<domain>`; DNS must point at the host and ports
  80/443 must be open.
- The API serves the built SPA in production (`just up` / `just deploy`); the
  local prod-like stack is `just up` (stop with `just down`, follow with
  `just logs`). Caddy binds 80/443, so `just up` needs rootful podman (or
  `net.ipv4.ip_unprivileged_port_start=80`); otherwise use `just dev`.

## Layout

```
apps/web/          React 19 SPA (Vite)
apps/api/          NestJS 11 API + Dockerfile
packages/shared/   shared DTO types / constants
podman-compose.yml db + api + caddy topology (D9); reads .env
.github/workflows/ci.yml  verify → e2e (deploys are manual: `just deploy`)
Justfile           install/dev/up/down/logs/migrate/backup/deploy/db-reset (D9)
```
