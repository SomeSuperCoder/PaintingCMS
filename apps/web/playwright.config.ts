/**
 * Playwright E2E — PaintingCMS user journeys on a mobile viewport.
 *
 * The suite boots the real API + Vite dev server in test mode (globalSetup)
 * against an ISOLATED test DB. Tests run SERIALLY (workers: 1) because
 * ownership is a singleton global state: the first validated user to hit any
 * authed endpoint becomes the owner, and the transfer journey depends on the
 * exact order (01 claim → 02/03 data → 04 transfer → 05 security → 06 a11y).
 */
import { defineConfig } from '@playwright/test';

import { WEB_BASE } from './e2e/harness/env';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/harness/global-setup.ts',
  globalTeardown: './e2e/harness/global-teardown.ts',
  use: {
    baseURL: WEB_BASE,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: 'ru-RU',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
