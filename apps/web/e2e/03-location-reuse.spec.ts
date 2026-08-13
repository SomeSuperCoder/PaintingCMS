/**
 * Journey 03 — locations: reuse a saved location via the bank dialog,
 * create a NEW online location inline, manage locations on the screen,
 * and the 409 LOCATION_IN_USE blocked-delete flow.
 */
import { expect, test } from '@playwright/test';

import { expectHome, formatRub, openApp } from './helpers/ui';
import { S } from './helpers/strings';
import { OWNER_A } from './harness/users';

const GALLERY = 'Галерея «Солнце», ул. Тверская, 5';
const SITE_URL = 'https://art.example.ru';
const VDNKH = 'Выставка на ВДНХ';

test('paintings reuse saved locations; locations screen lists, blocks in-use delete', async ({ page }) => {
  await openApp(page, OWNER_A);
  await expectHome(page);

  // ── Painting 1: reuse GALLERY from the bank dialog ───────────────────
  await page.getByRole('link', { name: S.addButton, exact: true }).click();
  await page.getByLabel(S.formNameLabel).fill('Берёзовая роща');
  await page.getByLabel(S.formPriceLabel).fill('800');

  await page.getByRole('button', { name: S.locationPick, exact: true }).click();
  const bank = page.getByRole('dialog');
  await expect(bank.getByText(GALLERY)).toBeVisible();
  await bank.getByText(GALLERY).click();
  await expect(page.getByText(GALLERY)).toBeVisible();
  await expect(page.getByText(S.kindOffline, { exact: true })).toBeVisible();

  await page.locator('form button[type="submit"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Берёзовая роща' })).toBeVisible();
  await expect(page.getByText(formatRub('800'))).toBeVisible();
  await expect(page.getByText(GALLERY)).toBeVisible();

  // ── Painting 2: inline NEW online location, USD currency ─────────────
  await page.getByRole('button', { name: S.back, exact: true }).click();
  await expectHome(page);
  await page.getByRole('link', { name: S.addButton, exact: true }).click();
  await page.getByLabel(S.formNameLabel).fill('Море ночью');
  await page.getByLabel(S.formPriceLabel).fill('1500');
  await page.getByRole('radio', { name: S.currencyUsd, exact: true }).check();

  await page.getByRole('button', { name: S.locationAdd, exact: true }).click();
  await page.getByRole('radio', { name: S.onlinePick, exact: true }).click();
  await page.getByPlaceholder(S.sitePlaceholder).fill(SITE_URL);
  await page.getByRole('button', { name: S.locationDone, exact: true }).click();
  await expect(page.getByText(S.kindOnline, { exact: true })).toBeVisible();
  await expect(page.getByText(SITE_URL)).toBeVisible();

  await page.locator('form button[type="submit"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Море ночью' })).toBeVisible();
  await expect(page.getByRole('link', { name: S.openSite, exact: true })).toBeVisible();

  // ── Locations screen: list, add, blocked delete, successful delete ───
  await page.getByRole('button', { name: S.back, exact: true }).click();
  await expectHome(page);
  await page.getByRole('link', { name: S.locationsTitle, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: S.locationsTitle })).toBeVisible();
  await expect(page.getByText(GALLERY)).toBeVisible();
  await expect(page.getByText(SITE_URL)).toBeVisible();

  // Add a third location from the screen
  await page.getByRole('button', { name: S.locationsAdd, exact: true }).click();
  const addDialog = page.getByRole('dialog');
  await expect(addDialog.getByRole('heading', { name: S.locationsNew })).toBeVisible();
  await addDialog.getByLabel(S.addressLabel).fill(VDNKH);
  // The locations dialog's Save button is a type="button" with an onClick
  // handler (LocationFormDialog has no <form> element) — target it by its
  // accessible name, not the painting form's submit-button pattern.
  await addDialog.getByRole('button', { name: S.save, exact: true }).click();
  await expect(page.getByText(S.locationAddedToast)).toBeVisible();
  await expect(page.getByText(VDNKH)).toBeVisible();

  // In-use delete → blocked with the painting name (409 LOCATION_IN_USE)
  const galleryRow = page.locator('li').filter({ hasText: GALLERY });
  await galleryRow.getByRole('button', { name: S.deleteButton, exact: true }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByText(S.locationDeleteTitle)).toBeVisible();
  await confirm.getByRole('button', { name: S.deleteButton, exact: true }).click();

  const blocked = page.getByRole('alertdialog');
  await expect(blocked.getByText(S.locationInUsePrefix)).toBeVisible();
  await expect(blocked.getByText('«Берёзовая роща»')).toBeVisible();
  await blocked.getByRole('button', { name: S.ok, exact: true }).click();
  await expect(page.getByText(GALLERY)).toBeVisible();

  // Unused location → cancel keeps it, confirm deletes it
  const vdnkhRow = page.locator('li').filter({ hasText: VDNKH });
  await vdnkhRow.getByRole('button', { name: S.deleteButton, exact: true }).click();
  const confirm2 = page.getByRole('alertdialog');
  await confirm2.getByRole('button', { name: S.cancel, exact: true }).click();
  await expect(page.getByText(VDNKH)).toBeVisible();

  await vdnkhRow.getByRole('button', { name: S.deleteButton, exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: S.deleteButton, exact: true })
    .click();
  await expect(page.getByText(S.locationDeletedToast)).toBeVisible();
  await expect(page.getByText(VDNKH)).toHaveCount(0);
});
