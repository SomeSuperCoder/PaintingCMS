# PaintingCMS — Security review notes (T4)
**Date:** 2026-08-13
**Source:** team/security/security-engineer
**Priority:** low | medium
**Status:** pending
**Effort:** quick (<1hr) | medium (1-4hr)

## Recommendation 1 — Magic-byte validation for photo uploads (medium)
Validate the actual file content (magic bytes / image decode, e.g. `file-type` or sharp metadata) in the multer fileFilter, not only the client-declared `Content-Type`. Current: `file.mimetype` is client-controlled (photos.multer.ts:64-81). Mitigations present (helmet nosniff, UUID filenames, whitelist-only served Content-Type, owner-only upload) make exploitability low, but content sniffing closes the MIME-confusion class entirely.

## Rationale
OWASP upload hygiene: MIME header is attacker-controlled. Today an owner could upload an .exe labeled image/png; nosniff stops browser execution, but defense-in-depth is cheap here.

## Evidence
apps/api/src/photos/photos.multer.ts:64-81 (fileFilter checks `file.mimetype` only).

## Recommendation 2 — Configure trust proxy behind Caddy (low)
Add `app.set('trust proxy', 1)` (or a ThrottlerModule key generator using X-Forwarded-For) in main.ts. Without it, every client appears as Caddy's IP, so the global 100/60s and transfer 10/min throttler buckets are global, not per-user. Single-owner scale limits impact, but the intended per-user isolation does not work behind the reverse proxy (design D9).

## Rationale
ThrottlerGuard (app.module.ts:108) keys on req.ip; behind a proxy that is always the proxy IP.

## Evidence
apps/api/src/main.ts (no trust proxy config found), app.module.ts:71-73.

## Recommendation 3 — Fail-fast CORS/env in production (low)
When NODE_ENV=production, require WEBAPP_URL non-empty at boot (env.validation.ts:57-58 currently defaults it to ''). main.ts:24-27 then falls back to `origin: true` (reflect any origin) on misconfiguration. Header-based auth (no cookies) limits impact, but open CORS in prod is a misconfiguration class worth a hard failure.

## Rationale
Strict CORS is a stated design goal (design D6); the default-open fallback contradicts it when env is wrong.

## Evidence
apps/api/src/main.ts:24-27, apps/api/src/config/env.validation.ts:57-58.

## Recommendation 4 — Dependency bumps to clear audit (medium)
Bump `@hookform/resolvers` or add a pnpm override for `valibot` >=1.4.2 (clears HIGH ReDoS GHSA-vqpr-j7v3-hqw9 + moderate GHSA-5qjj-4xww-7phc — valibot is unused in apps/web, which uses zod) and ensure `esbuild` >=0.25.0 (moderate dev-server CORS GHSA-67mh-4wv8-2f99, dev-only via drizzle-kit). 0 critical; nothing in the API prod runtime.

## Rationale
Known-vulnerable components (OWASP #9); cheap bumps, no runtime risk today.

## Evidence
`pnpm audit` 2026-08-13: 1 high + 2 moderate, 0 critical.
