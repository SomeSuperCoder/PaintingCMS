/**
 * HttpExceptionFilter — the global error contract (design D6, error catalog).
 * ============================================================================
 * Registered as APP_FILTER in AppModule, so it catches EVERY exception that
 * escapes any layer (guards, pipes, interceptors, controllers, services) and
 * maps it to the contract ApiErrorBody envelope (packages/shared
 * api-contract.ts):
 *
 *   { error: { code, message, fieldErrors?, details? } }
 *
 * Policy, in order:
 *   1. ALREADY-SHAPED envelopes (AuthGuard 401s, OwnershipGuard 403s,
 *      AuthController/OwnershipService, and this file's own validation
 *      exceptionFactory) pass through UNCHANGED — code + Russian message were
 *      chosen at the throw site; the filter never re-maps them. Throw sites
 *      must keep the exception's HTTP status consistent with the code's
 *      ERROR_STATUS entry.
 *   2. UNSHAPED Nest HttpExceptions (unknown-route 404, multer's 413, the
 *      ThrottlerGuard's 429, ...) are mapped by HTTP status to the closest
 *      contract code, derived from ERROR_STATUS (the SSOT) — when a status is
 *      shared by several codes the FIRST one wins, resolving to the generic
 *      code (401→UNAUTHORIZED, 400→VALIDATION_ERROR).
 *   3. EVERYTHING ELSE (DB failures, programming errors) becomes a 500
 *      INTERNAL_ERROR with the generic Russian message; the real error is
 *      written to the server log ONLY. Internals never reach the client.
 *
 * The filter NEVER leaks: no stacks, no English/raw error text, no driver
 * messages in any response body.
 */

import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import type { Response } from 'express';

import {
  ERROR_MESSAGES,
  ERROR_STATUS,
  type ApiErrorBody,
  type ApiErrorCode,
} from '@painting/shared';

/**
 * Russian bridge for class-validator's DEFAULT whitelist message ("property X
 * should not exist" is English; the contract is 100% Russian). A contract
 * amendment should promote this into FIELD_ERROR_MESSAGES (see handoff).
 */
const UNKNOWN_FIELD_MESSAGE = 'Поле не должно быть отправлено.';

/**
 * HTTP status → closest contract code. Derived once from ERROR_STATUS (the
 * SSOT) so new error codes are picked up with ZERO edits to this file; the
 * first code per status wins (shared statuses → the generic code).
 */
const STATUS_TO_CODE: Partial<Record<number, ApiErrorCode>> = {};
for (const [code, status] of Object.entries(ERROR_STATUS) as [
  ApiErrorCode,
  number,
][]) {
  if (!(status in STATUS_TO_CODE)) {
    STATUS_TO_CODE[status] = code;
  }
}

/**
 * Validation exception factory for the global ValidationPipe (main.ts):
 * converts class-validator's ValidationError[] into the contract 400 envelope
 * with per-field Russian messages. Living HERE (not in main.ts) keeps every
 * piece of error shaping in one file — SSOT for the error contract.
 */
export function contractValidationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  return new BadRequestException({
    error: {
      code: 'VALIDATION_ERROR',
      message: ERROR_MESSAGES.VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(errors),
    },
  });
}

/**
 * Flattens class-validator errors into `property → Russian messages[]`.
 * Nested DTOs (e.g. the domain wave's `newLocation`) get dotted keys
 * (`newLocation.kind`), so the frontend can pin each message to its field.
 */
function collectFieldErrors(
  errors: ValidationError[],
  prefix = '',
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const error of errors) {
    const property = prefix ? `${prefix}.${error.property}` : error.property;
    const messages = Object.values(error.constraints ?? {}).map(
      toRussianMessage,
    );
    if (messages.length > 0) {
      fieldErrors[property] = messages;
    }
    if (error.children && error.children.length > 0) {
      Object.assign(fieldErrors, collectFieldErrors(error.children, property));
    }
  }
  return fieldErrors;
}

/** Only the whitelist default is English — everything else is already Russian. */
function toRussianMessage(message: string): string {
  return message.includes('should not exist') ? UNKNOWN_FIELD_MESSAGE : message;
}

/** True when the body is already the contract envelope → pass through unchanged. */
function isApiErrorBody(body: unknown): body is ApiErrorBody {
  if (typeof body !== 'object' || body === null) return false;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return false;
  const envelope = error as { code?: unknown; message?: unknown };
  return typeof envelope.code === 'string' && typeof envelope.message === 'string';
}

/** Real error text for the server log only — never for the client. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    // A streaming response (e.g. an error mid-file download) is already
    // committed — there is nothing safe left to write.
    if (response.headersSent) {
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // 1) Contract-shaped at the throw site → pass through exactly as-is.
      if (isApiErrorBody(body)) {
        response.status(status).json(body);
        return;
      }

      // 2) Unshaped Nest exception → closest contract code by status.
      const code = STATUS_TO_CODE[status];
      if (code !== undefined) {
        response.status(status).json({
          error: { code, message: ERROR_MESSAGES[code] },
        });
        return;
      }
    }

    // 3) Unknown error → 500 with the generic Russian message; the real error
    //    goes to the server log, never to the client.
    this.logger.error(`unhandled exception: ${describeError(exception)}`);
    response.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: ERROR_MESSAGES.INTERNAL_ERROR },
    });
  }
}
