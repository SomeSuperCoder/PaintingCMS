/**
 * AuthController — the app's bootstrap endpoint (contract API_PATHS.authMe).
 * ==========================================================================
 * GET /api/v1/auth/me (global prefix 'api/v1' + controller path 'auth/me'):
 *   - 401: initData missing/invalid/forged/expired — thrown by the global
 *     AuthGuard BEFORE this handler runs; this endpoint never sees them.
 *   - 403 ACCESS_DENIED: a VALID user who is not the owner — a known
 *     non-owner, or the previous owner whose transfer is pending (access is
 *     lost immediately on confirmation). Thrown by OwnershipGuard (composed
 *     below) before this handler runs; the frontend AuthGate routes it to
 *     the access-denied screen (contract /auth/me 403 semantics, MAJOR-3).
 *   - 200: the caller IS the owner (UserDto). OwnershipGuard guarantees the
 *     ownership state machine ran first: on the first-ever open it performs
 *     the race-safe claim, and on a pending transfer target's open it
 *     performs the atomic swap — so `is_owner` is ALWAYS true here and
 *     `owner` describes the current owner (the caller). This handler is a
 *     read of that guaranteed state, never a decision about it.
 */

import {
  Controller,
  Get,
  Inject,
  InternalServerErrorException,
  Req,
  UseGuards,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { ERROR_MESSAGES, type UserDto } from '@painting/shared';
import { DRIZZLE_DB, type DrizzleDb } from '../db/drizzle.module';
import { appState, users } from '../db/schema';
import { OwnershipGuard } from '../ownership/ownership.guard';
import { AuthGuard, type RequestWithAuth } from './auth.guard';

@Controller('auth')
export class AuthController {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb) {}

  @Get('me')
  @UseGuards(AuthGuard, OwnershipGuard)
  async me(@Req() request: RequestWithAuth): Promise<UserDto> {
    const current = request.user;

    // OwnershipGuard guarantees the singleton row exists here (it performed
    // the first-open claim or the pending-target swap when needed) and that
    // the caller is its owner — see the guard's class doc. A miss is a
    // guard-invariant violation (server-side corruption), not client input —
    // generic 500, internals never leak (mirrors the owner-row check below).
    const [state] = await this.db
      .select()
      .from(appState)
      .where(eq(appState.id, 1))
      .limit(1);
    if (state === undefined) {
      throw new InternalServerErrorException({
        error: { code: 'INTERNAL_ERROR', message: ERROR_MESSAGES.INTERNAL_ERROR },
      });
    }

    const [owner] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, state.currentOwnerId))
      .limit(1);
    if (owner === undefined) {
      // FK guarantees the owner row exists; a miss is server-side corruption,
      // not client input — a generic 500 (internals never leak).
      throw new InternalServerErrorException({
        error: { code: 'INTERNAL_ERROR', message: ERROR_MESSAGES.INTERNAL_ERROR },
      });
    }

    return {
      id: current.id,
      username: current.username,
      first_name: current.firstName,
      // OwnershipGuard 403'd every non-owner (known non-owner OR previous
      // owner with a pending transfer) before this handler ran → always true.
      is_owner: true,
      owner: {
        id: owner.id,
        username: owner.username,
        // DB column is nullable; contract says string — normalize for the wire.
        first_name: owner.firstName ?? '',
      },
    };
  }
}
