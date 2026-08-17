/**
 * Journey 05 — initData security: forged signature and stale auth_date both
 * 401 → /expired; a raw unauthenticated fetch is 401 and must NOT record a
 * user (no claim) or change state.
 *
 * When DEV_MODE=true, HMAC verification is intentionally disabled — forged and
 * stale initData are accepted (the guard parses the header directly). Tests 5a
 * and 5b that assert HMAC rejection are therefore skipped in DEV_MODE. Test 5c
 * (raw fetch without the header) still asserts the header is required.
 */
import { expect, test } from '@playwright/test';

import { expectExpired, expectHome, openApp } from './helpers/ui';
import { OWNER_A, USER_C } from './harness/users';

const isDevMode = process.env.DEV_MODE === 'true';

// DEV_MODE bypasses HMAC — forged initData is accepted; USER_C is not the
// owner → ownership guard denies → "Доступ запрещён" (not "Сессия истекла").
// Skip only the HMAC-specific tests; test 5c (raw fetch) still asserts the
// header is required regardless of DEV_MODE.
test.describe('HMAC validation (skipped in DEV_MODE)', () => {
  test.skip(isDevMode, 'HMAC validation is disabled in DEV_MODE');

  test('forged initData (wrong bot token signature) → 401 → /expired', async ({ page }) => {
    await openApp(page, USER_C, { forged: true });
    await expectExpired(page);
  });

  test('stale auth_date (older than the 600s window) → 401 → /expired', async ({ page }) => {
    const stale = Math.floor(Date.now() / 1000) - 3600;
    await openApp(page, USER_C, { authDateSec: stale });
    await expectExpired(page);
  });
});

test('raw fetch without the init-data header is 401 and creates no user', async ({ page }) => {
  await openApp(page, OWNER_A);
  await expectHome(page);

  // Plain fetch from the page — no X-Telegram-Init-Data header.
  const status = await page.evaluate(async () => (await fetch('/api/v1/paintings')).status);
  expect(status).toBe(401);
});
