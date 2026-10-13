## Context

See proposal.md — Why. Greenfield single-owner Telegram Mini App CMS for a painter. Host: node v22.23.1, pnpm 10.33, podman 5.8.4 + podman-compose 1.6.0, postgres:16 image cached, ports free, git not initialized. Verified constraints that shape this design:

- TMA identity is ONLY server-validated initData (HMAC-SHA256; never trust `initDataUnsafe` server-side). Telegram `user.id` has ≤52 significant bits → MUST be a string/bigint, never a JS number.
- A bot server is not required to serve the Mini App; we include a minimal grammY bot for UX (RU `/start` + menu button + transfer notification) with a hard guarantee that CRUD never depends on it.
- Bot API alone cannot resolve arbitrary usernames → the recorded-users table IS the username→ID resolver; transfers to unknown users require the target to open the app first.
- HTTPS is required in production for TMA (BotFather `/setdomain`); Telegram's test environment tolerates HTTP for local dev/E2E.
- Vite v6 dropped Babel → React Compiler must be enabled via `@rolldown/plugin-babel`. shadcn/ui assumes Tailwind v4; it has no i18n — all Russian strings are ours (typed strings module, NOT react-i18next: single 100%-Russian locale makes an i18n framework pure ceremony). pnpm v10+ blocks postinstall scripts → approve esbuild via `pnpm allowBuilds`.

## Goals / Non-Goals

**Goals:**
- Simplest correct design for a single-owner app: stateless auth, no session store, no queues, no microservices, no cloud services.
- Production readiness: validated input everywhere, guarded file storage, secrets in env only, migrations up+down, health endpoint, deploy smoke test.
- Zero-tolerance safety on the two things that would break the app: initData validation correctness and `user.id` precision.
- Accessibility and Russian language as first-class behavioral requirements (see specs/ru-accessibility-ux), not afterthoughts.

**Non-Goals:**
- No payments/checkout, no multi-user collaboration, no analytics, no price history, no external object storage (S3), no Redis, no i18n framework, no admin panel beyond the owner UI, no desktop-first design (desktop must merely remain usable).

## Decisions

### D1 — Monorepo: pnpm workspace with `apps/web` + `apps/api` + shared config
Two packages (`apps/web` Vite React 19, `apps/api` NestJS 11) plus a lean `packages/shared` for DTO types/constants (currencies, location kinds, API paths) shared between frontend and backend. Per-app `tsconfig`; root `pnpm-workspace.yaml`, `.npmrc` with `onlyBuiltDependencies`/`allowBuilds` for esbuild.
- **Alternatives:** two separate repos (rejected: shared types and one CI pipeline are worth far more than isolation here); single package (rejected: web and api have different build/lint/test concerns).

### D2 — Stateless per-request TMA auth, no session store
Every request carries `X-Telegram-Init-Data` (raw initData). A global NestJS guard validates it per the official algorithm (`secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)`; `data_check_string` = fields except `hash`, alpha-sorted `key=<value>`, `\n`-joined; constant-time compare of hex HMAC). `auth_date` freshness: default 10 minutes, env `INIT_DATA_MAX_AGE_SECONDS`. Then an OwnerGuard compares the validated `user.id` (string) to the single current-owner row in `app_state`. No cookies, no tokens, no session table — the Mini App re-validates on every request, which is the simplest correct pattern for a single-user TMA.
- **Alternatives:** httpOnly session cookie after first validation (rejected: adds session state for zero benefit at this scale); JWT (rejected: unnecessary moving part; initData is already a signed credential).
- Frontend: capture `initData` once on mount via `@telegram-apps/sdk`, attach as header on every fetch (small fetch wrapper). On 401 → Russian "session expired, reopen the app" screen with a retry button; on 403 → Russian access-denied screen.

### D3 — Ownership model: `users` + singleton `app_state` + `ownership_events`
Every validated user is recorded in `users` (id TEXT PK, username unique nullable, first_seen_at). A singleton `app_state` row holds `current_owner_id` (FK → users, NOT NULL, single-row CHECK constraint). `ownership_events` is an append-only audit trail (claim, transfer-initiated, transfer-confirmed) with from/to user IDs.
- **Claim:** first validated user inserts `app_state` row; unique-constraint/single-row enforcement makes concurrent first-opens race-safe (exactly one owner; loser gets 403).
- **Transfer:** owner enters @username → lookup in `users`:
  - found → confirm dialog → insert `transfer-confirmed` event (transaction: no immediate swap; the target's next validated open performs the swap atomically, guarded by a `pending_transfer_to` column on `app_state` so it cannot double-apply).
  - not found → 422 Russian message: the new user must open the app first (this is what records them in `users`).
  - After confirm, previous owner loses access immediately (ownership read checks `pending_transfer_to`), target becomes owner on next open. Bot notification to previous owner, non-blocking.

### D4 — Data model (Drizzle, 6 tables)
- `users` (id TEXT PK, username TEXT UNIQUE, first_seen_at, updated_at)
- `app_state` (id INTEGER single row, current_owner_id FK, pending_transfer_to_id FK NULL, updated_at)
- `ownership_events` (id, event_type, from_user_id NULL, to_user_id, created_at)
- `locations` (id, kind ENUM offline|online, value TEXT, created_at, updated_at; CHECK value non-empty; online validated as http/https URL at the API layer)
- `paintings` (id, name TEXT, price_minor INTEGER non-negative, currency ENUM rub|usd|eur, location_id FK NOT NULL, created_at, updated_at)
- `photos` (id, painting_id FK ON DELETE CASCADE, file_path, mime_type, size_bytes, position INTEGER, created_at)
All migrations generated with drizzle-kit, `up`+`down`. `user.id` everywhere TEXT. Money as integer minor units (kopecks/cents), no price history.

### D5 — Photos: multer → local volume, auth-guarded streaming
Upload: `multer` to `storage/photos` with UUID filenames (never client names). Validation: image MIME whitelist, ≤10 MB/file, ≤10 per painting. Streaming: `GET /api/v1/photos/:id/stream` behind the guards, `Cache-Control: private, immutable`. Deletion: on painting delete, DB cascade removes rows, and the service deletes files (orphan-file sweep noted as an operational task). No public static serving.

### D6 — Backend modules (single composition root)
`AppModule` wires everything (the one composition root per the architecture law; `DrizzleModule` is `@Global` exposing the `DRIZZLE_DB` token; everything else injects):
`ConfigModule` (env validation) · `DrizzleModule` · `AuthModule` (InitDataGuard global + OwnerGuard) · `PaintingsModule` · `LocationsModule` · `PhotosModule` · `OwnershipModule` (transfer) · `TelegramModule` (grammY, non-blocking) · `HealthModule` (`GET /health`).
REST under `/api/v1`, validated with class-validator; error catalog in Russian; generic 401/403 messages never leak internals; helmet + CSP; `@nestjs/throttler` rate limit on auth + transfer endpoints.

### D7 — Minimal grammY bot (optional-path, never blocking)
One NestJS module. Dev: long-polling. Prod: webhook with secret path token. Handlers: `/start` → Russian welcome + inline WebApp button (web_app URL); ownership-transfer notification via `sendMessage`. All bot errors caught and logged, never failing the request that triggered them. BotFather checklist (token, `/setdomain`, menu button) documented in `just deploy` output / README.

### D8 — Frontend: React 19 + Compiler, shadcn/ui, typed Russian strings, a11y-first
- Vite + `@vitejs/plugin-react` with `@rolldown/plugin-babel` enabling React Compiler; Tailwind v4 + shadcn/ui; `react-hook-form` + `zod` for forms; TanStack Query v5 for server state; React Router (BrowserRouter; NestJS `ServeStaticModule` with SPA fallback to `index.html`).
- **Typed Russian strings module** `apps/web/src/lib/strings.ts` — every user-facing string is a typed constant; no English in the UI (satisfies the 100%-Russian requirement with compile-time safety).
- **A11y-first theme:** base font 18px+ (configurable), ≥48px touch targets, WCAG AA contrast, visible focus rings, large tap areas on shadcn primitives (button size `lg` defaults), Russian confirmation dialogs (`AlertDialog`) for delete/transfer, flat navigation (list → detail → edit at most).
- **Screens (Russian):** Список картин → Картина (detail) → Новая/Редактирование картины (with location select-or-add inline + multi-photo picker with previews) · Галереи (Места продажи) → add/edit location · Владелец (ownership + transfer + history) · Доступ запрещён (denied) · Сессия истекла (expired).
- TMA integration: `@telegram-apps/sdk` init; capture `initData`; every fetch sends the header; mobile-first viewport.

### D9 — Serving, deploy, CI
- **podman-compose.yml:** `db` = postgres:16 (named volume `pgdata`, `pg_isready` healthcheck, `service_healthy` dependency); `api` = multi-stage build (node:22-alpine), runs drizzle migrations on start, serves built SPA + photos volume; `caddy` = auto TLS 80/443 reverse proxy to `api:3000`.
- **Justfile (minimal):** install, dev (compose db + migrate + shared build + Vite/NestJS), up/down, logs, migrate, backup, deploy, db-reset.
- **GitHub Actions `ci.yml`:** job `verify` (pnpm/action-setup, `--frozen-lockfile`, lint, typecheck, test, build) → job `e2e` (Playwright `--with-deps`, postgres:16 service, mocked TMA, artifact upload). Deploys are manual on the server (`just deploy`) — CI never touches production.
- **Config SSOT:** a single root `.env` feeds bare-metal dev, `just`, and the podman containers (compose interpolates it and streams it into `api`). One `PUBLIC_URL` drives Caddy's domain, CORS, the Telegram webhook, and the Mini App button; `DATABASE_URL` is derived per context and never set by hand.
- Git: `git init` at scaffold time; commits at feature boundaries only after the tier's tests pass.

### D10 — Testing architecture
- **Unit (vitest):** auth guard security matrix (valid, forged, expired, malformed, non-owner, bigint IDs), service logic (paintings/locations/ownership/transfer/claim race), DTO validation, Russian error mapping.
- **Integration:** against a dedicated podman-compose Postgres 16 test DB via `DRIZZLE_DB` token; fresh migrations per run; single-writer discipline.
- **E2E (Playwright):** mobile viewport; `mockTelegramEnv`/`addInitScript` BEFORE SDK init; valid initData hash fixture computed with the real test bot token; flows: first-open claim, painting CRUD with photos, location select-or-add inline, edit, delete-confirm, transfer, denied access, expired session; a11y smoke (axe, critical/serious = 0). Never touches production data; all backend interactions mocked or isolated to the test DB.

## Risks / Trade-offs

- **initData validation correctness** (the #1 zero-tolerance item) → implemented verbatim from official Telegram docs, covered by the full negative matrix in unit tests, reviewed by Security Engineer.
- **Telegram `user.id` precision loss** → enforced as TEXT everywhere + E2E fixture uses a >2^53 id.
- **Transfer double-apply / race** → pending-transfer column + single-row constraint + transaction; covered by integration tests.
- **pnpm v10 postinstall blocks (esbuild, Playwright)** → `.npmrc` allowBuilds; CI cache.
- **Photo storage growth / orphan files** → validation caps; cascade delete; documented backup recipe (`just backup`); orphan sweep noted.
- **Caddy auto-TLS needs real DNS + open ports** → documented; deploy smoke checks `/health`; rollback = previous image.
- **Bot webhook vs polling in podman** → webhook with secret path in prod; polling in dev; bot failure never blocks CRUD (tested).
- **A11y regression under large fonts** → layout tested at 18px+ base and larger text scaling in Playwright; mobile-first design tolerates big text.

## Migration Plan

Greenfield: no existing data. Steps: `git init` → scaffold monorepo + deps → Drizzle schema + first migration → dev compose up → implement (specs/tasks order) → test → CI green → `just deploy` (pull + compose up + migrate + smoke). Rollback: `podman-compose down` + previous image; migrations have down files.

## Open Questions

None that would change specs, approach, or task breakdown. Operational prerequisites at deploy time (to be provided by the Director when deploying to production): a real bot token via BotFather, the public `PUBLIC_URL` (`https://<domain>`), and DNS pointing at the host for Caddy auto-TLS. Dev/E2E use a test bot token; the same real algorithm is exercised.
