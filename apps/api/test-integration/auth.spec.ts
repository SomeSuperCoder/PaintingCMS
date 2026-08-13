/**
 * AUTH — initData validation + bootstrap endpoint (HTTP level, real DB).
 * ======================================================================
 * Spec: tma-auth. Every request carries X-Telegram-Init-Data; the server
 * validates per the official HMAC algorithm with the real BOT_TOKEN. All
 * failure modes are 401 with the GENERIC Russian envelope (never a 500, never
 * a hint about WHY). GET /api/v1/auth/me is the bootstrap call — owner vs
 * non-owner behavior is PINNED CURRENT (the auth controller predates the
 * ownership guard and never 403s; it reports is_owner instead).
 *
 * Rows: real DB, truncated per test. Envelope assertions via helpers.
 */

import request from 'supertest';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  API_PATHS,
  AUTH_HEADER,
  ERROR_MESSAGES,
  type UserDto,
} from '@painting/shared';

import {
  ALICE,
  BOB,
  buildInitData,
  createTestApp,
  destroyTestApp,
  expectContractError,
  resetDb,
  type TestApp,
} from './helpers';

describe('AUTH — initData security + bootstrap over real HTTP', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(testApp.db);
  });

  afterAll(async () => {
    await destroyTestApp(testApp);
  });

  const server = () => request(testApp.app.getHttpServer());

  it('GET /health is public — no auth header, 200 { status: ok }', async () => {
    const res = await server().get(API_PATHS.health);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('missing X-Telegram-Init-Data → 401 UNAUTHORIZED, Russian envelope', async () => {
    const res = await server().get(API_PATHS.locations);
    expectContractError(res, 401, 'UNAUTHORIZED');
    expect(res.body.error.message).toBe(ERROR_MESSAGES.UNAUTHORIZED);
  });

  it('forged initData (tampered user, original hash) → 401, no data leaked', async () => {
    // Sign a payload for alice, then swap the user id and reuse the original
    // hash — the HMAC no longer matches → 401.
    const original = buildInitData(ALICE);
    const tamperedUser = JSON.stringify({ id: '999999999', first_name: 'Злоумышленник' });
    const forged = original.replace(
      /user=[^&]+/,
      `user=${encodeURIComponent(tamperedUser)}`,
    );
    const res = await server().get(API_PATHS.locations).set(AUTH_HEADER, forged);
    expectContractError(res, 401, 'UNAUTHORIZED');
    expect(res.body.error.message).toBe(ERROR_MESSAGES.UNAUTHORIZED);
  });

  it('malformed initData → 401, never 500 (envelope still Russian)', async () => {
    const res = await server()
      .get(API_PATHS.locations)
      .set(AUTH_HEADER, 'not-a-query-string!!!');
    expectContractError(res, 401, 'UNAUTHORIZED');
  });

  it('valid initData + no owner yet → /auth/me 200 is_owner true (first-open owner-in-waiting)', async () => {
    const res = await server().get(API_PATHS.authMe).set(AUTH_HEADER, buildInitData(ALICE));
    expect(res.status).toBe(200);
    const body = res.body as UserDto;
    expect(body.id).toBe(ALICE.id);
    expect(body.is_owner).toBe(true);
    expect(body.owner.id).toBe(ALICE.id);
    expect(body.first_name).toBe(ALICE.firstName);
  });

  it('PINS CURRENT: non-owner /auth/me → 200 with is_owner=false + the real owner (never 403)', async () => {
    // alice claims ownership through a guarded route (the claim lives in
    // OwnershipGuard, not in /auth/me).
    await server().get(API_PATHS.ownership).set(AUTH_HEADER, buildInitData(ALICE)).expect(200);

    const ownerRes = await server()
      .get(API_PATHS.authMe)
      .set(AUTH_HEADER, buildInitData(ALICE));
    expect(ownerRes.status).toBe(200);
    expect((ownerRes.body as UserDto).is_owner).toBe(true);
    expect((ownerRes.body as UserDto).owner.id).toBe(ALICE.id);

    const nonOwnerRes = await server()
      .get(API_PATHS.authMe)
      .set(AUTH_HEADER, buildInitData(BOB));
    expect(nonOwnerRes.status).toBe(200);
    const bob = nonOwnerRes.body as UserDto;
    expect(bob.is_owner).toBe(false);
    expect(bob.owner.id).toBe(ALICE.id);
  });

  it('non-owner hits a DATA endpoint → 403 ACCESS_DENIED, Russian (no data)', async () => {
    await server().get(API_PATHS.ownership).set(AUTH_HEADER, buildInitData(ALICE)).expect(200);

    const res = await server().get(API_PATHS.locations).set(AUTH_HEADER, buildInitData(BOB));
    expectContractError(res, 403, 'ACCESS_DENIED');
    expect(res.body.error.message).toBe(ERROR_MESSAGES.ACCESS_DENIED);
    // The denied user must never receive the location bank.
    expect(Array.isArray(res.body)).toBe(false);
  });
});
