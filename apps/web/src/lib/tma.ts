/**
 * Telegram Mini App init — capture the raw initData string ONCE, before React
 * renders. Outside Telegram (local dev) we fall back to a mock initData so the
 * app still runs in a plain browser.
 *
 * The API wrapper (src/lib/api.ts) reads the captured string via getInitData()
 * and attaches it as X-Telegram-Init-Data on every /api/v1 request.
 */
import { init, retrieveRawInitData } from '@telegram-apps/sdk';
import { DEV_USER } from '@painting/shared';

/**
 * Telegram-shaped `user` object for the mock initData below. initData uses
 * Telegram's own snake_case field names, while DEV_USER (the API's AuthUser
 * shape) uses firstName — hence the explicit mapping. Under DEV_MODE the API
 * ignores this payload entirely and attaches DEV_USER itself, but the string
 * still has to LOOK like real initData so the fallback stays honest.
 */
const MOCK_TELEGRAM_USER = {
  id: DEV_USER.id,
  first_name: DEV_USER.firstName,
  username: DEV_USER.username,
  language_code: 'ru',
};

/**
 * Plausible initData for local development (dev only — NOT cryptographically
 * valid; a production API rejects it, which is the correct server-side gate).
 * The identity comes from DEV_USER (@painting/shared) — the SAME constant the
 * API's DEV_MODE bypass uses, so browser and server can never disagree on who
 * the dev user is. Override the whole string via VITE_TMA_MOCK.
 */
const MOCK_INIT_DATA = [
  'query_id=AAG7f1YVAgAAAAHf1YVXj5xLzA',
  `user=${encodeURIComponent(JSON.stringify(MOCK_TELEGRAM_USER))}`,
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
