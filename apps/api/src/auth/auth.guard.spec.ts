/**
 * AuthGuard — the HTTP layer of the init-data security matrix (spec tma-auth,
 * tasks 8.1-8.2 unit portion).
 * ======================================================================
 * ANY invalid/missing/malformed/forged initData MUST become the SAME generic
 * Russian 401 envelope — never a 500, never a reason leak. The pure module
 * matrix lives in init-data.spec.ts; this file pins the guard's mapping.
 */

import { createHmac } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AUTH_HEADER, DEV_USER, ERROR_MESSAGES } from '@painting/shared';
import type { DrizzleDb } from '../db/drizzle.module';
import { AuthGuard, type RequestWithAuth } from './auth.guard';
import { computeSecretKey } from './init-data';

const BOT_TOKEN = '123456789:TEST-BOT-TOKEN-for-painting-cms';
const WRONG_TOKEN = '999999:ANOTHER-TOKEN';
const SECRET_KEY = computeSecretKey(BOT_TOKEN);
const BIG_ID = '9007199254740993';

function userJson(id: string, username?: string, firstName = 'Алиса'): string {
  const user: Record<string, unknown> = { id, first_name: firstName };
  if (username !== undefined) user.username = username;
  return JSON.stringify(user);
}

/** Sign fields for `secretKey` and serialize in insertion order. */
function buildWire(
  fields: Record<string, string>,
  secretKey: Buffer = SECRET_KEY,
  hash?: string,
): string {
  const checkString = Object.keys(fields)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const digest =
    hash ?? createHmac('sha256', secretKey).update(checkString).digest('hex');
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) params.append(key, value);
  params.append('hash', digest);
  return params.toString();
}

function freshDate(): string {
  return String(Math.floor(Date.now() / 1000) - 30);
}

function validWire(): string {
  return buildWire({
    user: userJson('12345', 'alice', 'Алиса'),
    auth_date: freshDate(),
  });
}

function forgedWire(): string {
  const original = validWire();
  const originalHash = new URLSearchParams(original).get('hash')!;
  return buildWire(
    { user: userJson('99999', 'mallory'), auth_date: freshDate() },
    SECRET_KEY,
    originalHash,
  );
}

interface GuardHarness {
  guard: AuthGuard;
  config: ConfigService;
  db: { insert: ReturnType<typeof vi.fn> };
}

function makeGuard(
  botToken: string,
  devMode = false,
): GuardHarness {
  const get = vi.fn((key: string, def?: unknown): unknown => {
    if (key === 'BOT_TOKEN') return botToken;
    if (key === 'INIT_DATA_MAX_AGE_SECONDS') return 600;
    if (key === 'DEV_MODE') return devMode;
    return def;
  });
  const config = { get } as unknown as ConfigService;
  const insert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    }),
  });
  const db = { insert } as unknown as DrizzleDb;
  const guard = new AuthGuard(config, new Reflector(), db);
  return { guard, config, db: { insert } };
}

function makeContext(
  raw: string | undefined,
): { context: ExecutionContext; request: RequestWithAuth } {
  const request = {
    headers: { [AUTH_HEADER.toLowerCase()]: raw },
  } as RequestWithAuth;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  return { context, request };
}

/** Await a rejection and assert the contract envelope (code + Russian message). */
async function expect401(
  promise: Promise<boolean>,
  code: 'UNAUTHORIZED' | 'SESSION_EXPIRED',
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(UnauthorizedException);
  await expect(promise).rejects.toMatchObject({
    response: { error: { code, message: ERROR_MESSAGES[code] } },
  });
}

describe('AuthGuard', () => {
  it('rejects a request without the init-data header (401 UNAUTHORIZED)', async () => {
    const { guard } = makeGuard(BOT_TOKEN);
    const { context } = makeContext(undefined);
    await expect401(guard.canActivate(context), 'UNAUTHORIZED');
  });

  it('rejects an empty header (401 UNAUTHORIZED)', async () => {
    const { guard } = makeGuard(BOT_TOKEN);
    const { context } = makeContext('');
    await expect401(guard.canActivate(context), 'UNAUTHORIZED');
  });

  it('rejects garbage initData (401 UNAUTHORIZED)', async () => {
    const { guard } = makeGuard(BOT_TOKEN);
    const { context } = makeContext('not-a-query-string!!!');
    await expect401(guard.canActivate(context), 'UNAUTHORIZED');
  });

  it('rejects forged initData (401 UNAUTHORIZED)', async () => {
    const { guard } = makeGuard(BOT_TOKEN);
    const { context } = makeContext(forgedWire());
    await expect401(guard.canActivate(context), 'UNAUTHORIZED');
  });

  it('rejects initData signed with a different token (401 UNAUTHORIZED)', async () => {
    const { guard } = makeGuard(WRONG_TOKEN);
    const { context } = makeContext(validWire());
    await expect401(guard.canActivate(context), 'UNAUTHORIZED');
  });

  it('rejects stale initData with the SESSION_EXPIRED 401 flavor', async () => {
    const stale = buildWire({
      user: userJson('12345', 'alice'),
      auth_date: String(Math.floor(Date.now() / 1000) - 1000),
    });
    const { guard } = makeGuard(BOT_TOKEN);
    const { context } = makeContext(stale);
    await expect401(guard.canActivate(context), 'SESSION_EXPIRED');
  });

  it('returns the SAME generic envelope for every failure mode — never leaks why', async () => {
    const generic = {
      error: { code: 'UNAUTHORIZED', message: ERROR_MESSAGES.UNAUTHORIZED },
    };
    const bodies: unknown[] = [];
    const modes: Array<{ name: string; raw: string | undefined }> = [
      { name: 'missing header', raw: undefined },
      { name: 'empty header', raw: '' },
      { name: 'garbage', raw: 'not-a-query-string!!!' },
      { name: 'forged', raw: forgedWire() },
      { name: 'wrong token', raw: validWire() },
    ];
    for (const mode of modes) {
      const { guard } = makeGuard(mode.name === 'wrong token' ? WRONG_TOKEN : BOT_TOKEN);
      const { context } = makeContext(mode.raw);
      try {
        await guard.canActivate(context);
        expect.fail(`${mode.name}: expected 401 but activation succeeded`);
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        bodies.push((error as UnauthorizedException).getResponse());
      }
    }
    for (const body of bodies) {
      expect(body).toEqual(generic);
    }
    // No AuthError detail may ever surface in a response body.
    expect(JSON.stringify(bodies)).not.toMatch(
      /hash mismatch|missing hash|not valid JSON|empty initData|invalid auth_date/i,
    );
  });

  it('accepts valid initData and attaches the normalized identity to request.user', async () => {
    const { guard, db } = makeGuard(BOT_TOKEN);
    const { context, request } = makeContext(validWire());
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      id: '12345',
      username: 'alice',
      firstName: 'Алиса',
    });
    const values = db.insert.mock.results[0]!.value.values as ReturnType<typeof vi.fn>;
    expect(values).toHaveBeenCalledWith({
      id: '12345',
      username: 'alice',
      firstName: 'Алиса',
    });
  });

  it('round-trips a >2^53 user id through the guard without precision loss', async () => {
    const wire = buildWire({
      user: userJson(BIG_ID, undefined, 'Биг'),
      auth_date: freshDate(),
    });
    const { guard, db } = makeGuard(BOT_TOKEN);
    const { context, request } = makeContext(wire);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ id: BIG_ID, username: null, firstName: 'Биг' });
    const values = db.insert.mock.results[0]!.value.values as ReturnType<typeof vi.fn>;
    expect(values).toHaveBeenCalledWith({ id: BIG_ID, username: null, firstName: 'Биг' });
  });
});

/**
 * DEV_MODE — the identity is a constant, the header is never read, and nothing
 * is persisted. The no-write half is the load-bearing one: a dev user in the
 * `users` table could claim the catalog via OwnershipGuard's first-open path and
 * lock every real user out with no transfer available.
 */
describe('AuthGuard in DEV_MODE', () => {
  const asDevUser = {
    id: DEV_USER.id,
    username: DEV_USER.username,
    firstName: DEV_USER.firstName,
  };

  it('authenticates WITHOUT the header (it is never required)', async () => {
    const { guard } = makeGuard(BOT_TOKEN, true);
    const { context, request } = makeContext(undefined);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(asDevUser);
  });

  it('IGNORES the header contents — even forged garbage', async () => {
    const { guard } = makeGuard(WRONG_TOKEN, true);
    for (const raw of [forgedWire(), 'not-a-query-string!!!', validWire()]) {
      const { context, request } = makeContext(raw);
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toEqual(asDevUser);
    }
  });

  it('NEVER writes the dev user to the users table', async () => {
    const { guard, db } = makeGuard(BOT_TOKEN, true);
    const { context } = makeContext(validWire());
    await expect(guard.canActivate(context)).resolves.toBe(true);
    // No insert → no row → app_state can never point at a dev identity.
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('still lets @Public routes through untouched', async () => {
    // The guard owns its Reflector, so build one here with the @Public lookup
    // stubbed — otherwise the guard would take the (non-public) DEV_MODE path.
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const guard = new AuthGuard(
      { get: (k: string, d?: unknown) => (k === 'DEV_MODE' ? true : d) } as unknown as ConfigService,
      reflector,
      { insert: vi.fn() } as unknown as DrizzleDb,
    );
    const request = { headers: {} } as RequestWithAuth;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });
});
