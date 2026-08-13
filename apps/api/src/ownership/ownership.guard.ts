/**
 * OwnershipGuard — the ownership gate + claim state machine (design D3).
 * ============================================================================
 * Runs AFTER AuthGuard on protected routes (controllers compose
 * @UseGuards(AuthGuard, OwnershipGuard)); AuthGuard has already validated
 * initData and attached the identity to `request.user`.
 *
 * The single-owner model (spec ownership-transfer, contract UserDto):
 *   - FIRST-OPEN CLAIM: no app_state row yet → the caller becomes the sole
 *     owner. Atomic via the single-row constraint: concurrent INSERTs on
 *     id = 1 collide on the PK/CHECK (id = 1); exactly one wins, the loser
 *     throws 403 (spec: only the first validated user is owner).
 *   - CURRENT OWNER, NO PENDING TRANSFER → allow.
 *   - CURRENT OWNER WITH PENDING TRANSFER → 403. From the moment a transfer
 *     is confirmed the previous owner loses access IMMEDIATELY (spec
 *     ownership-transfer: "the previous owner SHALL no longer have access";
 *     contract ACCESS_DENIED comment: "owner whose transfer is pending").
 *   - PENDING TARGET → TRANSFER CLAIM: ONE conditional UPDATE
 *     (WHERE pending_transfer_to_id = :userId) atomically swaps ownership;
 *     rowCount !== 1 means the pending transfer was consumed or overwritten
 *     concurrently → 403. A 'transfer-confirmed' audit event is written in
 *     the SAME transaction as the swap.
 *   - TRANSFER-CONFIRMED SIDE EFFECT (spec ownership-transfer "Transfer
 *     notification", MAJOR-4): immediately after the swap transaction
 *     commits, the guard notifies the PREVIOUS owner through the bot
 *     (TransferNotifierService.notifyTransferToPreviousOwner). The notifier
 *     is fire-and-forget and swallows bot failures — an outage never blocks
 *     or rolls back the access change.
 *   - ANYTHING ELSE → 403 ACCESS_DENIED (valid user, not the owner).
 *
 * TOCTOU discipline: the pre-read SELECT only selects the PATH; the DB
 * constraint / conditional WHERE decides the winner. No mutation is ever
 * based on a read-then-write (design D3: race-safe by construction). The
 * read of `currentOwnerId` for the audit event is safe because ownership can
 * only change via a claim (row absent here) or a transfer claim (only this
 * pending target) — if the swap's WHERE does not match, we 403 and never
 * write the event.
 *
 * Error policy: 403s throw the CONTRACT envelope at the throw site (matching
 * AuthGuard's 401s) so the global HttpExceptionFilter (next microtask) can
 * pass them through unchanged.
 */

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseError } from 'pg';

import { ERROR_MESSAGES } from '@painting/shared';
import type { RequestWithAuth } from '../auth/auth.guard';
import { TransferNotifierService } from '../bot/transfer-notifier';
import { DRIZZLE_DB, type DrizzleDb } from '../db/drizzle.module';
import { appState, ownershipEvents } from '../db/schema';

/**
 * Postgres error codes treated as a lost claim race. 23505 = unique_violation
 * (concurrent first-open claims collide on the id=1 PK); 23514 = check_violation
 * (defense in depth for the single-row CHECK). Any other failure (FK 23503,
 * connection errors, ...) is a real fault → rethrow → 500, never 403.
 */
const CLAIM_RACE_CODES = new Set(['23505', '23514']);

@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    // Previous-owner notification at the confirmed swap (MAJOR-4). Resolved
    // by BotModule's export — OwnershipModule imports BotModule (also for
    // OwnershipService), so this injects in both guard instances.
    private readonly notifier: TransferNotifierService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();

    // Fail closed: this guard MUST run after AuthGuard. Without an identity
    // the caller is unauthenticated, not merely non-owner (misuse of the
    // guard must never grant ownership).
    if (!request.user) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: ERROR_MESSAGES.UNAUTHORIZED },
      });
    }
    const userId = request.user.id;

    const [state] = await this.db
      .select()
      .from(appState)
      .where(eq(appState.id, 1))
      .limit(1);

    // 1) First-ever open — claim by INSERT. The single-row PK/CHECK (id=1)
    //    is the arbiter: exactly one concurrent claim commits.
    if (state === undefined) {
      return this.claimFirstOpen(userId);
    }

    // 2) Current owner WITHOUT a pending transfer → full access.
    if (state.currentOwnerId === userId && state.pendingTransferToId === null) {
      return true;
    }

    // 3) Pending transfer target on their next open — atomic swap.
    if (state.pendingTransferToId === userId) {
      return this.claimTransfer(state.currentOwnerId, userId);
    }

    // 4) Everything else is a valid user who is not (yet) the owner:
    //    - a non-owner, or
    //    - the previous owner whose transfer is pending (lost access
    //      immediately per spec + contract ACCESS_DENIED).
    throw this.accessDenied();
  }

  /** First-open claim: INSERT the singleton row + 'claim' audit event, atomic. */
  private async claimFirstOpen(userId: string): Promise<boolean> {
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(appState).values({ id: 1, currentOwnerId: userId });
        await tx.insert(ownershipEvents).values({
          eventType: 'claim',
          actorId: userId,
          // from_owner_id stays NULL — the first owner has no predecessor.
          toOwnerId: userId,
        });
      });
      return true;
    } catch (error) {
      if (error instanceof DatabaseError && CLAIM_RACE_CODES.has(error.code ?? '')) {
        // The concurrent first-open won the single row. Only the first
        // validated user is the owner (spec) → 403.
        throw this.accessDenied();
      }
      // Anything else (DB down, FK corruption) must surface as a real 500.
      throw error;
    }
  }

  /**
   * Transfer claim: ONE conditional UPDATE swaps ownership only while this
   * caller is STILL the pending target — if the pending transfer was
   * consumed or overwritten concurrently, 0 rows are affected and the
   * caller loses the race → 403. The 'transfer-confirmed' audit event is
   * written in the same transaction so the swap never exists without its
   * record (and vice versa).
   */
  private async claimTransfer(previousOwnerId: string, userId: string): Promise<boolean> {
    const won = await this.db.transaction(async (tx) => {
      const result = await tx
        .update(appState)
        .set({
          currentOwnerId: userId,
          pendingTransferToId: null,
          // updated_at refreshes via the schema's $onUpdate (SSOT).
        })
        .where(and(eq(appState.id, 1), eq(appState.pendingTransferToId, userId)));
      // pg rowCount is number | null; the id=1 PK guarantees at most one
      // matching row, so exactly 1 means "we won the conditional update".
      if (result.rowCount !== 1) {
        return false;
      }
      await tx.insert(ownershipEvents).values({
        eventType: 'transfer-confirmed',
        actorId: userId,
        fromOwnerId: previousOwnerId,
        toOwnerId: userId,
      });
      return true;
    });

    if (!won) {
      throw this.accessDenied();
    }
    // Previous-owner notification (spec "Transfer notification"): fires only
    // AFTER the swap committed — a real confirmation is the sole trigger.
    // Fire-and-forget: the notifier swallows bot failures internally, so a
    // bot outage never fails the access change itself.
    this.notifier.notifyTransferToPreviousOwner(previousOwnerId);
    return true;
  }

  /** 403 with the CONTRACT envelope (code + Russian message), like AuthGuard's 401s. */
  private accessDenied(): ForbiddenException {
    return new ForbiddenException({
      error: { code: 'ACCESS_DENIED', message: ERROR_MESSAGES.ACCESS_DENIED },
    });
  }
}
