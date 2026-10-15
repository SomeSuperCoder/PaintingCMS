/**
 * OwnershipGuard — the DEV_MODE bypass.
 * ============================================================================
 * THE regression this file exists to prevent: in DEV_MODE the browser mock
 * (DEV_USER) used to run the real first-open claim, so the test identity became
 * the catalog's owner. Every real Telegram user then got 403 ACCESS_DENIED —
 * and because ONLY the owner can initiate a transfer, there was no way out. The
 * painter had to be manually repaired with SQL.
 *
 * In DEV_MODE the guard must therefore read and write NOTHING: no app_state row
 * is created, so no dev identity can ever own anything.
 */
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { DEV_USER } from '@painting/shared';
import type { AuthUser, RequestWithAuth } from '../auth/auth.guard';
import type { DrizzleDb } from '../db/drizzle.module';
import type { TransferNotifierService } from '../bot/transfer-notifier';
import { OwnershipGuard } from './ownership.guard';

/** A drizzle handle where EVERY chain method explodes if touched. */
function explodingDb(): DrizzleDb {
  const boom = (): never => {
    throw new Error('DEV_MODE must not touch the database');
  };
  return { select: boom } as unknown as DrizzleDb;
}

function makeGuard(devMode: boolean, db: DrizzleDb = explodingDb()): OwnershipGuard {
  return new OwnershipGuard(
    db,
    { notifyTransferToPreviousOwner: vi.fn() } as unknown as TransferNotifierService,
    { get: (k: string, d?: unknown) => (k === 'DEV_MODE' ? devMode : d) } as unknown as ConfigService,
  );
}

function makeContext(user: AuthUser | undefined): ExecutionContext {
  const request = { user } as RequestWithAuth;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const devUser: AuthUser = {
  id: DEV_USER.id,
  username: DEV_USER.username,
  firstName: DEV_USER.firstName,
};

describe('OwnershipGuard in DEV_MODE', () => {
  it('allows the request without reading the database', async () => {
    // makeGuard's default db throws on ANY access — reaching the DB fails the test.
    await expect(makeGuard(true).canActivate(makeContext(devUser))).resolves.toBe(true);
  });

  it('never claims ownership, so a dev identity cannot own the catalog', async () => {
    const select = vi.fn();
    const db = { select } as unknown as DrizzleDb;
    await expect(makeGuard(true, db).canActivate(makeContext(devUser))).resolves.toBe(true);
    expect(select).not.toHaveBeenCalled();
  });

  it('still fails CLOSED when AuthGuard attached no identity', async () => {
    // The bypass sits AFTER the identity check on purpose: a missing identity is
    // a guard-misuse bug, never a licence to grant access.
    await expect(makeGuard(true).canActivate(makeContext(undefined))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});