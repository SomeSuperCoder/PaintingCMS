# Spec: DEV_MODE ownership

Extends the `dev-mode` capability with the ownership rules. Terminology:
MUST / MUST NOT / SHALL carry their usual normative force.

## Shared dev identity

- A single `DEV_USER` constant (`{ id, username, firstName }`) SHALL live in
  `@painting/shared` and be the SSOT for the development identity.
- The web app's outside-Telegram fallback and the API's DEV_MODE bypass MUST
  resolve to that same constant — neither side may hardcode the identity.
- The API MUST NOT require an `X-Telegram-Init-Data` header when `DEV_MODE=true`.

## Authentication in DEV_MODE

- When `DEV_MODE=true` the API SHALL authenticate every request as `DEV_USER`,
  ignoring the request header entirely.
- A missing, malformed or forged header MUST NOT produce a 401 in DEV_MODE.
- When `DEV_MODE=true` the API MUST NOT insert or update any `users` row. The
  development identity SHALL NOT reach the database by any code path.
- `@Public()` routes SHALL behave identically in DEV_MODE and production.

## Ownership in DEV_MODE

- When `DEV_MODE=true` the ownership guard SHALL allow every authenticated
  request and MUST NOT read or write `app_state` or `ownership_events`.
- No development identity SHALL ever become the catalog owner, so no request can
  be denied with `403 ACCESS_DENIED` as a result of a previous development
  session.
- The ownership guard SHALL still fail closed with `401 UNAUTHORIZED` when no
  identity is attached — the bypass is gated behind a real identity.
- In DEV_MODE `GET /ownership` SHALL return the `DEV_USER` owner with an empty
  audit trail, and `POST /ownership/transfer` SHALL return that same synthetic
  state, so the «Владелец» screen renders rather than erroring.

## Production safety

- The API MUST refuse to boot when `DEV_MODE=true` and `NODE_ENV=production`.
- With `DEV_MODE=false` the authentication and ownership behaviour described by
  the `tma-auth` and `ownership-transfer` specs MUST be unchanged, including the
  first-open claim and the claim-on-next-open transfer.
- Clearing a stale `app_state` row MUST leave the first validated user to claim
  ownership; `just owner-reset` provides this operation without touching
  paintings, photos, locations or the audit trail.

## Verification

- Unit tests SHALL pin: the DEV_USER identity, the skipped `users` write, the
  ownership read/write bypass, the fail-closed path, and the
  `DEV_MODE`+`NODE_ENV=production` boot refusal.
- E2E ownership journeys SHALL continue to run with `DEV_MODE` unset.