# Proposal: DEV_MODE — Local Browser Testing Without Telegram

## Problem
The developer cannot test the app locally without a real Telegram client. The backend requires HMAC-verified initData (which only Telegram provides) and won't boot without a valid BOT_TOKEN. The frontend already has a mock initData fallback (tma.ts:11-29) but the backend rejects it.

## Solution
Add a `DEV_MODE=true` environment variable that:
1. **Backend AuthGuard**: skips HMAC verification, trusts the X-Telegram-Init-Data header directly, extracts user info from it, upserts the mock user into the DB
2. **Backend env validation**: makes BOT_TOKEN optional when DEV_MODE=true
3. **Frontend**: no changes needed — the existing MOCK_INIT_DATA fallback already works

## Out of scope
- Production auth changes (HMAC path untouched when DEV_MODE=false)
- Mock data seeding (user creates paintings manually)
- Dev mode indicator in UI

## Acceptance criteria
1. `DEV_MODE=true pnpm dev` boots both API and web without a BOT_TOKEN
2. Opening http://localhost:5173 in a browser shows the app (painting list)
3. Creating/editing/deleting paintings works end-to-end in the browser
4. Owner claim and transfer work in the browser
5. `pnpm dev` (without DEV_MODE) still requires Telegram HMAC — no regression
6. `pnpm lint` and `pnpm --filter @painting/api exec tsc --noEmit` pass
