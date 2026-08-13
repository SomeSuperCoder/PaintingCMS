## 1. Repository & Platform Scaffolding

- [ ] 1.1 Initialize git repo, root .gitignore (node_modules, .env, data/, storage/), README skeleton
- [ ] 1.2 Create pnpm workspace: `apps/web` (Vite React 19), `apps/api` (NestJS 11), `packages/shared`; `pnpm-workspace.yaml`; `.npmrc` allowBuilds (esbuild); install deps with frozen lockfile
- [ ] 1.3 Write Justfile recipes: install, dev, db-up, db-down, db-reset, migrate, db-generate, lint, typecheck, test, test-e2e, build, compose-up, deploy, logs, backup, health
- [ ] 1.4 Write `podman-compose.yml` (db postgres:16 volume+healthcheck; api multi-stage; caddy auto-TLS) + `.env.example` + `.env` for local dev
- [ ] 1.5 Write `.github/workflows/ci.yml`: verify → e2e (Playwright + postgres service) → deploy (main only, SSH, compose up, /health smoke)

## 2. Backend Infrastructure

- [ ] 2.1 Scaffold NestJS app: AppModule as composition root, ConfigModule with env validation, DrizzleModule `@Global` with `DRIZZLE_DB` token, `GET /health`
- [ ] 2.2 Implement Drizzle schema (users, app_state, ownership_events, locations, paintings, photos — TEXT user ids, integer minor-unit money, single-row constraint, FK cascades) + first migration up/down with drizzle-kit

## 3. Backend Auth & Ownership

- [ ] 3.1 Implement InitDataGuard: official HMAC-SHA256 validation from `X-Telegram-Init-Data`, constant-time compare, 10-min auth_date window (env-configurable), generic Russian 401 on all invalid/malformed input (never 500)
- [ ] 3.2 Implement OwnerGuard: compare validated user.id (string) to current owner; Russian 403 for non-owners
- [ ] 3.3 Implement first-open ownership claim (race-safe single-row insert; concurrent losers get 403) + user recording (id, username, first_seen_at)
- [ ] 3.4 Implement ownership transfer: resolve @username via users table, confirm-only flow, pending transfer column, claim-on-next-open atomic swap, ownership_events audit, Russian 422 for unknown users, previous-owner lockout on confirm

## 4. Backend Domain

- [ ] 4.1 Implement paintings CRUD (name, price_minor + currency enum, location FK) with class-validator DTOs and Russian validation errors
- [ ] 4.2 Implement locations CRUD (kind offline/online, address/URL validation, in-use protection on delete) + inline create used by painting form
- [ ] 4.3 Implement photos: multer upload (UUID names, MIME whitelist, ≤10MB, ≤10/painting), auth-guarded streaming endpoint, per-photo delete, cascade cleanup on painting delete

## 5. Backend Telegram Bot

- [ ] 5.1 Implement grammY module: Russian /start + WebApp button, webhook (secret path, prod) / polling (dev), transfer notification, all failures non-blocking and logged

## 6. Frontend Foundation

- [ ] 6.1 Scaffold Vite + React 19 + React Compiler (@rolldown/plugin-babel) + Tailwind v4 + shadcn/ui; a11y-first theme (≥18px base, high contrast, ≥48px targets, focus rings)
- [ ] 6.2 Create typed Russian strings module (all UI text) + fetch wrapper (X-Telegram-Init-Data header, 401/403 routing)
- [ ] 6.3 Integrate @telegram-apps/sdk init + initData capture; router + screen shells; flat navigation

## 7. Frontend Screens

- [ ] 7.1 Paintings list screen (newest first; name, price with currency, location)
- [ ] 7.2 Painting detail screen (photo gallery, price, location link)
- [ ] 7.3 Painting create/edit form: multi-photo picker with previews, price+currency, location select-or-add-inline
- [ ] 7.4 Locations management screen (list, add, edit, delete with in-use warning + Russian confirmations)
- [ ] 7.5 Ownership screen (current owner, transfer by @username with confirmation, history)
- [ ] 7.6 Denied access + session-expired screens; Russian error toasts everywhere

## 8. Testing

- [ ] 8.1 Test Engineer: vitest unit suite — auth guard security matrix (valid/forged/expired/malformed/non-owner/bigint), services, DTO validation, Russian error mapping
- [ ] 8.2 Test Engineer: integration suite against dedicated podman-compose Postgres 16 test DB — claim race, transfer claim-on-next-open, cascade deletes, location in-use protection
- [ ] 8.3 Test Engineer: Playwright E2E (mobile viewport, mocked Telegram env before SDK init, valid real-hash initData fixture with >2^53 user id) — first-open claim, painting CRUD with photos, location select-or-add inline, edit, delete-confirm, transfer, denied access, expired session, a11y smoke (axe critical/serious = 0)

## 9. Security Review

- [ ] 9.1 Security Engineer review: initData HMAC correctness, auth_date expiry, ownership IDOR, transfer race, upload validation, headers/CSP, dependency CVE audit, secrets handling — RED/GREEN verdict

## 10. Code Review

- [ ] 10.1 Code Reviewer: full diff review vs spec + design (SOLID, DI, module boundaries, blast radius), static analysis — verdict + recommendations

## 11. QA & Delivery

- [ ] 11.1 QA Engineer final gate: acceptance checklist from specs (CRUD, location bank + inline, whitelist, transfer, 100% Russian, a11y manual + axe, photos, denied/expired flows) — GO/NO-GO
- [ ] 11.2 Deploy smoke: podman-compose up on host, migrations run, /health green, SPA served, TMA URL reachable; mark all tasks done and report to Director
