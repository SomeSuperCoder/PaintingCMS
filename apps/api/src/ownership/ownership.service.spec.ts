/**
 * OwnershipService — transfer logic (spec ownership-transfer, design D3,
 * tasks 8.1-8.2 unit portion).
 * ======================================================================
 * Drizzle is FULLY MOCKED at the DRIZZLE_DB boundary (no DB, no network):
 * - username resolution via the users table (normalized '@Name' → 'name')
 * - unknown target → 422 TRANSFER_USER_NOT_FOUND
 * - self-transfer → 422 (reuses the target-rejected bucket)
 * - ONE conditional UPDATE (WHERE id=1 AND current_owner_id=:caller);
 *   affected=0 → 403 ACCESS_DENIED (TOCTOU backstop), no event written
 * - replace-pending: a second transfer REPLACES the first (single pending)
 * - 'transfer-initiated' audit event written in the same transaction
 * - notifier called fire-and-forget for the target
 */

import { UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { ERROR_MESSAGES } from '@painting/shared';
import type { AuthUser } from '../auth/auth.guard';
import type { TransferNotifierService } from '../bot/transfer-notifier';
import type { DrizzleDb } from '../db/drizzle.module';
import { appState, ownershipEvents } from '../db/schema';
import { OwnershipService } from './ownership.service';

const OWNER_ID = 'owner-1';
const TARGET_ID = 'target-1';

const CALLER: AuthUser = { id: OWNER_ID, username: 'owner', firstName: 'Ольга' };

const OWNER_ROW = {
  id: OWNER_ID,
  username: 'owner',
  firstName: 'Ольга',
};

const EVENT_ROW = {
  id: 42,
  eventType: 'transfer-initiated',
  createdAt: new Date('2026-08-13T10:00:00Z'),
  fromOwnerId: OWNER_ID,
  fromUsername: 'owner',
  fromFirstName: 'Ольга',
  toOwnerId: TARGET_ID,
  toUsername: 'target',
  toFirstName: 'Таня',
};

/** Select-chain builders — each mirrors one Drizzle call the service makes. */
function targetChain(rows: Array<{ id: string }>, onWhere?: (arg: unknown) => void) {
  return {
    from: () => ({
      where: (arg: unknown) => {
        onWhere?.(arg);
        return { limit: () => Promise.resolve(rows) };
      },
    }),
  };
}

function ownerChain(rows: Array<{ id: string; username?: string | null; firstName?: string | null }>) {
  return {
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          limit: () => Promise.resolve(rows),
        }),
      }),
    }),
  };
}

function eventsChain(rows: Array<Record<string, unknown>>) {
  return {
    from: () => ({
      leftJoin: () => ({
        innerJoin: () => ({
          orderBy: () => Promise.resolve(rows),
        }),
      }),
    }),
  };
}

interface TxMock {
  tx: unknown;
  update: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
}

function makeTx(rowCount: number): TxMock {
  const where = vi.fn().mockResolvedValue({ rowCount });
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn().mockReturnValue({ values });
  return {
    tx: { update, insert },
    update,
    set,
    where,
    insert,
    values,
  };
}

interface Harness {
  service: OwnershipService;
  db: { select: ReturnType<typeof vi.fn>; transaction: ReturnType<typeof vi.fn> };
  notifier: { notifyTransfer: ReturnType<typeof vi.fn> };
  chains: Array<() => unknown>;
  txCalls: TxMock[];
}

function makeHarness(): Harness {
  const notifierMock = { notifyTransfer: vi.fn() };
  const notifier = notifierMock as unknown as TransferNotifierService;
  const select = vi.fn();
  const transaction = vi.fn();
  const chains: Array<() => unknown> = [];
  const txCalls: TxMock[] = [];
  select.mockImplementation(() => {
    const next = chains.shift();
    if (!next) throw new Error('test setup: no select chain queued');
    return next();
  });
  transaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<boolean>): Promise<boolean> => {
      const tx = makeTx(1);
      txCalls.push(tx);
      return fn(tx.tx);
    },
  );
  const dbMock = { select, transaction };
  const db = dbMock as unknown as DrizzleDb;
  return {
    // devMode defaults to false: these tests exercise the real state machine.
    service: new OwnershipService(db, notifier, {
      get: (k: string, d?: unknown) => (k === 'DEV_MODE' ? false : d),
    } as unknown as ConfigService),
    db: dbMock,
    notifier: notifierMock,
    chains,
    txCalls,
  };
}

/** Queue the three select chains a successful transfer() consumes. */
function queueHappyPath(h: Harness, targetId = TARGET_ID, onWhere?: (arg: unknown) => void): void {
  h.chains.push(() => targetChain([{ id: targetId }], onWhere));
  h.chains.push(() => ownerChain([OWNER_ROW]));
  h.chains.push(() => eventsChain([EVENT_ROW]));
}

/**
 * Extract the literal values bound inside a Drizzle SQL expression
 * (queryChunks → raw interpolation literals / wrapped Params). Lets us assert
 * the NORMALIZED username reached the WHERE clause without executing SQL.
 * Observed chunk shapes (drizzle-orm 0.45.2): StringChunk = SQL literal text
 * (skipped), PgText/PgInteger = column refs (skipped), raw string/number =
 * bound literal (pushed), SQL = nested expression (recursed).
 */
function sqlParamValues(root: unknown): unknown[] {
  const values: unknown[] = [];
  const walk = (node: unknown): void => {
    if (node === null || typeof node === 'undefined') return;
    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
      values.push(node);
      return;
    }
    if (typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (Array.isArray(record.queryChunks)) {
      for (const chunk of record.queryChunks) walk(chunk);
      return;
    }
    const ctorName = (record.constructor as { name?: string } | undefined)?.name;
    if (ctorName === 'StringChunk') return; // SQL literal text, not a bound value
    if ('value' in record) values.push(record.value);
  };
  walk(root);
  return values;
}

describe('OwnershipService.transfer', () => {
  it('resolves the target, applies ONE conditional update, writes the event, notifies, returns state', async () => {
    const h = makeHarness();
    queueHappyPath(h);

    const result = await h.service.transfer('@TargetName', CALLER);

    // State returned (owner + audit trail, newest first).
    expect(result.owner).toEqual({ id: OWNER_ID, username: 'owner', first_name: 'Ольга' });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({
      id: '42',
      type: 'transfer-initiated',
      from: {
        id: OWNER_ID,
        username: 'owner',
        first_name: 'Ольга',
      },
      to: {
        id: TARGET_ID,
        username: 'target',
        first_name: 'Таня',
      },
      createdAt: '2026-08-13T10:00:00.000Z',
    });

    // Conditional update on app_state, pending target set.
    expect(h.txCalls).toHaveLength(1);
    const tx = h.txCalls[0]!;
    expect(tx.update).toHaveBeenCalledWith(appState);
    expect(tx.set).toHaveBeenCalledWith({ pendingTransferToId: TARGET_ID });
    expect(tx.where).toHaveBeenCalledTimes(1);
    expect(sqlParamValues(tx.where.mock.calls[0]![0])).toEqual(
      expect.arrayContaining([1, OWNER_ID]),
    );

    // Audit event written in the same transaction.
    expect(tx.insert).toHaveBeenCalledWith(ownershipEvents);
    expect(tx.values).toHaveBeenCalledWith({
      eventType: 'transfer-initiated',
      actorId: OWNER_ID,
      fromOwnerId: OWNER_ID,
      toOwnerId: TARGET_ID,
    });

    // Notifier called for the target with the caller's username.
    expect(h.notifier.notifyTransfer).toHaveBeenCalledWith(TARGET_ID, 'owner');
  });

  it.each([
    { input: '@Name', expected: 'name' },
    { input: ' Name ', expected: 'name' },
    { input: 'name', expected: 'name' },
    { input: '@CaseMix', expected: 'casemix' },
  ])(
    'normalizes the target username $input → $expected before the lookup',
    async ({ input, expected }) => {
      const h = makeHarness();
      let whereArg: unknown;
      queueHappyPath(h, TARGET_ID, (arg) => {
        whereArg = arg;
      });
      await h.service.transfer(input, CALLER);
      const params = sqlParamValues(whereArg);
      expect(params).toContain(expected);
      expect(params).not.toContain('@');
    },
  );

  it('rejects an unknown target with 422 TRANSFER_USER_NOT_FOUND (no update, no event)', async () => {
    const h = makeHarness();
    h.chains.push(() => targetChain([]));
    const rejection = h.service.transfer('@ghost', CALLER);
    await expect(rejection).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(rejection).rejects.toMatchObject({
      response: {
        error: {
          code: 'TRANSFER_USER_NOT_FOUND',
          message: ERROR_MESSAGES.TRANSFER_USER_NOT_FOUND,
        },
      },
    });
    expect(h.db.transaction).not.toHaveBeenCalled();
  });

  it('rejects a self-transfer with 422 (never a from=to=self event)', async () => {
    const h = makeHarness();
    queueHappyPath(h, OWNER_ID);
    await expect(h.service.transfer('@owner', CALLER)).rejects.toMatchObject({
      response: {
        error: {
          code: 'TRANSFER_USER_NOT_FOUND',
          message: ERROR_MESSAGES.TRANSFER_USER_NOT_FOUND,
        },
      },
    });
    expect(h.db.transaction).not.toHaveBeenCalled();
  });

  it('rejects with 403 ACCESS_DENIED when the conditional update affects 0 rows (TOCTOU backstop)', async () => {
    const h = makeHarness();
    h.chains.push(() => targetChain([{ id: TARGET_ID }]));
    // Override the transaction mock: the conditional UPDATE affects nothing.
    h.db.transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<boolean>): Promise<boolean> => {
        const tx = makeTx(0);
        h.txCalls.push(tx);
        return fn(tx.tx);
      },
    );
    await expect(h.service.transfer('@target', CALLER)).rejects.toMatchObject({
      response: {
        error: { code: 'ACCESS_DENIED', message: ERROR_MESSAGES.ACCESS_DENIED },
      },
    });
    // No audit event may be written for a rejected transfer.
    expect(h.txCalls[0]!.insert).not.toHaveBeenCalled();
    expect(h.notifier.notifyTransfer).not.toHaveBeenCalled();
  });

  it('REPLACES an existing pending transfer instead of rejecting (single pending)', async () => {
    const h = makeHarness();
    // First transfer → target A.
    queueHappyPath(h, 'target-a');
    await h.service.transfer('@a', CALLER);
    expect(h.txCalls[0]!.set).toHaveBeenCalledWith({ pendingTransferToId: 'target-a' });

    // Second transfer → target B: succeeds and REPLACES the pending target.
    queueHappyPath(h, 'target-b');
    const result = await h.service.transfer('@b', CALLER);
    expect(h.txCalls).toHaveLength(2);
    expect(h.txCalls[1]!.set).toHaveBeenCalledWith({ pendingTransferToId: 'target-b' });
    // Both initiations stay in the append-only audit trail.
    expect(h.txCalls[0]!.values).toHaveBeenCalledWith({
      eventType: 'transfer-initiated',
      actorId: OWNER_ID,
      fromOwnerId: OWNER_ID,
      toOwnerId: 'target-a',
    });
    expect(h.txCalls[1]!.values).toHaveBeenCalledWith({
      eventType: 'transfer-initiated',
      actorId: OWNER_ID,
      fromOwnerId: OWNER_ID,
      toOwnerId: 'target-b',
    });
    expect(result.owner.id).toBe(OWNER_ID);
  });

  it('notifies with an undefined from-username when the caller has none', async () => {
    const h = makeHarness();
    queueHappyPath(h);
    await h.service.transfer('@target', { ...CALLER, username: null });
    expect(h.notifier.notifyTransfer).toHaveBeenCalledWith(TARGET_ID, undefined);
  });
});

describe('OwnershipService.getOwnershipState', () => {
  it('normalizes nullable columns for the wire (first_name → "") and stringifies ids', async () => {
    const h = makeHarness();
    h.chains.push(() =>
      ownerChain([{ id: OWNER_ID, username: null, firstName: null }]),
    );
    h.chains.push(() =>
      eventsChain([
        {
          id: 7,
          eventType: 'claim',
          createdAt: new Date('2026-08-01T08:00:00Z'),
          fromOwnerId: null,
          fromUsername: null,
          fromFirstName: null,
          toOwnerId: OWNER_ID,
          toUsername: null,
          toFirstName: null,
        },
      ]),
    );
    const state = await h.service.getOwnershipState();
    expect(state.owner).toEqual({ id: OWNER_ID, username: null, first_name: '' });
    expect(state.events[0]).toEqual({
      id: '7',
      type: 'claim',
      from: null,
      to: { id: OWNER_ID, username: null, first_name: '' },
      createdAt: '2026-08-01T08:00:00.000Z',
    });
  });

  it('throws the generic 500 envelope when the owner row is missing (server corruption)', async () => {
    const h = makeHarness();
    h.chains.push(() => ownerChain([]));
    await expect(h.service.getOwnershipState()).rejects.toMatchObject({
      response: {
        error: { code: 'INTERNAL_ERROR', message: ERROR_MESSAGES.INTERNAL_ERROR },
      },
    });
  });
});
