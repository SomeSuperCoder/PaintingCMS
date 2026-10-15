# Proposal: DEV_MODE owns nothing — a dev identity can never hold ownership

## Problem

Browser smoke testing (Tutorial 1) runs with `DEV_MODE=true` and the web app's
mock identity (`123456789` / `test_user`). The dev user went through the real
ownership state machine, so the **first browser hit claimed the catalog**:

- `OwnershipGuard.claimFirstOpen` wrote `app_state.current_owner_id = '123456789'`.
- Every real Telegram user then hit branch 4 and received `403 ACCESS_DENIED`.
- Only the owner may initiate a transfer (`OwnershipController` composes
  `OwnershipGuard`), so nobody could transfer away. Recovery needed raw SQL.
- Worse on a server that runs BOTH `just dev` and `just deploy` against the same
  `POSTGRES_DB`: the test owner is sitting in the volume you later deploy, and
  the painter is locked out of their own Mini App.

The identity was also hardcoded in exactly one place (`apps/web/src/lib/tma.ts`),
so the API had no way to reason about "the test user" even if it wanted to.

## Solution

Make ownership a **production-only** concept. One invariant, enforced in three
layers:

1. **One shared identity.** `DEV_USER` in `@painting/shared` is the SSOT, used by
   both the web mock and the API bypass — the two can no longer drift.
2. **DEV_MODE writes nothing.** `AuthGuard` attaches `DEV_USER` without reading
   the header and **skips the `users` upsert**; `OwnershipGuard` returns before
   any DB read, so no `app_state` row is ever created. A dev identity that never
   reaches the database cannot own anything.
3. **The dangerous misconfiguration becomes impossible.** Env validation now
   REFUSES to boot when `DEV_MODE=true` and `NODE_ENV=production`, replacing a
   comment that merely said "NEVER set DEV_MODE=true in production".

`OwnershipService` returns a synthetic owner (empty audit trail) in DEV_MODE so
the «Владелец» screen renders instead of 500ing on the missing `app_state` row.

A new `just owner-reset` recipe clears a database that was smoke-tested before
this change, so the first real Telegram user claims ownership.

## Key decisions

- **Bypass, don't auto-void.** The alternative (keep the state machine, delete
  the `app_state` row when the owner is the dev identity) would silently grant
  ownership to the next requester *in production* whenever a stale dev id was
  found. That is a security-relevant side effect; the dev-only bypass avoids it.
- **Skip the header entirely** rather than parse-and-ignore, so DEV_MODE no
  longer depends on the frontend sending a mock payload. This also makes a
  production build + `DEV_MODE=true` (`just up`) usable in a browser, which
  previously 401'd because `import.meta.env.DEV` is false in a built SPA.
- **Ownership behaviour stays tested by E2E** (journeys 01 claim / 04 transfer),
  which runs with `DEV_MODE` unset and HMAC-signed fixtures. Only the manual
  browser walkthrough of transfer is given up.

## Trade-offs

- Claim/transfer can no longer be exercised by hand in a browser; use E2E.
- E2E journey 05 test 5c ("no header → 401") is now skipped in DEV_MODE, since
  there is no authentication to exercise. CI does not set `DEV_MODE`, so all
  three tests still guard production.

## Non-goals

- Changing production auth (HMAC path untouched when `DEV_MODE=false`).
- A separate dev/prod database configuration.
- Any owner-management UI beyond the existing transfer dialog.