/**
 * Journey 04 — ownership transfer (ownership spec Flow F):
 *   B opens the app first (spec: the target must open BEFORE the transfer —
 *   the users table IS the username→ID resolver, unknown users 422), then
 *   owner_anna → @user_boris (big id > 2^53 — precision regression), B's next
 *   open confirms the claim, then A loses access (403 → /denied).
 */
import { expect, test } from '@playwright/test';

import { expectDenied, expectHome, openApp } from './helpers/ui';
import { S } from './helpers/strings';
import { OWNER_A, USER_B } from './harness/users';
import { WEB_BASE } from './harness/env';

test('owner transfers to user B; B confirms and claims; A loses access', async ({
  page,
  browser,
}) => {
  // ── A opens the owner screen ─────────────────────────────────────────
  await openApp(page, OWNER_A);
  await expectHome(page);
  await page.getByRole('link', { name: S.ownerTransfer, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: S.ownerTitle })).toBeVisible();
  await expect(page.getByText(S.ownerBadge('owner_anna'))).toBeVisible();
  await expect(page.getByText(/Получен доступ: @owner_anna/)).toBeVisible();

  // ── B opens the app FIRST (records the target user; spec ownership-transfer:
  //    transfer to an unknown @username 422s TRANSFER_USER_NOT_FOUND) ────────
  const contextB = await browser.newContext({
    baseURL: WEB_BASE,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: 'ru-RU',
  });
  const pageB = await contextB.newPage();
  await openApp(pageB, USER_B);
  await expectDenied(pageB); // B is not the owner yet and no transfer is pending

  // ── Transfer dialog: type @user_boris, confirm twice ─────────────────
  await page.getByRole('button', { name: S.ownerTransfer, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(S.usernameLabel).fill('@user_boris');
  // The dialog's submit button is labeled `ownerTransfer` («Передать
  // владельцу»); the shorter `confirmTransfer` («Передать») is the
  // AlertDialog confirm label only.
  await dialog.getByRole('button', { name: S.ownerTransfer, exact: true }).click();

  const alert = page.getByRole('alertdialog');
  await expect(alert.getByText(S.confirmTitle('user_boris'))).toBeVisible();
  await alert.getByRole('button', { name: S.confirmTransfer, exact: true }).click();
  await expect(page.getByText(S.transferStarted)).toBeVisible();

  // ── B opens the app again → confirms the transfer (claim) ─────────────
  await openApp(pageB, USER_B);
  await expectHome(pageB);
  await expect(pageB.getByText('Берёзовая роща')).toBeVisible(); // data from 03

  // B is the owner now
  await pageB.getByRole('link', { name: S.ownerTransfer, exact: true }).click();
  await expect(pageB.getByText(S.ownerBadge('user_boris'))).toBeVisible();
  await expect(pageB.getByText(/Передача подтверждена: @owner_anna → @user_boris/)).toBeVisible();

  // ── A loses access immediately (403 → /denied) ────────────────────────
  await openApp(page, OWNER_A);
  await expectDenied(page);

  await contextB.close();
});
