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
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AUTH_HEADER, ERROR_MESSAGES } from '@painting/shared';
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
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublic(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuth>();

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
