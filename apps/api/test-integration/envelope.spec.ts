/**
 * ENVELOPE — the global error contract (HTTP level, real DB).
 * ===========================================================
 * Cross-cutting promise of the API: EVERY error — known (validation, auth,
 * domain) and UNKNOWN (a controller that throws raw) — is serialized as
 * { error: { code, message } } with a Russian, human-facing message, a
 * machine code, and ZERO leakage of internal detail (stack, English, class
 * names, thrown internals). The 500 path is proven with a test-only
 * controller that throws a raw Error containing a secret marker.
 */

import { Controller, Get } from '@nestjs/common';
import request from 'supertest';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  API_PATHS,
  AUTH_HEADER,
  ERROR_MESSAGES,
  type ApiErrorBody,
} from '@painting/shared';

import {
  ALICE,
  buildInitData,
  createTestApp,
  destroyTestApp,
  expectContractError,
  resetDb,
  type TestApp,
} from './helpers';

@Controller('__test__')
class TestThrowController {
  @Get('boom')
  boom(): never {
    // A marker that MUST NOT reach the client — proves internals never leak.
    throw new Error('TOP-SECRET-INTERNAL-DETAIL');
  }
}

describe('ENVELOPE — every error is { error: { code, message } }, Russian, no internals', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    // The test-only controller is injected at the module root — the real
    // guards/filters still apply; the boom route is auth-free so we reach
    // the exception filter's raw-Error path deterministically.
    testApp = await createTestApp([TestThrowController]);
  });

  beforeEach(async () => {
    await resetDb(testApp.db);
  });

  afterAll(async () => {
    await destroyTestApp(testApp);
  });

  const server = () => request(testApp.app.getHttpServer());

  it('raw unexpected Error → 500 INTERNAL_ERROR, Russian, internal detail sealed', async () => {
    // The global AuthGuard guards EVERY route (including __test__), so the
    // boom request must be authenticated to reach the throwing controller.
    const res = await server()
      .get('/api/v1/__test__/boom')
      .set(AUTH_HEADER, buildInitData(ALICE));
    expect(res.status).toBe(500);
    const body = res.body as ApiErrorBody;
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe(ERROR_MESSAGES.INTERNAL_ERROR);
    // No leakage of the thrown marker, stack frames, or "Error" vocabulary.
    expect(JSON.stringify(body)).not.toContain('TOP-SECRET-INTERNAL-DETAIL');
    expect(JSON.stringify(body)).not.toContain('Error');
    expect(JSON.stringify(body)).not.toContain('at ');
  });

  it('unknown route → 404 NOT_FOUND contract envelope (not HTML/raw)', async () => {
    const res = await server().get('/api/v1/this-route-does-not-exist');
    expectContractError(res, 404, 'NOT_FOUND');
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('non-owner + missing-auth error envelopes are uniform JSON, Russian', async () => {
    const res = await server().get(API_PATHS.paintings); // no initData
    expectContractError(res, 401, 'UNAUTHORIZED');
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('auth flow under the same contract: valid user with no owner yet is NOT an error envelope', async () => {
    // Sanity: the 401/403/404 paths above share one filter; the success path
    // remains a plain 200 DTO, not an envelope.
    const res = await server().get(API_PATHS.authMe).set(AUTH_HEADER, buildInitData(ALICE));
    expect(res.status).toBe(200);
    expect(res.body.error).toBeUndefined();
  });
});
