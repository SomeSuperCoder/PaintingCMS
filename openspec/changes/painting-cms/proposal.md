## Why

A painter needs a dead-simple, private way to track her paintings on sale from her phone — inside Telegram, with no accounts or passwords, 100% in Russian, with a large and accessible UI. This change builds the entire production-ready PaintingCMS app: a Telegram Mini App CMS owned by a single user (the first to open the app), managing painting records with photos, prices in RUB/USD/EUR, and a persistent bank of sales locations.

## What Changes

- **Greenfield monorepo** (pnpm workspace): `apps/web` (React 19 + React Compiler TMA frontend) + `apps/api` (NestJS 11 + Drizzle + Postgres 16) + shared config.
- **Single-owner whitelist**: the first validated Telegram user to open the app becomes the sole owner; every other user sees a Russian "access denied" screen and never any data.
- **Ownership transfer from the UI** via Telegram @username, with claim-on-next-open semantics and an audit trail.
- **Painting CRUD**: name, multiple photos, price (integer minor units + currency RUB/USD/EUR), and a location (where the painting is currently sold).
- **Location bank**: persistent CRUD of locations, each either offline (address) or online (website URL); on the painting form the user can select an existing location or add a new one inline.
- **Photo upload**: multiple photos per painting, self-hosted storage, auth-guarded streaming, strict validation (mime/size/count), cleanup on painting delete.
- **Minimal Telegram bot** (grammY inside NestJS): Russian `/start` welcome + WebApp menu button + ownership-transfer notification; the CRUD app must never depend on the bot being online.
- **100% Russian UI**, mobile-first, accessibility-first: large base font (≥18px), high contrast, ≥48px touch targets, flat navigation, confirmation dialogs for destructive actions, visible focus states.
- **Production deployment**: podman-compose (Postgres 16 + api + Caddy auto-TLS on 80/443), Justfile recipes, GitHub Actions CI/CD (verify → E2E → deploy).

## Capabilities

### New Capabilities

- `tma-auth`: Server-side Telegram Mini App initData validation (HMAC-SHA256 per official Telegram algorithm), stateless per-request authentication, first-user ownership claim, non-owner denied access with Russian messaging.
- `ownership-transfer`: Single-owner model; the owner can transfer ownership to another Telegram user via @username; transfer is claimed on the target's next app open; audit trail of ownership events.
- `paintings`: Painting record CRUD — name, multiple photos, price (integer minor units + RUB/USD/EUR currency), and a location reference.
- `locations`: Persistent location bank CRUD — offline locations (address) and online locations (website URL); select-an-existing-or-add-new inline on the painting creation/editing screen.
- `photos`: Multiple photo upload per painting, self-hosted storage, auth-guarded streaming endpoint, validation and cleanup rules.
- `telegram-bot`: Minimal NestJS grammY bot — Russian `/start` welcome, WebApp menu button, ownership-transfer notification; bot failure cannot block the core app.
- `ru-accessibility-ux`: 100% Russian user-facing text; mobile-first; accessibility-first design system (large type, high contrast, large touch targets, flat navigation, confirmations, visible focus).

## Impact

- **Repo**: entire greenfield repository — `apps/web`, `apps/api`, infra (`podman-compose.yml`, Caddy), `Justfile`, `.github/workflows/ci.yml`, OpenSpec specs.
- **External systems**: Telegram Bot API (bot token, Mini App domain whitelist via BotFather `/setdomain`, menu button), Postgres 16 container, Caddy for HTTPS; no cloud services.
- **Secrets/config**: `BOT_TOKEN`, `POSTGRES_*`, `PUBLIC_URL` live in a single root `.env` (gitignored; the SSOT for dev, `just`, and the podman containers); `.env.example` is committed. `DATABASE_URL` is derived, not stored.
- **API surface**: REST endpoints under `/api/v1` — auth check, paintings CRUD, locations CRUD, photo upload/stream/delete, ownership transfer.
