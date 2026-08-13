/**
 * Telegram initData fixtures — mirrors apps/api/src/auth/init-data.ts exactly:
 *   secret_key  = HMAC_SHA256(key="WebAppData", msg=bot_token)
 *   check_string = every field except `hash`, sorted by key, joined as
 *                  `key=<url-decoded-value>` lines with "\n"
 *   hash        = hex(HMAC_SHA256(check_string, secret_key))
 *
 * The fixture is delivered the way a REAL Telegram webview delivers it: in the
 * page URL as launch params (`tgWebAppData` among them). Verified against the
 * installed SDK/bridge dist: retrieveRawLaunchParams reads window.location.href
 * and retrieveRawInitData reads the `tgWebAppData` URL param — so the app's
 * initTMA() picks the fixture up with NO SDK mock needed. Each openApp call
 * navigates to launchUrl(), which carries the params on every page load.
 */
import * as crypto from 'node:crypto';

import { TEST_BOT_TOKEN, WEB_BASE } from './env';
import type { TestUser } from './users';

export interface InitDataOptions {
  /** auth_date in epoch seconds — default: now. Older than the API's
   * INIT_DATA_MAX_AGE_SECONDS (600) → 401 SESSION_EXPIRED → /expired. */
  authDateSec?: number;
  /** Hash computed with a WRONG bot token → signature mismatch → 401. */
  forged?: boolean;
}

/** Build the raw initData query string for a user. */
export function buildInitData(user: TestUser, options: InitDataOptions = {}): string {
  // The SDK's launch-params parser (InitDataUserSchema) requires the `user` id
  // to be a NUMBER — real Telegram WebAppUser JSON carries a numeric id. String
  // ids make retrieveRawInitData() throw → initTMA() fell back to the dev mock
  // → the API 401'd every valid fixture. The API accepts both id types and
  // normalizes to TEXT (design D3). Caveat: USER_B's id (2^53+1) loses one ulp
  // in the coercion — deterministic and identical in every fixture that carries
  // it, so transfers/claims still resolve by username.
  const userJson = JSON.stringify({ ...user, id: Number(user.id) });
  const fields: Record<string, string> = {
    auth_date: String(options.authDateSec ?? Math.floor(Date.now() / 1000)),
    query_id: `AAF-e2e-${Date.now()}`,
    // The SDK's launch-params parser (InitDataQuerySchema, @telegram-apps/
    // transformers) requires BOTH `hash` AND `signature`. A fixture without
    // `signature` makes retrieveRawInitData() throw, initTMA() fell back to the
    // dev mock, and the API 401'd every valid fixture. The API's own check
    // string covers every field except `hash`, so the fixture hash below is
    // computed over the signature too; the API validates only `hash`, so a
    // deterministic dummy signature value is sufficient here.
    signature: 'e2e-test-signature',
    user: encodeURIComponent(userJson),
  };

  const signingToken = options.forged ? `${TEST_BOT_TOKEN}-forged` : TEST_BOT_TOKEN;
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(signingToken).digest();
  const checkString = Object.entries(fields)
    .map(([key, value]) => `${key}=${decodeURIComponent(value)}`)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .join('\n');
  const hash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

  return [...Object.entries(fields), ['hash', hash]]
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

/** Raw launch params string a real Telegram webview URL would carry. */
export function buildLaunchParams(initData: string): string {
  const params = new URLSearchParams();
  params.set('tgWebAppVersion', '8.0');
  params.set('tgWebAppPlatform', 'tdesktop');
  params.set('tgWebAppThemeParams', '{}');
  // NOTE: URLSearchParams.set already percent-encodes on serialize. Passing an
  // already-encoded value double-encoded the initData: the SDK's
  // retrieveRawInitData (new URLSearchParams(...).get('tgWebAppData')) decodes
  // ONCE, so the browser then sent a still-encoded string as the auth header
  // and the API's checkString hash never matched (401 on EVERY valid fixture).
  // The raw initData goes in — URLSearchParams does the single encoding.
  params.set('tgWebAppData', initData);
  return params.toString();
}

/** Full page URL carrying the launch params — the ONLY app entry point. */
export function launchUrl(
  user: TestUser,
  options: InitDataOptions = {},
  path = '/',
): string {
  return `${WEB_BASE}${path}?${buildLaunchParams(buildInitData(user, options))}`;
}
