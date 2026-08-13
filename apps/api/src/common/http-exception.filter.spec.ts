/**
 * HttpExceptionFilter — the global error envelope contract (design D6,
 * tasks 8.1-8.2 unit portion).
 * ======================================================================
 * 1. Already-shaped contract envelopes pass through UNCHANGED.
 * 2. Unshaped Nest HttpExceptions map by status to the closest contract code
 *    (from ERROR_STATUS, the SSOT) with the RUSSIAN message.
 * 3. Everything else → 500 INTERNAL_ERROR with the generic Russian message;
 *    internals go to the server log ONLY, never to the response body.
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
  type ArgumentsHost,
} from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ERROR_MESSAGES,
  FIELD_ERROR_MESSAGES,
  type ApiErrorBody,
} from '@painting/shared';
import {
  HttpExceptionFilter,
  contractValidationExceptionFactory,
} from './http-exception.filter';

interface HostHarness {
  host: ArgumentsHost;
  response: {
    headersSent: boolean;
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

function makeHost(headersSent = false): HostHarness {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const response = { headersSent, status, json };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

beforeEach(() => {
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HttpExceptionFilter', () => {
  it('passes already-contract-shaped envelopes through UNCHANGED', () => {
    const filter = new HttpExceptionFilter();
    const { host, response } = makeHost();
    const shaped = new UnauthorizedException({
      error: { code: 'UNAUTHORIZED', message: ERROR_MESSAGES.UNAUTHORIZED },
    });
    filter.catch(shaped, host);
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: ERROR_MESSAGES.UNAUTHORIZED },
    });
  });

  it.each([
    {
      name: 'auth 401',
      exception: () => new UnauthorizedException('plain'),
      status: 401,
      code: 'UNAUTHORIZED' as const,
    },
    {
      name: 'ownership 403',
      exception: () => new ForbiddenException('plain'),
      status: 403,
      code: 'ACCESS_DENIED' as const,
    },
    {
      name: 'transfer 422',
      exception: () => new UnprocessableEntityException('plain'),
      status: 422,
      code: 'TRANSFER_USER_NOT_FOUND' as const,
    },
    {
      name: 'location 409',
      exception: () => new ConflictException('plain'),
      status: 409,
      code: 'LOCATION_IN_USE' as const,
    },
    {
      name: 'validation 400',
      exception: () => new BadRequestException('plain'),
      status: 400,
      code: 'VALIDATION_ERROR' as const,
    },
    {
      name: 'not found 404',
      exception: () => new NotFoundException('plain'),
      status: 404,
      code: 'NOT_FOUND' as const,
    },
    {
      name: 'photo too large 413',
      exception: () => new HttpException('plain', 413),
      status: 413,
      code: 'PHOTO_TOO_LARGE' as const,
    },
    {
      name: 'rate limited 429',
      exception: () => new HttpException('plain', 429),
      status: 429,
      code: 'RATE_LIMITED' as const,
    },
    {
      name: 'http 500',
      exception: () => new HttpException('plain', 500),
      status: 500,
      code: 'INTERNAL_ERROR' as const,
    },
  ])(
    'maps an unshaped $name ($status) to contract $code with the Russian message',
    ({ exception, status, code }) => {
      const filter = new HttpExceptionFilter();
      const { host, response } = makeHost();
      filter.catch(exception(), host);
      expect(response.status).toHaveBeenCalledWith(status);
      expect(response.json).toHaveBeenCalledWith({
        error: { code, message: ERROR_MESSAGES[code] },
      });
    },
  );

  it('masks unknown internal errors as a generic Russian 500 — no internals leak', () => {
    const filter = new HttpExceptionFilter();
    const { host, response } = makeHost();
    const boom = new Error(
      'Postgres connection refused: password authentication failed for user "root"',
    );
    filter.catch(boom, host);
    expect(response.status).toHaveBeenCalledWith(500);
    const body = response.json.mock.calls[0]![0] as ApiErrorBody;
    expect(body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: ERROR_MESSAGES.INTERNAL_ERROR },
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('Postgres');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('root');
    expect(serialized).not.toContain('Error');
    // The real error IS logged server-side.
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining('password authentication failed'),
    );
  });

  it('masks non-Error failures (strings) the same way', () => {
    const filter = new HttpExceptionFilter();
    const { host, response } = makeHost();
    filter.catch('some opaque failure', host);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: ERROR_MESSAGES.INTERNAL_ERROR },
    });
  });

  it('writes nothing when the response is already committed (headersSent)', () => {
    const filter = new HttpExceptionFilter();
    const { host, response } = makeHost(true);
    filter.catch(new Error('too late'), host);
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });
});

describe('contractValidationExceptionFactory', () => {
  it('maps class-validator errors to the contract 400 envelope with Russian fieldErrors', () => {
    const errors = [
      {
        property: 'name',
        constraints: { maxLength: FIELD_ERROR_MESSAGES.NAME_TOO_LONG },
        children: [],
      },
      {
        property: 'price_minor',
        constraints: { min: FIELD_ERROR_MESSAGES.PRICE_NON_NEGATIVE },
        children: [],
      },
    ] as unknown as ValidationError[];
    const exception = contractValidationExceptionFactory(errors);
    expect(exception.getStatus()).toBe(400);
    expect(exception.getResponse()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: ERROR_MESSAGES.VALIDATION_ERROR,
        fieldErrors: {
          name: [FIELD_ERROR_MESSAGES.NAME_TOO_LONG],
          price_minor: [FIELD_ERROR_MESSAGES.PRICE_NON_NEGATIVE],
        },
      },
    });
  });

  it('flattens nested DTO errors into dotted keys (newLocation.kind)', () => {
    const errors = [
      {
        property: 'newLocation',
        constraints: undefined,
        children: [
          {
            property: 'kind',
            constraints: { isIn: FIELD_ERROR_MESSAGES.LOCATION_KIND_INVALID },
            children: [],
          },
        ],
      },
    ] as unknown as ValidationError[];
    const exception = contractValidationExceptionFactory(errors);
    const response = exception.getResponse() as {
      error: { fieldErrors: Record<string, string[]> };
    };
    expect(response.error.fieldErrors).toEqual({
      'newLocation.kind': [FIELD_ERROR_MESSAGES.LOCATION_KIND_INVALID],
    });
  });

  it('translates the English class-validator whitelist message to Russian', () => {
    const errors = [
      {
        property: 'secret',
        constraints: { whitelistValidation: 'property secret should not exist' },
        children: [],
      },
    ] as unknown as ValidationError[];
    const exception = contractValidationExceptionFactory(errors);
    const response = exception.getResponse() as {
      error: { fieldErrors: Record<string, string[]> };
    };
    expect(response.error.fieldErrors).toEqual({
      secret: ['Поле не должно быть отправлено.'],
    });
  });
});
