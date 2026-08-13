/**
 * Telegram Mini App initData validation — the auth security core (design D2).
 * ============================================================================
 * PURE module: no NestJS/Express imports, no I/O, no global state. Everything
 * enters through parameters, every failure exits as a typed `AuthError`. This
 * is the zero-tolerance security surface the Test Engineer hammers with the
 * full negative matrix (valid / forged / expired / malformed / bigint ids) —
 * keep it deterministic and dependency-free.
 *
 * Algorithm (verbatim from the official Telegram docs, research Q1):
 *   1. secret_key      = HMAC_SHA256(key = "WebAppData", msg = bot_token)
 *   2. data_check_string = every received field EXCEPT `hash`, sorted
 *      alphabetically as `key=<value>`, joined with '\n' — values are the
 *      URL-DECODED values (URLSearchParams does this; matches the reference
 *      implementations, e.g. aiogram parse_qsl).
 *   3. valid  ⟺  hex(HMAC_SHA256(data_check_string, secret_key)) == `hash`,
 *      compared in constant time.
 *
 * Freshness (design D2): `auth_date` (Unix seconds) must be newer than
 * `maxAgeSeconds`. Stale-but-validly-signed data → SESSION_EXPIRED. A
 * validly-signed future `auth_date` is accepted (stale-only check per design;
 * a future date cannot be replayed any more than a fresh one).
 *
 * The hash is verified BEFORE any field is trusted or freshness is checked:
 * unsigned fields can never influence the outcome (forged payloads with a
 * stale auth_date fail as UNAUTHORIZED, not SESSION_EXPIRED).
 *
 * Error codes mirror the shared contract (ERROR_MESSAGES): both map to HTTP
 * 401, the guard chooses the Russian message. The codes here are deliberately
 * contract-free so this module stays pure domain logic.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { INIT_DATA_MAX_AGE_SECONDS } from '@painting/shared';

/** A Telegram user parsed from VALIDATED initData. id is TEXT (design D3). */
export interface TelegramUser {
  /** Telegram user id as string — never a JS number (> 2^53 precision). */
  id: string;
  /** Bare @username (no leading '@'), present only when the user has one. */
  username?: string;
  /** Telegram first name — REQUIRED field of WebAppUser (official schema). */
  firstName: string;
}

/** The two client-visible 401 flavors; both render a generic Russian message. */
export type InitDataErrorCode = 'UNAUTHORIZED' | 'SESSION_EXPIRED';

/**
 * Typed validation failure. `detail` is for server-side debugging ONLY and
 * MUST never reach a client — the guard maps the code to the generic Russian
 * contract message and throws the HTTP exception itself.
 */
export class AuthError extends Error {
  readonly code: InitDataErrorCode;
  readonly detail: string;

  constructor(code: InitDataErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'AuthError';
    this.code = code;
    this.detail = detail;
  }
}

export interface ValidateInitDataOptions {
  /** BotFather token — the HMAC secret source. NEVER leave the server. */
  botToken: string;
  /** Freshness window in seconds (env INIT_DATA_MAX_AGE_SECONDS, default 600). */
  maxAgeSeconds?: number;
}

/** Secret key derivation: HMAC-SHA256 keyed with the constant "WebAppData". */
export function computeSecretKey(botToken: string): Buffer {
  return createHmac('sha256', 'WebAppData').update(botToken).digest();
}

/** Hex HMAC-SHA256 of the data check string under the secret key. */
export function computeHashHex(dataCheckString: string, secretKey: Buffer): string {
  return createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
}

/**
 * Parse raw initData (a URL-encoded query string) into a field map.
 * URLSearchParams never throws on garbage input — malformed strings just
 * yield no/partial fields and are rejected downstream (missing user/hash).
 * It also URL-decodes values ('+' → space is standard query semantics and
 * matches the reference implementations used to compute Telegram's hash).
 */
function parseInitData(initData: string): Map<string, string> {
  const params = new URLSearchParams(initData);
  const fields = new Map<string, string>();
  for (const [key, value] of params.entries()) {
    fields.set(key, value);
  }
  return fields;
}

/**
 * The canonical data check string: every field except `hash`, sorted by key,
 * as `key=<value>` joined by '\n'. Byte/code-point ordering (NOT locale-aware
 * compare) — deterministic on every host, matching Telegram's byte-wise sort.
 */
function buildDataCheckStringFromFields(fields: Map<string, string>): string {
  return [...fields.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

/** Public helper — lets the Test Engineer craft valid fixtures and tests. */
export function buildDataCheckString(initData: string): string {
  return buildDataCheckStringFromFields(parseInitData(initData));
}

/**
 * Parse the `user` field (URL-decoded JSON) into a TelegramUser.
 * Telegram ids have at most 52 significant bits (research Q4) so a parsed
 * number stringifies EXACTLY — String() round-trips without precision loss.
 * `id` may arrive as a JSON string too (signed by Telegram as-is); both are
 * accepted and normalized to TEXT.
 */
function parseTelegramUser(userRaw: string): TelegramUser {
  let parsed: unknown;
  try {
    parsed = JSON.parse(userRaw);
  } catch {
    throw new AuthError('UNAUTHORIZED', 'user field is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new AuthError('UNAUTHORIZED', 'user field is not an object');
  }
  const record = parsed as Record<string, unknown>;

  const id = record.id;
  if (typeof id !== 'string' && typeof id !== 'number') {
    throw new AuthError('UNAUTHORIZED', 'user.id is missing');
  }
  const idString = String(id);
  if (idString.length === 0) {
    throw new AuthError('UNAUTHORIZED', 'user.id is empty');
  }

  const firstName = record.first_name;
  if (typeof firstName !== 'string') {
    throw new AuthError('UNAUTHORIZED', 'user.first_name is missing');
  }

  const usernameRaw = record.username;
  const username =
    typeof usernameRaw === 'string' && usernameRaw.length > 0 ? usernameRaw : undefined;

  return username === undefined ? { id: idString, firstName } : { id: idString, username, firstName };
}

/**
 * Validate raw initData end-to-end. Throws AuthError on ANY failure —
 * malformed input can NEVER escape as a 500 (spec tma-auth). On success
 * returns the server-verified identity.
 */
export function validateInitData(
  initData: string,
  options: ValidateInitDataOptions,
): TelegramUser {
  const { botToken, maxAgeSeconds = INIT_DATA_MAX_AGE_SECONDS } = options;

  if (initData.length === 0) {
    throw new AuthError('UNAUTHORIZED', 'empty initData');
  }
  if (botToken.length === 0) {
    // Fail closed: an empty token can never produce a valid signature.
    throw new AuthError('UNAUTHORIZED', 'empty bot token');
  }

  const fields = parseInitData(initData);

  // 1) Verify the signature FIRST — nothing below may trust unsigned fields.
  const receivedHash = fields.get('hash');
  if (receivedHash === undefined) {
    throw new AuthError('UNAUTHORIZED', 'missing hash field');
  }
  const secretKey = computeSecretKey(botToken);
  const expected = createHmac('sha256', secretKey)
    .update(buildDataCheckStringFromFields(fields))
    .digest();
  // Buffer.from(str, 'hex') silently truncates at the first invalid char, so
  // the length gate first: only a 32-byte (64 hex char) hash reaches the
  // constant-time compare — mismatched lengths never hit timingSafeEqual.
  const received = Buffer.from(receivedHash, 'hex');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new AuthError('UNAUTHORIZED', 'hash mismatch');
  }

  // 2) Freshness — now safe to read fields (signature already proven).
  const authDateRaw = fields.get('auth_date');
  if (authDateRaw === undefined) {
    throw new AuthError('UNAUTHORIZED', 'missing auth_date');
  }
  const authDate = Number(authDateRaw);
  if (!Number.isFinite(authDate) || authDate <= 0) {
    throw new AuthError('UNAUTHORIZED', 'invalid auth_date');
  }
  if (authDate + maxAgeSeconds < Math.floor(Date.now() / 1000)) {
    throw new AuthError('SESSION_EXPIRED', 'auth_date is older than the freshness window');
  }

  // 3) Identity — the whole point of validation.
  const userRaw = fields.get('user');
  if (userRaw === undefined) {
    throw new AuthError('UNAUTHORIZED', 'missing user field');
  }
  return parseTelegramUser(userRaw);
}
