/**
 * init-data SECURITY MATRIX (spec tma-auth, tasks 8.1-8.2 unit portion).
 * ======================================================================
 * The zero-tolerance auth surface. Every negative case MUST throw
 * AuthError('UNAUTHORIZED' | 'SESSION_EXPIRED') — never a raw error, never a
 * 500 — and the guard maps it to the generic Russian 401 envelope (asserted
 * in auth.guard.spec.ts; this file is the pure-module layer).
 *
 * Fixtures are SIGNED IN-TEST with a known bot token (deterministic, no I/O):
 *   secret_key      = HMAC_SHA256(key='WebAppData', msg=bot_token)
 *   data_check_string = non-hash fields alpha-sorted `key=value` joined '\n'
 * The wire format preserves insertion order (deliberately NOT alphabetical),
 * which is how the sort-order requirement is pinned.
 */

import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { INIT_DATA_MAX_AGE_SECONDS } from '@painting/shared';
import {
  AuthError,
  buildDataCheckString,
  computeSecretKey,
  validateInitData,
  type InitDataErrorCode,
} from './init-data';

const BOT_TOKEN = '123456789:TEST-BOT-TOKEN-for-painting-cms';
const SECRET_KEY = computeSecretKey(BOT_TOKEN);
const NOW_ISO = '2026-08-13T12:00:00.000Z';

afterEach(() => {
  vi.useRealTimers();
});

/** Pin the clock so auth_date freshness is fully deterministic. */
function pinClock(): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW_ISO));
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function userJson(
  id: string | number,
  username?: string,
  firstName = 'Алиса',
): string {
  const user: Record<string, unknown> = { id, first_name: firstName };
  if (username !== undefined) user.username = username;
  return JSON.stringify(user);
}

interface WireOptions {
  /** Explicit hash — used to forge (original hash over tampered fields). */
  hash?: string;
  /** Omit the hash field entirely. */
  includeHash?: boolean;
}

/**
 * Sign + serialize fields into the wire format. Keys are appended in
 * insertion order — the raw payload is NOT sorted (sort-order case lives in
 * the module; see the dedicated test).
 */
function buildWire(
  fields: Record<string, string>,
  options: WireOptions = {},
): string {
  const checkString = Object.keys(fields)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const hash =
    options.hash ??
    (options.includeHash === false
      ? ''
      : createHmac('sha256', SECRET_KEY).update(checkString).digest('hex'));
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    params.append(key, value);
  }
  if (hash) params.append('hash', hash);
  return params.toString();
}

function validFields(authDate: string = String(nowSeconds())): Record<string, string> {
  return {
    user: userJson('12345', 'alice', 'Алиса'),
    auth_date: authDate,
    query_id: 'AAH5zVQYAAAAAHnNVBndwYQY',
  };
}

/** Assert the ONLY legal failure mode: typed AuthError with the given code. */
function expectAuthError(fn: () => unknown, code: InitDataErrorCode): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).code).toBe(code);
    expect((error as AuthError).detail.length).toBeGreaterThan(0);
    return;
  }
  expect.fail(`expected AuthError(${code}), but validateInitData did not throw`);
}

describe('validateInitData — security matrix', () => {
  describe('VALID', () => {
    it('accepts well-formed initData and extracts id (TEXT), username, first_name', () => {
      pinClock();
      const user = validateInitData(buildWire(validFields()), {
        botToken: BOT_TOKEN,
      });
      expect(user).toEqual({ id: '12345', username: 'alice', firstName: 'Алиса' });
      expect(typeof user.id).toBe('string');
    });

    it('returns username as undefined when the user has no Telegram username', () => {
      pinClock();
      const wire = buildWire({ ...validFields(), user: userJson('12345') });
      const user = validateInitData(wire, { botToken: BOT_TOKEN });
      expect(user).toEqual({ id: '12345', firstName: 'Алиса' });
      expect('username' in user).toBe(false);
    });

    it('normalizes a numeric id (safe range) to TEXT', () => {
      pinClock();
      const wire = buildWire({ ...validFields(), user: userJson(12345, 'alice') });
      expect(validateInitData(wire, { botToken: BOT_TOKEN }).id).toBe('12345');
    });
  });

  describe('FORGED / WRONG KEY', () => {
    it('rejects a forged payload (tampered user id, original hash)', () => {
      const original = buildWire(validFields());
      const originalHash = new URLSearchParams(original).get('hash')!;
      const forged = buildWire(
        { ...validFields(), user: userJson('99999', 'mallory') },
        { hash: originalHash },
      );
      expectAuthError(() => validateInitData(forged, { botToken: BOT_TOKEN }), 'UNAUTHORIZED');
    });

    it('rejects initData signed with a DIFFERENT bot token', () => {
      pinClock();
      const wire = buildWire(validFields());
      expectAuthError(
        () => validateInitData(wire, { botToken: '999999:WRONG-TOKEN' }),
        'UNAUTHORIZED',
      );
    });

    it('fails closed on an empty bot token', () => {
      pinClock();
      expectAuthError(
        () => validateInitData(buildWire(validFields()), { botToken: '' }),
        'UNAUTHORIZED',
      );
    });
  });

  describe('FRESHNESS', () => {
    it('rejects a validly-signed auth_date older than the freshness window (SESSION_EXPIRED)', () => {
      pinClock();
      const stale = buildWire(
        validFields(String(nowSeconds() - INIT_DATA_MAX_AGE_SECONDS - 100)),
      );
      expectAuthError(() => validateInitData(stale, { botToken: BOT_TOKEN }), 'SESSION_EXPIRED');
    });

    it('accepts a validly-signed FUTURE auth_date (stale-only check — pinned current behavior)', () => {
      pinClock();
      const future = buildWire(validFields(String(nowSeconds() + 3600)));
      expect(validateInitData(future, { botToken: BOT_TOKEN }).id).toBe('12345');
    });

    it('honors a custom freshness window via maxAgeSeconds', () => {
      pinClock();
      const fresh = buildWire(validFields(String(nowSeconds() - 30)));
      expect(
        validateInitData(fresh, { botToken: BOT_TOKEN, maxAgeSeconds: 60 }).id,
      ).toBe('12345');
      const stale = buildWire(validFields(String(nowSeconds() - 61)));
      expectAuthError(
        () => validateInitData(stale, { botToken: BOT_TOKEN, maxAgeSeconds: 60 }),
        'SESSION_EXPIRED',
      );
    });
  });

  describe('MALFORMED (never a raw error, never a 500)', () => {
    const malformedCases: Array<{ name: string; wire: string }> = [
      { name: 'empty string', wire: '' },
      { name: 'garbage (no fields at all)', wire: 'not-a-query-string!!!' },
      {
        name: 'missing hash field',
        wire: buildWire(validFields(), { includeHash: false }),
      },
      {
        name: 'hash not hex (64 non-hex chars)',
        wire: buildWire(validFields(), { hash: 'z'.repeat(64) }),
      },
      {
        name: 'hash wrong length',
        wire: buildWire(validFields(), { hash: 'abc' }),
      },
      {
        name: 'missing auth_date',
        wire: buildWire({ user: userJson('12345') }),
      },
      {
        name: 'auth_date not numeric',
        wire: buildWire({ ...validFields(), auth_date: 'not-a-date' }),
      },
      {
        name: 'auth_date zero',
        wire: buildWire({ ...validFields(), auth_date: '0' }),
      },
      {
        name: 'empty user',
        wire: buildWire({ ...validFields(), user: '' }),
      },
      {
        name: 'user not valid JSON',
        wire: buildWire({ ...validFields(), user: '{oops' }),
      },
      {
        name: 'user is an array',
        wire: buildWire({ ...validFields(), user: '[1,2]' }),
      },
      {
        name: 'user without id',
        wire: buildWire({
          ...validFields(),
          user: JSON.stringify({ first_name: 'X' }),
        }),
      },
      {
        name: 'user with empty id',
        wire: buildWire({
          ...validFields(),
          user: JSON.stringify({ id: '', first_name: 'X' }),
        }),
      },
      {
        name: 'user without first_name',
        wire: buildWire({
          ...validFields(),
          user: JSON.stringify({ id: '1' }),
        }),
      },
    ];

    it.each(malformedCases)(
      'rejects malformed initData: $name',
      ({ wire }) => {
        expectAuthError(
          () => validateInitData(wire, { botToken: BOT_TOKEN }),
          'UNAUTHORIZED',
        );
      },
    );
  });

  describe('BIGINT-SAFE USER ID (> 2^53)', () => {
    it('round-trips a >2^53 user id as TEXT — never rounded, never NaN', () => {
      pinClock();
      const BIG_ID = '9007199254740993';
      const wire = buildWire({ ...validFields(), user: userJson(BIG_ID, 'big') });
      const user = validateInitData(wire, { botToken: BOT_TOKEN });
      expect(user.id).toBe(BIG_ID);
      // A JS Number round-trip would give ...992 — assert we did NOT lose precision.
      expect(user.id).not.toBe('9007199254740992');
      expect(Number.isNaN(Number(user.id))).toBe(false);
      expect(user.username).toBe('big');
    });
  });

  describe('DATA CHECK STRING CONSTRUCTION', () => {
    it('excludes the hash field from the check string (multi-field payload)', () => {
      pinClock();
      const authDate = String(nowSeconds());
      const wire = buildWire({
        user: userJson('12345', 'alice', 'Алиса'),
        auth_date: authDate,
        query_id: 'AAH5zVQYAAAAAHnNVBndwYQY',
      });
      const check = buildDataCheckString(wire);
      expect(check).not.toContain('hash');
      expect(check.split('\n')).toEqual([
        `auth_date=${authDate}`,
        'query_id=AAH5zVQYAAAAAHnNVBndwYQY',
        `user=${userJson('12345', 'alice', 'Алиса')}`,
      ]);
      // Positive path proves the exclusion: had hash been included, the HMAC would differ.
      expect(validateInitData(wire, { botToken: BOT_TOKEN }).id).toBe('12345');
    });

    it('sorts raw payload fields alphabetically (accepts out-of-order wire)', () => {
      pinClock();
      const authDate = String(nowSeconds());
      // Insertion order is NOT alphabetical: user, auth_date, query_id.
      const wire = buildWire({
        user: userJson('12345', 'alice'),
        auth_date: authDate,
        query_id: 'Q1',
      });
      expect(buildDataCheckString(wire).split('\n')).toEqual([
        `auth_date=${authDate}`,
        'query_id=Q1',
        `user=${userJson('12345', 'alice')}`,
      ]);
      expect(validateInitData(wire, { botToken: BOT_TOKEN }).id).toBe('12345');
    });
  });
});
