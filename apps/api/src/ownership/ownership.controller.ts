/**
 * OwnershipController — ownership surface (contract API_PATHS.ownership /
 * API_PATHS.transfer, design D6).
 * ============================================================================
 * Both routes compose @UseGuards(AuthGuard, OwnershipGuard):
 *   - AuthGuard validates initData and attaches request.user (global guard
 *     already ran; composing it here makes the ownership dependency explicit).
 *   - OwnershipGuard enforces the ownership gate + the claim state machine
 *     (first-open claim, pending-target claim, 403 for everyone else).
 *
 * The transfer POST is tightened beyond the global 100/60s basis (design D6:
 * "rate limit on auth + transfer endpoints") — 10/min is generous for a human
 * confirming a transfer and slows down username-enumeration probing of the
 * users table through the 422/200 difference.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

import { FIELD_ERROR_MESSAGES, type OwnershipDto } from '@painting/shared';
import { AuthGuard, type RequestWithAuth } from '../auth/auth.guard';
import { OwnershipGuard } from './ownership.guard';
import { OwnershipService } from './ownership.service';

/**
 * POST /api/v1/ownership/transfer body (contract TransferRequestDto).
 * The '@' is optional; whitespace is trimmed before validation so the format
 * message only fires on real format problems, not padding. Length 1–32
 * matches the Telegram username charset (defensive per spawn).
 */
export class TransferRequestDto {
  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: FIELD_ERROR_MESSAGES.TARGET_USERNAME_REQUIRED })
  @IsNotEmpty({ message: FIELD_ERROR_MESSAGES.TARGET_USERNAME_REQUIRED })
  @Matches(/^@?[A-Za-z0-9_]{1,32}$/, {
    message: FIELD_ERROR_MESSAGES.TARGET_USERNAME_FORMAT,
  })
  target_username!: string;
}

@Controller('ownership')
export class OwnershipController {
  constructor(private readonly service: OwnershipService) {}

  /** GET /api/v1/ownership — current owner + audit trail (OwnershipDto). */
  @Get()
  @UseGuards(AuthGuard, OwnershipGuard)
  async getOwnership(): Promise<OwnershipDto> {
    return this.service.getOwnershipState();
  }

  /**
   * POST /api/v1/ownership/transfer — initiate a transfer (claim-on-next-open).
   * 200 OwnershipDto (contract says 200; the target becomes owner on their
   * NEXT open — the swap + 'transfer-confirmed' event are written by the
   * guard, not here). 422 TRANSFER_USER_NOT_FOUND / 403 ACCESS_DENIED /
   * 400 VALIDATION_ERROR are thrown by the service / DTO pipe and formatted
   * by the global HttpExceptionFilter.
   */
  @Post('transfer')
  @HttpCode(200)
  @UseGuards(AuthGuard, OwnershipGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async transfer(
    @Req() request: RequestWithAuth,
    @Body() body: TransferRequestDto,
  ): Promise<OwnershipDto> {
    return this.service.transfer(body.target_username, request.user);
  }
}
