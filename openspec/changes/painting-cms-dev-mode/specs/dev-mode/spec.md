# Spec: DEV_MODE

## Auth Guard Behavior

### DEV_MODE=false (default, production)
- AuthGuard validates X-Telegram-Init-Data via HMAC-SHA256 with BOT_TOKEN
- Missing/invalid initData → 401 Russian envelope
- BOT_TOKEN required at boot (env validation fails without it)

### DEV_MODE=true
- AuthGuard SKIPS HMAC verification
- Trusts the X-Telegram-Init-Data header directly (frontend's MOCK_INIT_DATA)
- Extracts user.id and user.username from the header value (URL-decoded key=value pairs)
- Upserts the user into the DB (same as production path)
- BOT_TOKEN is optional — env validation skips the check
- The rest of the app (CRUD, ownership, photos, locations) works identically

## Environment
- `DEV_MODE=true` in `.env` or `.env.local`
- When absent or `false`, behavior is identical to current production

## Security
- DEV_MODE must NEVER be set in production
- The guard logs a warning when DEV_MODE is active
- If BOT_TOKEN is provided in DEV_MODE, HMAC is still skipped (simpler, no edge cases)
