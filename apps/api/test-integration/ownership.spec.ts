/**
 * OWNERSHIP — first-open claim race + transfer flow (HTTP level, real DB).
 * =========================================================================
 * Spec: ownership-transfer + tma-auth "First user claims ownership".
 * The claim state machine lives in OwnershipGuard: first-open = INSERT the
 * singleton app_state row (the PK/CHECK is the race arbiter — exactly one of
 * N concurrent claims commits, losers get 403); transfer = claim-on-next-open
 * via ONE conditional UPDATE + audit events in the same transaction.
 *
 * Asserted over real HTTP with two concurrent authenticated requests:
 * exactly one succeeds, the other gets 403 ACCESS_DENIED (Russian).
 */

import request from 'supertest';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  API_PATHS,
  AUTH_HEADER,
  ERROR_MESSAGES,
  type OwnershipDto,
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

describe('OWNERSHIP — claim race + transfer flow over real HTTP', () => {
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

  /** alice claims ownership (GET /ownership) and returns the response. */
  const claimAsAlice = () =>
    server().get(API_PATHS.ownership).set(AUTH_HEADER, buildInitData(ALICE));

  it('sequential first opens: first claims 200, second denied 403', async () => {
    const first = await claimAsAlice();
    expect(first.status).toBe(200);
    expect((first.body as OwnershipDto).owner.id).toBe(ALICE.id);
    expect((first.body as OwnershipDto).events[0].type).toBe('claim');

    const second = await server()
      .get(API_PATHS.ownership)
      .set(AUTH_HEADER, buildInitData(BOB));
    expectContractError(second, 403, 'ACCESS_DENIED');
  });

  it('CONCURRENT first opens: exactly one 200, one 403 — never both, never none', async () => {
    const [a, b] = await Promise.all([
      server().get(API_PATHS.ownership).set(AUTH_HEADER, buildInitData(ALICE)),
      server().get(API_PATHS.ownership).set(AUTH_HEADER, buildInitData(BOB)),
    ]);
    const statuses = [a.status, b.status].sort((x, y) => x - y);
    expect(statuses).toEqual([200, 403]);
    const loser = a.status === 403 ? a : b;
    expectContractError(loser, 403, 'ACCESS_DENIED');

    // GET /auth/me reflects exactly one owner (whichever user won the race).
    const [aMe, bMe] = await Promise.all([
      server().get(API_PATHS.authMe).set(AUTH_HEADER, buildInitData(ALICE)),
      server().get(API_PATHS.authMe).set(AUTH_HEADER, buildInitData(BOB)),
    ]);
    const owners = [aMe.body, bMe.body].filter(
      (body: { is_owner?: boolean }) => body.is_owner === true,
    );
    expect(owners).toHaveLength(1);
  });

  it('transfer flow: A→B confirmed, B claims on next open, A 403, full audit trail', async () => {
    // 1) alice claims.
    await claimAsAlice().expect(200);
    // 2) bob opens the app once (403 — but he is now a RECORDED user, the
    //    username→ID resolver the transfer needs).
    await server().get(API_PATHS.ownership).set(AUTH_HEADER, buildInitData(BOB)).expect(403);
    // 3) alice initiates the transfer to @bob → 200, transfer-initiated
    //    recorded, owner still alice (target becomes owner on NEXT open).
    const transfer = await server()
      .post(API_PATHS.transfer)
      .set(AUTH_HEADER, buildInitData(ALICE))
      .send({ target_username: '@bob' });
    expect(transfer.status).toBe(200);
    const afterInit = transfer.body as OwnershipDto;
    expect(afterInit.owner.id).toBe(ALICE.id);
    expect(afterInit.events[0].type).toBe('transfer-initiated');
    // 4) from the moment the transfer is confirmed the previous owner loses
    //    access IMMEDIATELY — even before the target opens.
    const aliceBlocked = await claimAsAlice();
    expectContractError(aliceBlocked, 403, 'ACCESS_DENIED');
    // 5) bob's next open claims ownership (atomic swap + transfer-confirmed).
    const bobClaim = await server()
      .get(API_PATHS.ownership)
      .set(AUTH_HEADER, buildInitData(BOB));
    expect(bobClaim.status).toBe(200);
    expect((bobClaim.body as OwnershipDto).owner.id).toBe(BOB.id);
    // 6) alice is now a plain non-owner → 403.
    const aliceAfter = await claimAsAlice();
    expectContractError(aliceAfter, 403, 'ACCESS_DENIED');
    // 7) audit trail as bob: newest first — transfer-confirmed, transfer-
    //    initiated, claim. from/to resolved (no N+1 smoke: the full history
    //    is present and well-formed in one response).
    const history = await server()
      .get(API_PATHS.ownership)
      .set(AUTH_HEADER, buildInitData(BOB));
    expect(history.status).toBe(200);
    const events = (history.body as OwnershipDto).events;
    expect(events.map((e) => e.type)).toEqual([
      'transfer-confirmed',
      'transfer-initiated',
      'claim',
    ]);
    const confirmed = events[0];
    expect(confirmed.from?.id).toBe(ALICE.id);
    expect(confirmed.to.id).toBe(BOB.id);
    // 8) /auth/me reflects the new owner.
    const bobMe = await server()
      .get(API_PATHS.authMe)
      .set(AUTH_HEADER, buildInitData(BOB));
    expect(bobMe.body.is_owner).toBe(true);
    expect(bobMe.body.owner.id).toBe(BOB.id);
  });

  it('unknown @username → 422 TRANSFER_USER_NOT_FOUND with Russian guidance', async () => {
    await claimAsAlice().expect(200);
    const res = await server()
      .post(API_PATHS.transfer)
      .set(AUTH_HEADER, buildInitData(ALICE))
      .send({ target_username: '@ghost_who_never_opened' });
    expectContractError(res, 422, 'TRANSFER_USER_NOT_FOUND');
    expect(res.body.error.message).toBe(ERROR_MESSAGES.TRANSFER_USER_NOT_FOUND);
  });

  it('self-transfer → 422 (rejected target bucket, audit trail not polluted)', async () => {
    await claimAsAlice().expect(200);
    const res = await server()
      .post(API_PATHS.transfer)
      .set(AUTH_HEADER, buildInitData(ALICE))
      .send({ target_username: 'alice' });
    expectContractError(res, 422, 'TRANSFER_USER_NOT_FOUND');
    const state = await server()
      .get(API_PATHS.ownership)
      .set(AUTH_HEADER, buildInitData(ALICE));
    expect((state.body as OwnershipDto).events).toHaveLength(1); // only 'claim'
  });

  it('non-owner cannot initiate a transfer → 403 ACCESS_DENIED', async () => {
    await claimAsAlice().expect(200);
    await server().get(API_PATHS.ownership).set(AUTH_HEADER, buildInitData(BOB)).expect(403);
    const res = await server()
      .post(API_PATHS.transfer)
      .set(AUTH_HEADER, buildInitData(BOB))
      .send({ target_username: 'alice' });
    expectContractError(res, 403, 'ACCESS_DENIED');
  });

  it('transfer body validation: missing/badly-formatted username → 400 VALIDATION_ERROR', async () => {
    await claimAsAlice().expect(200);
    const missing = await server()
      .post(API_PATHS.transfer)
      .set(AUTH_HEADER, buildInitData(ALICE))
      .send({});
    expectContractError(missing, 400, 'VALIDATION_ERROR');

    const badFormat = await server()
      .post(API_PATHS.transfer)
      .set(AUTH_HEADER, buildInitData(ALICE))
      .send({ target_username: 'not a valid @username!' });
    expectContractError(badFormat, 400, 'VALIDATION_ERROR');
  });
});
