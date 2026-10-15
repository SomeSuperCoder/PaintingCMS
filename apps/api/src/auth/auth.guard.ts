/**
 * AuthGuard — stateless per-request Telegram initData authentication (D2).
 * ==========================================================================
 * Every request MUST carry the X-Telegram-Init-Data header (contract
 * AUTH_HEADER). Flow: validate the header with the pure init-data module →
 * upsert the user (never throw on repeat visits) → attach the normalized
 * identity to `request.user`.
 *
 * Failure policy (spec tma-auth): ANY invalid/missing/malformed/forged initData
 * yields HTTP 401 with a GENERIC Russian message — the exact same contract
 * envelope for every failure mode, never revealing WHY (no internals in the
 * body). SESSION_EXPIRED (validly signed but stale) is also 401, per the
 * contract's two 401 codes. Auth failures can NEVER surface as 500.
 *
 * DEV_MODE (development only): the header is neither required nor read. Every
 * request is authenticated as the constant DEV_USER (@painting/shared) and NO
 * user row is written — so a dev identity can never own the catalog or leak
 * into the database a real deployment later serves. env validation refuses to
 * boot when DEV_MODE=true together with NODE_ENV=production.
 *
 * Registration: global APP_GUARD (AppModule) so every future domain module is
 * authenticated by default; @Public() opts routes out (/health only). Also
 * usable per-controller as @UseGuards(AuthGuard) where an explicit declaration
 * aids readability (e.g. next wave's ownership endpoints).
 */

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AUTH_HEADER, DEV_USER, ERROR_MESSAGES } from '@painting/shared';
import type { Request } from 'express';

import { DRIZZLE_DB, type DrizzleDb } from '../db/drizzle.module';
import { users } from '../db/schema';
import { AuthError, validateInitData, type TelegramUser } from './init-data';
import { IS_PUBLIC_KEY } from './public.decorator';

/** The identity attached to request.user after successful validation. */
export interface AuthUser {
  /** Telegram user id as TEXT (precision-safe, design D3). */
  id: string;
  /** Persisted username; null when the user has none (DB column nullable). */
  username: string | null;
  /** Telegram first name — always present on validated users. */
  firstName: string;
}

/** Express request augmented by AuthGuard. Consumed by controllers + next wave's OwnerGuard. */
export type RequestWithAuth = Request & { user: AuthUser };

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  private readonly devMode: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
  ) {
    this.devMode = this.config.get<boolean>('DEV_MODE', false);
    if (this.devMode) {
      this.logger.warn(
        '[DEV_MODE] Authentication and ownership are bypassed — every request is DEV_USER and nothing is written to the users table. Do NOT use in production.',
      );
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublic(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuth>();

    // DEV_MODE: the identity is a CONSTANT, so the header is never read or
    // parsed — and, critically, the user is NOT upserted. Ownership persists
    // nothing in DEV_MODE either (ownership.guard.ts), and the only FKs into
    // `users` are app_state + ownership_events, so skipping this write leaves no
    // dangling reference. A dev identity that never reaches the database cannot
    // hold ownership there — that is what makes the dev lockout impossible.
    if (this.devMode) {
      request.user = {
        id: DEV_USER.id,
        username: DEV_USER.username,
        firstName: DEV_USER.firstName,
      };
      return true;
    }

    // Express lowercases header names; the contract constant is the SSOT.
    const raw = request.headers[AUTH_HEADER.toLowerCase()];
    const user = this.authenticate(raw);

    await this.upsertUser(user);

    request.user = {
      id: user.id,
      username: user.username ?? null,
      firstName: user.firstName,
    };
    return true;
  }

  /** Validate the header; every failure mode → 401 with the generic Russian envelope. */
  private authenticate(raw: unknown): TelegramUser {
    if (typeof raw !== 'string' || raw.length === 0) {
      throw this.unauthorized('UNAUTHORIZED');
    }
    try {
      const botToken = this.config.get<string>('BOT_TOKEN', '');
      const maxAgeSeconds = this.config.get<number>('INIT_DATA_MAX_AGE_SECONDS', 600);
      return validateInitData(raw, { botToken, maxAgeSeconds });
    } catch (error) {
      if (error instanceof AuthError) {
        throw this.unauthorized(error.code);
      }
      // Non-validation failures (e.g. programming errors) are NOT masked as
      // 401 — let the global error handling surface them as 500.
      throw error;
    }
  }

  /**
   * Record every validated user (design D3). Idempotent upsert — repeat
   * visits refresh username/first_name without ever throwing on conflict.
   * username stays null for users who never set one (NULLs are distinct in
   * the unique index, schema.ts).
   *
   * NEVER called in DEV_MODE: the dev identity must not reach the database.
   */
  private async upsertUser(user: TelegramUser): Promise<void> {
    await this.db
      .insert(users)
      .values({
        id: user.id,
        username: user.username ?? null,
        firstName: user.firstName,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          username: user.username ?? null,
          firstName: user.firstName,
        },
      });
  }

  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }

  /** 401 with the CONTRACT error envelope — identical body for every failure mode. */
  private unauthorized(code: 'UNAUTHORIZED' | 'SESSION_EXPIRED'): UnauthorizedException {
    return new UnauthorizedException({
      error: { code, message: ERROR_MESSAGES[code] },
    });
  }
}
