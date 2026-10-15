/**
 * DEV_USER — the single dev-only identity shared by both apps.
 * =============================================================================
 * THE invariant this file exists to enforce: a DEV_MODE identity must never
 * hold ownership and must never be persisted. Both the browser mock (the TMA
 * fallback when the app runs outside Telegram) and the API's DEV_MODE bypass
 * resolve to THIS object, so the two can never drift apart — previously the id
 * was hardcoded only in the web app, which meant the API had no way to reason
 * about "the test user".
 *
 * Why it must be shared: `auth.guard.ts` attaches it to every request in
 * DEV_MODE, and `ownership.guard.ts` skips ownership persistence for that same
 * identity. A second hardcoded copy in the web app is exactly what made the
 * dev lockout (mock claims ownership → real painter gets 403 with no way out).
 *
 * Production safety: env validation REFUSES to boot when DEV_MODE=true and
 * NODE_ENV=production (config/env.validation.ts), so this identity can never
 * reach a real deployment.
 *
 * Deliberately id-shaped to mirror a validated Telegram user: `id` is a string
 * because Telegram ids exceed 2^53 (design D3), `username` has no leading '@'
 * (the users table stores it that way).
 */
export const DEV_USER = {
  id: '123456789',
  username: 'test_user',
  firstName: 'Тест',
} as const;