/**
 * OwnershipService — ownership read + transfer state machine (design D3, tasks 3.4).
 * ==============================================================================
 * The claim + transfer-CLAIM (the atomic swap on the target's next open) state
 * machine lives in OwnershipGuard (built, previous microtask — CONSUMED, not
 * duplicated here). This service owns the other two surfaces:
 *
 *   - getOwnershipState(): GET /api/v1/ownership — current owner + full audit
 *     trail (OwnershipDto, newest first). Exactly two queries, no N+1: one
 *     for the owner (app_state ⋈ users), one for the events
 *     (ownership_events ⋈ users twice — from/to).
 *
 *   - transfer(): POST /api/v1/ownership/transfer — the INITIATE step:
 *     resolve the target @username → atomically set pending_transfer_to_id
 *     (claim-on-next-open) → record 'transfer-initiated' → notify the target.
 *
 * TOCTOU discipline (design D3): the username lookup is a pure read (path
 * discovery only); the ONLY mutation is ONE conditional UPDATE
 * (WHERE id = 1 AND current_owner_id = :caller) — if ownership changed
 * concurrently (e.g. the pending target claimed it) 0 rows are affected and
 * the caller gets 403. The audit event is written in the SAME transaction as
 * the UPDATE, so a pending transfer never exists without its record (and vice
 * versa). The guard ALREADY writes 'transfer-confirmed' at swap time — this
 * service NEVER writes it (double-writing would duplicate the audit trail).
 *
 *   - DEV_MODE: both surfaces return a SYNTHETIC state (DEV_USER owner, empty
 *   audit trail). OwnershipGuard skips the state machine in dev, so there is no
 *   app_state row — without this the inner join would 500 the «Владелец» screen.
 */

import {
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import {
  DEV_USER,
  ERROR_MESSAGES,
  type OwnershipDto,
  type OwnershipEventType,
  type TransferResultDto,
} from '@painting/shared';
import type { AuthUser } from '../auth/auth.guard';
import { TransferNotifierService } from '../bot/transfer-notifier';
import { DRIZZLE_DB, type DrizzleDb } from '../db/drizzle.module';
import { appState, ownershipEvents, users } from '../db/schema';

/** The same physical users table joined twice for the audit trail (from → to). */
const fromUser = alias(users, 'from_user');
const toUser = alias(users, 'to_user');

@Injectable()
export class OwnershipService {
  private readonly devMode: boolean;

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    private readonly notifier: TransferNotifierService,
    config: ConfigService,
  ) {
    this.devMode = config.get<boolean>('DEV_MODE', false);
  }

  /**
   * DEV_MODE stand-in for the real ownership state.
   *
   * OwnershipGuard skips the state machine entirely in DEV_MODE, so there is no
   * `app_state` row. The real getOwnershipState() inner-joins app_state ⋈ users
   * and turns a missing row into a 500, which would break the «Владелец» screen
   * during a browser smoke test. Return a synthetic owner (DEV_USER, the
   * identity AuthGuard attached) with an empty audit trail instead: the screen
   * renders, the transfer dialog opens, and nothing pretends ownership exists.
   */
  private devOwnershipState(): OwnershipDto {
    return {
      owner: {
        id: DEV_USER.id,
        username: DEV_USER.username,
        first_name: DEV_USER.firstName,
      },
      events: [],
    };
  }

  /** Current owner + full audit trail, newest first (contract OwnershipDto). */
  async getOwnershipState(): Promise<OwnershipDto> {
    if (this.devMode) {
      return this.devOwnershipState();
    }

    const [owner] = await this.db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
      })
      .from(appState)
      .innerJoin(users, eq(appState.currentOwnerId, users.id))
      .where(eq(appState.id, 1))
      .limit(1);

    if (owner === undefined) {
      // The FK guarantees the owner row exists; a miss is server-side
      // corruption, not client input — generic 500, internals never leak
      // (mirrors AuthController's choice).
      throw new InternalServerErrorException({
        error: { code: 'INTERNAL_ERROR', message: ERROR_MESSAGES.INTERNAL_ERROR },
      });
    }

    const events = await this.db
      .select({
        id: ownershipEvents.id,
        eventType: ownershipEvents.eventType,
        createdAt: ownershipEvents.createdAt,
        fromOwnerId: ownershipEvents.fromOwnerId,
        fromUsername: fromUser.username,
        fromFirstName: fromUser.firstName,
        toOwnerId: ownershipEvents.toOwnerId,
        toUsername: toUser.username,
        toFirstName: toUser.firstName,
      })
      .from(ownershipEvents)
      .leftJoin(fromUser, eq(ownershipEvents.fromOwnerId, fromUser.id))
      // innerJoin: every audit row has a target (claim + both transfer
      // events) — rows without a resolvable target are not displayable per
      // the contract's non-null `to`, so they are dropped, not guessed.
      .innerJoin(toUser, eq(ownershipEvents.toOwnerId, toUser.id))
      // Audit trail, newest first (ownership spec); id breaks timestamp ties.
      .orderBy(desc(ownershipEvents.createdAt), desc(ownershipEvents.id));

    return {
      owner: {
        id: owner.id,
        username: owner.username,
        // DB column is nullable; contract says string — normalize for the wire.
        first_name: owner.firstName ?? '',
      },
      events: events.map((event) => ({
        id: String(event.id),
        // Safe assertion: the DB CHECK constraint only allows the three
        // contract event types (schema.ts ownership_events_type_check).
        type: event.eventType as OwnershipEventType,
        from: event.fromOwnerId
          ? {
              id: event.fromOwnerId,
              username: event.fromUsername,
              first_name: event.fromFirstName ?? '',
            }
          : null,
        // innerJoin guarantees a non-null target at runtime (see above).
        to: {
          id: event.toOwnerId as string,
          username: event.toUsername,
          first_name: event.toFirstName ?? '',
        },
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Initiate a transfer to `targetUsername` (claim-on-next-open, design D3).
   * Caller is the validated, ownership-guarded current owner. Returns the
   * full ownership state AFTER the initiate write (contract
   * TransferResultDto = OwnershipDto + status 'transfer-initiated'): the
   * target becomes owner on their NEXT open, never here.
   */
  async transfer(targetUsername: string, caller: AuthUser): Promise<TransferResultDto> {
    // DEV_MODE: ownership does not exist, so there is nothing to hand over and
    // no @username to resolve — the dev user is not even in the `users` table.
    // Return the synthetic state so the transfer dialog closes cleanly during a
    // browser smoke test instead of 422-ing on a target that can never exist.
    // The real transfer state machine is covered by the E2E suite (journey 04),
    // which runs with DEV_MODE unset.
    if (this.devMode) {
      return { ...this.devOwnershipState(), status: 'transfer-initiated' };
    }

    const username = normalizeUsername(targetUsername);

    // Resolve the target via the recorded-users table (design D3: the users
    // table IS the username→ID resolver; unknown users must open the app
    // first — spec + contract TRANSFER_USER_NOT_FOUND 422).
    const [target] = await this.db
      .select({ id: users.id })
      .from(users)
      // Telegram usernames are case-insensitive; the DB stores the user's
      // original case, so compare lowercased on both sides. The users table
      // is tiny (single-owner app) — a seq scan is irrelevant here.
      .where(sql`lower(${users.username}) = ${username}`)
      .limit(1);

    if (target === undefined) {
      throw this.transferUnprocessable();
    }

    // Transferring to yourself is meaningless and would pollute the audit
    // trail with a from=to=self swap; the contract has no dedicated code, so
    // it reuses the 422 "transfer target rejected" bucket (noted for a
    // contract amendment — see handoff).
    if (target.id === caller.id) {
      throw this.transferUnprocessable();
    }

    const initiated = await this.db.transaction(async (tx) => {
      // ONE conditional UPDATE — no read-then-write. Backstops the guard
      // against losing ownership concurrently (the pending target's claim,
      // another session). REPLACES any existing pending transfer (spec: only
      // ONE pending at a time; replace-over-reject chosen — the superseded
      // initiation stays in the append-only audit trail).
      const result = await tx
        .update(appState)
        .set({ pendingTransferToId: target.id })
        .where(and(eq(appState.id, 1), eq(appState.currentOwnerId, caller.id)));

      if (result.rowCount !== 1) {
        return false;
      }

      await tx.insert(ownershipEvents).values({
        eventType: 'transfer-initiated',
        actorId: caller.id,
        fromOwnerId: caller.id,
        toOwnerId: target.id,
      });
      return true;
    });

    if (!initiated) {
      // Lost ownership between the guard's check and this UPDATE — the guard
      // usually prevents it; this is the TOCTOU backstop.
      throw new ForbiddenException({
        error: { code: 'ACCESS_DENIED', message: ERROR_MESSAGES.ACCESS_DENIED },
      });
    }

    // Fire-and-forget — the notifier swallows bot failures internally (spec:
    // bot outage must never block the transfer). Call-site decision (bot
    // handoff): notify the TARGET that access is pending confirmation.
    // The PREVIOUS owner is notified at transfer-confirmed by the ownership
    // guard (MAJOR-4): it performs the swap and calls
    // notifyTransferToPreviousOwner immediately after the transaction commits.
    this.notifier.notifyTransfer(target.id, caller.username ?? undefined);

    return { ...(await this.getOwnershipState()), status: 'transfer-initiated' as const };
  }

  /** 422 with the contract envelope (unknown target / self-transfer). */
  private transferUnprocessable(): UnprocessableEntityException {
    return new UnprocessableEntityException({
      error: {
        code: 'TRANSFER_USER_NOT_FOUND',
        message: ERROR_MESSAGES.TRANSFER_USER_NOT_FOUND,
      },
    });
  }
}

/** '@Name' / 'Name' / ' name ' → 'name' (Telegram usernames are case-insensitive). */
function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase();
}
