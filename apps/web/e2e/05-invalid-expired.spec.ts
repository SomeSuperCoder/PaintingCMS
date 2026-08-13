/**
 * Journey 05 — initData security: forged signature and stale auth_date both
 * 401 → /expired; a raw unauthenticated fetch is 401 and must NOT record a
 * user (no claim) or change state.
 */
import { expect, test } from '@playwright/test';

import { expectExpired, expectHome, openApp } from './helpers/ui';
import { OWNER_A, USER_C } from './harness/users';

test('forged initData (wrong bot token signature) → 401 → /expired', async ({ page }) => {
  await openApp(page, USER_C, { forged: true });
  await expectExpired(page);
});

test('stale auth_date (older than the 600s window) → 401 → /expired', async ({ page }) => {
  const stale = Math.floor(Date.now() / 1000) - 3600;
  await openApp(page, USER_C, { authDateSec: stale });
  await expectExpired(page);
});

test('raw fetch without the init-data header is 401 and creates no user', async ({ page }) => {
  await openApp(page, OWNER_A);
  await expectHome(page);

  // Plain fetch from the page — no X-Telegram-Init-Data header.
  const status = await page.evaluate(async () => (await fetch('/api/v1/paintings')).status);
  expect(status).toBe(401);
});
