/**
 * Journey 01 — first open claims ownership (ownership spec: the first
 * validated user becomes the owner implicitly; no authMe call from the front).
 * Asserts the empty catalog + add-first CTA, the owner identity on the owner
 * screen (the welcome banner string is defined but NOT rendered anywhere, so
 * ownership is asserted via the /owner badge + claim history line), and no
 * horizontal overflow on a 390px viewport.
 */
import { expect, test } from '@playwright/test';

import { expectHome, openApp } from './helpers/ui';
import { S } from './helpers/strings';
import { OWNER_A } from './harness/users';

test('first open claims ownership and shows the empty catalog', async ({ page }) => {
  await openApp(page, OWNER_A);

  // Catalog title + empty state + add-first CTA
  await expectHome(page);
  await expect(page.getByText(S.emptyCatalog)).toBeVisible();
  await expect(page.getByRole('link', { name: S.addFirst, exact: true })).toBeVisible();

  // Owner identity via the footer link → /owner
  await page.getByRole('link', { name: S.ownerTransfer, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: S.ownerTitle })).toBeVisible();
  await expect(page.getByText(S.ownerBadge('owner_anna'))).toBeVisible();
  await expect(page.getByText(/Получен доступ: @owner_anna/)).toBeVisible();

  // Back home
  await page.getByRole('button', { name: S.back, exact: true }).click();
  await expectHome(page);

  // No horizontal scroll on the mobile viewport
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
