/**
 * UI helpers shared by the journeys.
 */
import { expect, type Page } from '@playwright/test';

import { launchUrl, type InitDataOptions } from '../harness/init-data';
import type { TestUser } from '../harness/users';
import { S } from './strings';

/** Open the app as `user` with a valid Telegram initData fixture in the URL. */
export async function openApp(
  page: Page,
  user: TestUser,
  options: InitDataOptions = {},
  path = '/',
): Promise<void> {
  // Emulate the Telegram webview environment BEFORE app JS runs: the SDK's
  // init() calls postEvent('iframe_ready') and throws UnknownEnvError outside
  // Telegram — initTMA's catch then falls back to the dev mock and the API 401s
  // every valid fixture. A TelegramWebviewProxy stub makes init() succeed, so
  // retrieveRawInitData() reads the fixture from the launch URL. Runs on every
  // navigation (incl. the /expired reload).
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).TelegramWebviewProxy = {
      postEvent: () => {},
      receiveEvent: () => {},
    };
  });
  await page.goto(launchUrl(user, options, path));
}

/** ru-RU currency rendering — mirrors apps/web/src/lib/format.ts formatPriceMinor. */
export function formatRub(input: string): string {
  const normalized = input.replace(/\s/g, '').replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value)) throw new Error(`formatRub: invalid price "${input}"`);
  const hasMinor = Math.round(value * 100) % 100 !== 0;
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: hasMinor ? 2 : 0,
  }).format(value);
}

export async function expectHome(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: S.homeTitle })).toBeVisible();
}

export async function expectExpired(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: S.expiredTitle })).toBeVisible();
  await expect(page.getByRole('button', { name: S.expiredReopen, exact: true })).toBeVisible();
}

export async function expectDenied(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: S.deniedTitle })).toBeVisible();
}
