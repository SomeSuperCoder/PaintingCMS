/**
 * Journey 02 — full painting CRUD with photos + inline offline location.
 * Covers the price-format regression (typed `1250,50` renders as
 * `1 250,50 ₽`; currency toggle USD→RUB must NOT corrupt the value), the
 * photo upload path (real files, 2 of 10), newest-first list + first-photo
 * thumbnails, edit prefill, and the Russian delete confirmation (cancel +
 * confirm, with the painting name in the title).
 */
import { expect, test } from '@playwright/test';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expectHome, formatRub, openApp } from './helpers/ui';
import { S } from './helpers/strings';
import { OWNER_A } from './harness/users';

const NAME = 'Закат над рекой';
const ADDRESS = 'Галерея «Солнце», ул. Тверская, 5';
const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const PNG_FIXTURE = path.join(FIXTURES_DIR, 'photo1.png');
const JPG_FIXTURE = path.join(FIXTURES_DIR, 'photo2.jpg');

test('create → detail → edit → delete with photos and an inline offline location', async ({ page }) => {
  await openApp(page, OWNER_A);
  await expectHome(page);
  await page.getByRole('link', { name: S.addButton, exact: true }).click();

  // ── Create form ──────────────────────────────────────────────────────
  await expect(page.getByRole('heading', { level: 1, name: S.formCreateTitle })).toBeVisible();
  await page.getByLabel(S.formNameLabel).fill(NAME);
  await page.getByLabel(S.formPriceLabel).fill('1250,50');

  // Currency regression: toggle USD → RUB; the value must survive.
  await page.getByRole('radio', { name: S.currencyUsd, exact: true }).check();
  await page.getByRole('radio', { name: S.currencyRub, exact: true }).check();
  await expect(page.getByLabel(S.formPriceLabel)).toHaveValue('1250,50');

  // Inline offline location
  await page.getByRole('button', { name: S.locationAdd, exact: true }).click();
  await page.getByPlaceholder(S.addressPlaceholder).fill(ADDRESS);
  await page.getByRole('button', { name: S.locationDone, exact: true }).click();
  await expect(page.getByText(S.kindOffline, { exact: true })).toBeVisible();
  await expect(page.getByText(ADDRESS)).toBeVisible();

  // Photos: real PNG + JPEG fixtures
  await page.setInputFiles('input[type="file"]', [PNG_FIXTURE, JPG_FIXTURE]);
  await expect(page.getByText(S.photosCountOf(2))).toBeVisible();

  // ── Submit → detail ──────────────────────────────────────────────────
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByText(S.savedToast)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: NAME })).toBeVisible();
  await expect(page.getByText(formatRub('1250,50'))).toBeVisible();
  await expect(page.getByText(ADDRESS)).toBeVisible();
  // Detail gallery: ONE main <img> (alt = photoAlt) + TWO thumbnail buttons.
  // Thumbnail imgs are alt="" — the accessible name lives on the button
  // aria-label («Фото картины …, Фото: 1 из 10» — photo-gallery.tsx).
  await expect(page.getByRole('img', { name: S.photoAlt(NAME) })).toHaveCount(1);
  await expect(page.getByRole('button', { name: new RegExp(S.photoAlt(NAME)) })).toHaveCount(2);

  // ── Home list: newest-first card with first-photo thumbnail ──────────
  await page.getByRole('button', { name: S.back, exact: true }).click();
  await expectHome(page);
  await expect(page.getByText(NAME)).toBeVisible();
  await expect(page.getByText(formatRub('1250,50'))).toBeVisible();
  await expect(page.getByText(ADDRESS)).toBeVisible();
  await expect(page.getByRole('img', { name: S.photoAlt(NAME) })).toBeVisible();

  // ── Edit: prefilled, price change ────────────────────────────────────
  await page.getByText(NAME).click();
  await page.getByRole('button', { name: S.editButton, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: S.formEditTitle })).toBeVisible();
  await expect(page.getByLabel(S.formNameLabel)).toHaveValue(NAME);
  await expect(page.getByLabel(S.formPriceLabel)).toHaveValue('1250,50');
  await page.getByLabel(S.formPriceLabel).fill('2000');
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByText(S.updatedToast)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: NAME })).toBeVisible();
  await expect(page.getByText(formatRub('2000'))).toBeVisible();

  // The success toast floats over the bottom action bar where Delete lives.
  // Sonner pauses a toast's dismiss timer while the pointer hovers the toast
  // (its toaster sets expanded on mouseenter), so Playwright's click retries
  // would deadlock against the toast. Swipe it away like a real mobile user
  // would — the toast is dismissible and swipe-right is the default direction.
  const editToast = page.getByText(S.updatedToast);
  const toastBox = await editToast.boundingBox();
  if (toastBox) {
    await page.mouse.move(toastBox.x + toastBox.width / 2, toastBox.y + toastBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(toastBox.x + toastBox.width / 2 + 120, toastBox.y + toastBox.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
  }
  await expect(editToast).toBeHidden();

  // ── Delete: cancel first, then confirm ───────────────────────────────
  await page.getByRole('button', { name: S.deleteButton, exact: true }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText(S.deleteTitle(NAME))).toBeVisible();
  await confirm.getByRole('button', { name: S.cancel, exact: true }).click();
  // base-ui keeps the dialog mounted during its close animation — wait for it
  // to fully leave the a11y tree, otherwise the page-scoped Удалить lookup
  // below matches both the detail button and the animating dialog's button.
  await expect(confirm).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: NAME })).toBeVisible();

  await page.getByRole('button', { name: S.deleteButton, exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: S.deleteButton, exact: true })
    .click();

  // Back on home — the catalog is empty again
  await expect(page.getByText(S.deletedToast)).toBeVisible();
  await expect(page.getByText(S.emptyCatalog)).toBeVisible();
  await expect(page.getByRole('link', { name: S.addFirst, exact: true })).toBeVisible();
});
