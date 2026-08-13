/**
 * Journey 06 — accessibility smoke (axe, critical + serious only) on the
 * three most important surfaces: catalog, painting form, transfer dialog.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { expectHome, openApp } from './helpers/ui';
import { S } from './helpers/strings';
import { OWNER_A, USER_B } from './harness/users';

async function expectNoSeriousAxe(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );
  const summary = serious
    .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length})`)
    .join(' | ');
  expect(serious, `${label} → ${summary}`).toEqual([]);
}

test.describe('a11y smoke (axe critical/serious = 0)', () => {
  test('catalog', async ({ page }) => {
    // After 04 the ownership is with USER_B — open as the current owner.
    await openApp(page, USER_B);
    await expectHome(page);
    await expect(page.getByText('Берёзовая роща')).toBeVisible();
    await expectNoSeriousAxe(page, 'catalog');
  });

  test('painting create form', async ({ page }) => {
    await openApp(page, OWNER_A, {}, '/paintings/new');
    await expect(page.getByRole('heading', { level: 1, name: S.formCreateTitle })).toBeVisible();
    await expectNoSeriousAxe(page, 'create-form');
  });

  test('transfer dialog', async ({ page }) => {
    // Post-04 the owner is USER_B — OWNER_A would be denied on /owner.
    await openApp(page, USER_B, {}, '/owner');
    await expect(page.getByRole('heading', { level: 1, name: S.ownerTitle })).toBeVisible();
    await page.getByRole('button', { name: S.ownerTransfer, exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoSeriousAxe(page, 'transfer-dialog');
  });
});
