/**
 * Telegram Mini App init — capture the raw initData string ONCE, before React
 * renders. Outside Telegram (local dev) we fall back to a mock initData so the
 * app still runs in a plain browser.
 *
 * The API wrapper (src/lib/api.ts) reads the captured string via getInitData()
 * and attaches it as X-Telegram-Init-Data on every /api/v1 request.
 */
import { init, retrieveRawInitData } from '@telegram-apps/sdk';

const MOCK_USER = {
  id: '123456789',
  first_name: 'Тест',
  last_name: '',
  username: 'test_user',
  language_code: 'ru',
};

/**
 * Plausible initData for local development (dev only — NOT cryptographically
 * valid; the real backend will reject it, which is the correct server-side gate).
 * Override via the VITE_TMA_MOCK env variable.
 */
const MOCK_INIT_DATA = [
  'query_id=AAG7f1YVAgAAAAHf1YVXj5xLzA',
  `user=${encodeURIComponent(JSON.stringify(MOCK_USER))}`,
  'auth_date=1723700000',
  'hash=0000000000000000000000000000000000000000000000000000000000000000',
].join('&');

let initDataString: string | null = null;

/** Initialize the TMA SDK and capture initData. Safe to call outside Telegram. */
export function initTMA(): void {
  try {
    // Wires SDK event handling (viewport/theme); no-op outside Telegram.
    init();
    const raw = retrieveRawInitData();
    if (raw) {
      initDataString = raw;
      return;
    }
  } catch {
    // Not running inside Telegram — fall through to the dev mock.
    initDataString = null;
  }

  if (import.meta.env.DEV) {
    initDataString = import.meta.env.VITE_TMA_MOCK || MOCK_INIT_DATA;
  }
}

/**
 * The raw initData string for the API wrapper. Empty when the app is not inside
 * Telegram and no mock is configured — the API then returns 401, routing the
 * user to the «Сессия истекла» screen (correct server-side gate).
 */
export function getInitData(): string {
  return initDataString ?? '';
}

/**
 * Re-capture a fresh initData — used by the «Сессия истекла» screen before a
 * full reload (ux-design §2.7 / Flow H): the reloaded app then sends the newest
 * Telegram initData. Outside Telegram it re-falls back to the dev mock, so the
 * button stays usable in local development.
 */
export function reinitTMA(): void {
  try {
    init();
    const raw = retrieveRawInitData();
    if (raw) {
      initDataString = raw;
      return;
    }
  } catch {
    // Not running inside Telegram — fall through to the dev mock.
    initDataString = null;
  }

  if (import.meta.env.DEV) {
    initDataString = import.meta.env.VITE_TMA_MOCK || MOCK_INIT_DATA;
  }
}
