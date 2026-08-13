/**
 * api.ts tests — the typed fetch wrapper's error mapping. Every server error
 * must surface as an ApiError with a stable code and a RUSSIAN message;
 * network failures get the generic Russian «Нет соединения» message.
 * fetch is stubbed at the network boundary (never a real HTTP round-trip).
 *
 * Path contract: callers pass FULL API_PATHS paths (e.g. /api/v1/paintings)
 * and the wrapper fetches them VERBATIM — it never prepends a base path.
 * The URL assertions below are the regression guard for the double-prefix bug
 * (/api/v1/api/v1/... → 404).
 */
import { AUTH_HEADER, API_PATHS, ERROR_MESSAGES } from '@painting/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api, apiErrorMessage, isForbidden, isUnauthorized } from '@/lib/api';
import { strings } from '@/strings';

const { getInitData } = vi.hoisted(() => ({ getInitData: vi.fn() }));
vi.mock('@/lib/tma', () => ({ getInitData }));

/** Minimal Response-like object — jsdom keeps Node's fetch, but constructing
 * real Response objects adds environment noise; only ok/status/json/blob are
 * consumed by the wrapper. */
function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
    blob: async () => new Blob(),
    headers: new Headers(),
  } as unknown as Response;
}

function fetchMockResolving(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const mock = vi.fn().mockResolvedValue(response(status, body));
  vi.stubGlobal('fetch', mock);
  return mock;
}

beforeEach(() => {
  getInitData.mockReturnValue('mock-init-data');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('api error mapping', () => {
  it.each([
    { status: 401, code: 'UNAUTHORIZED', message: ERROR_MESSAGES.UNAUTHORIZED },
    { status: 403, code: 'ACCESS_DENIED', message: ERROR_MESSAGES.ACCESS_DENIED },
    { status: 404, code: 'NOT_FOUND', message: ERROR_MESSAGES.NOT_FOUND },
    { status: 409, code: 'LOCATION_IN_USE', message: ERROR_MESSAGES.LOCATION_IN_USE },
    { status: 422, code: 'TRANSFER_USER_NOT_FOUND', message: ERROR_MESSAGES.TRANSFER_USER_NOT_FOUND },
  ])(
    'maps HTTP $status to code $code with the Russian message',
    async ({ status, code, message }) => {
      fetchMockResolving(status, { error: { code, message, fieldErrors: undefined } });
      await expect(api.get<unknown>(API_PATHS.paintings)).rejects.toMatchObject({ status, code, message });
    },
  );

  it('falls back to the status-specific Russian message when the body is unreadable', async () => {
    fetchMockResolving(401, null);
    const err = await api.get<never>(API_PATHS.paintings).catch((e) => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNKNOWN');
    expect(err.message).toBe(ERROR_MESSAGES.UNAUTHORIZED);
  });

  it('falls back to the generic Russian message for unknown statuses', async () => {
    fetchMockResolving(503, { error: { code: 'MAINTENANCE' } });
    const err = await api.get<never>(API_PATHS.paintings).catch((e) => e as ApiError);
    expect(err.status).toBe(503);
    expect(err.code).toBe('MAINTENANCE');
    expect(err.message).toBe(ERROR_MESSAGES.INTERNAL_ERROR);
  });

  it('maps network failure to status 0 / NETWORK with the Russian message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const err = await api.get<never>(API_PATHS.paintings).catch((e) => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.code).toBe('NETWORK');
    expect(err.message).toBe(strings.common.network);
  });

  it('passes through fieldErrors and details from the error envelope', async () => {
    const body = {
      error: {
        code: 'VALIDATION_ERROR',
        message: ERROR_MESSAGES.VALIDATION_ERROR,
        fieldErrors: { name: ['Введите название картины.'] },
        details: { count: 3 },
      },
    };
    fetchMockResolving(400, body);
    const err = await api.post<never>(API_PATHS.paintings, {}).catch((e) => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.fieldErrors).toEqual({ name: ['Введите название картины.'] });
    expect(err.details).toEqual({ count: 3 });
  });
});

describe('api request construction', () => {
  it('returns the parsed JSON envelope on success', async () => {
    const payload = { id: '1', name: 'Картина' };
    fetchMockResolving(200, payload);
    await expect(api.get<typeof payload>(API_PATHS.paintings)).resolves.toEqual(payload);
  });

  it('returns undefined for 204 No Content', async () => {
    fetchMockResolving(204, null);
    await expect(api.delete<void>(API_PATHS.painting('1'))).resolves.toBeUndefined();
  });

  it('fetches the full API path verbatim (single prefix, never /api/v1/api/v1) and attaches the auth header when initData is present', async () => {
    const mock = fetchMockResolving(200, {});
    await api.get(API_PATHS.paintings);
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(API_PATHS.paintings);
    expect(url).not.toContain('/api/v1/api/v1');
    expect((init.headers as Headers).get(AUTH_HEADER)).toBe('mock-init-data');
  });

  it('omits the auth header when initData is empty', async () => {
    getInitData.mockReturnValue('');
    const mock = fetchMockResolving(200, {});
    await api.get(API_PATHS.paintings);
    const [, init] = mock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Headers).get(AUTH_HEADER)).toBeNull();
  });

  it('serializes JSON bodies with Content-Type application/json', async () => {
    const mock = fetchMockResolving(200, {});
    await api.post(API_PATHS.paintings, { name: 'X' });
    const [, init] = mock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ name: 'X' }));
  });

  it('passes FormData through untouched without a JSON content type', async () => {
    const mock = fetchMockResolving(200, {});
    const formData = new FormData();
    formData.append('file', new File(['a'], 'a.jpg', { type: 'image/jpeg' }));
    await api.post(API_PATHS.paintingPhotos('1'), formData);
    const [, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(formData);
    expect((init.headers as Headers).get('Content-Type')).toBeNull();
  });

  it('getBlob fetches the stream path verbatim with the auth header', async () => {
    const mock = fetchMockResolving(200, null);
    await api.getBlob(API_PATHS.photoStream('1'));
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(API_PATHS.photoStream('1'));
    expect((init.headers as Headers).get(AUTH_HEADER)).toBe('mock-init-data');
  });
});

describe('isUnauthorized / isForbidden / apiErrorMessage', () => {
  it('detects 401 as unauthorized and 403 as forbidden', () => {
    const unauthorized = new ApiError(401, 'UNAUTHORIZED', 'msg');
    const forbidden = new ApiError(403, 'ACCESS_DENIED', 'msg');
    expect(isUnauthorized(unauthorized)).toBe(true);
    expect(isUnauthorized(forbidden)).toBe(false);
    expect(isUnauthorized(new Error('x'))).toBe(false);
    expect(isForbidden(forbidden)).toBe(true);
    expect(isForbidden(unauthorized)).toBe(false);
  });

  it('surfaces the Russian message from ApiError, Error, and the network fallback', () => {
    expect(apiErrorMessage(new ApiError(401, 'UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED))).toBe(
      ERROR_MESSAGES.UNAUTHORIZED,
    );
    expect(apiErrorMessage(new Error('Что-то пошло не так'))).toBe('Что-то пошло не так');
    expect(apiErrorMessage('raw string')).toBe(strings.common.network);
    expect(apiErrorMessage(undefined)).toBe(strings.common.network);
  });
});
