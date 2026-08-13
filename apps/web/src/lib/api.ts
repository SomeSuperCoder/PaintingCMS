/**
 * Typed fetch wrapper for the PaintingCMS REST API (contract: packages/shared).
 *
 * - Paths: callers pass FULL contract paths from API_PATHS (e.g. /api/v1/paintings).
 *   The wrapper fetches them VERBATIM — it never prepends a base path, because
 *   API_PATHS is the single source of truth for paths (prepending API_BASE_PATH
 *   here caused the /api/v1/api/v1/... double-prefix bug).
 * - Attaches X-Telegram-Init-Data (AUTH_HEADER) on every request via tma.getInitData().
 * - Parses the standard error envelope (ApiErrorBody) and throws a typed ApiError
 *   carrying the RUSSIAN message, stable code, fieldErrors and details.
 * - Exposes isUnauthorized / isForbidden detectors for the expired/denied screens.
 */
import {
  AUTH_HEADER,
  ERROR_MESSAGES,
  type ApiErrorBody,
  type ApiErrorCode,
} from '@painting/shared';
import { strings } from '@/strings';
import { getInitData } from './tma';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export type ApiErrorCodeOrNetwork = ApiErrorCode | 'NETWORK' | 'UNKNOWN';

export class ApiError extends Error {
  /** HTTP status; 0 means the request never reached the server (network). */
  readonly status: number;
  /** Stable machine-readable code from the contract, or NETWORK/UNKNOWN. */
  readonly code: ApiErrorCodeOrNetwork;
  /** Russian, user-facing message. */
  readonly fieldErrors: Record<string, string[]> | undefined;
  readonly details: ApiErrorBody['error']['details'];

  constructor(
    status: number,
    code: ApiErrorCodeOrNetwork,
    message: string,
    fieldErrors?: Record<string, string[]>,
    details?: ApiErrorBody['error']['details'],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.details = details;
  }
}

/** 401 — initData missing/expired/invalid → «Сессия истекла» screen. */
export function isUnauthorized(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401;
}

/** 403 — valid user, not the owner → «Доступ запрещён» screen (no data calls). */
export function isForbidden(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 403;
}

/** Russian message for any thrown error (server message or network fallback). */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return strings.common.network;
}

/** Russian fallbacks when the error body is unreadable (never leak internals). */
const FALLBACK_BY_STATUS: Record<number, string> = {
  401: ERROR_MESSAGES.UNAUTHORIZED,
  403: ERROR_MESSAGES.ACCESS_DENIED,
  404: ERROR_MESSAGES.NOT_FOUND,
  422: ERROR_MESSAGES.TRANSFER_USER_NOT_FOUND,
};

interface ApiRequestOptions extends Omit<RequestInit, 'method' | 'body'> {
  /** JSON body (serialized automatically) or FormData (passed through for uploads). */
  body?: unknown;
}

async function parseErrorBody(response: Response): Promise<ApiErrorBody | null> {
  try {
    return (await response.json()) as ApiErrorBody;
  } catch {
    return null;
  }
}

async function request<T>(
  method: HttpMethod,
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const initData = getInitData();
  if (initData) headers.set(AUTH_HEADER, initData);

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(path, { ...options, method, headers, body });
  } catch {
    throw new ApiError(0, 'NETWORK', strings.common.network);
  }

  if (!response.ok) {
    const apiBody = await parseErrorBody(response);
    const code = apiBody?.error.code ?? 'UNKNOWN';
    const message =
      apiBody?.error.message ??
      FALLBACK_BY_STATUS[response.status] ??
      ERROR_MESSAGES.INTERNAL_ERROR;
    throw new ApiError(
      response.status,
      code,
      message,
      apiBody?.error.fieldErrors,
      apiBody?.error.details,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * Fetch binary bytes with the same auth header — used for photo streams.
 * The contract serves photos at authed paths (e.g. /api/v1/photos/:id/stream)
 * that a plain <img src> cannot access; the caller creates an object URL from
 * the returned Blob and renders that. Errors keep the standard ApiError shape.
 */
async function requestBlob(path: string): Promise<Blob> {
  const headers = new Headers();
  const initData = getInitData();
  if (initData) headers.set(AUTH_HEADER, initData);

  let response: Response;
  try {
    response = await fetch(path, { headers });
  } catch {
    throw new ApiError(0, 'NETWORK', strings.common.network);
  }

  if (!response.ok) {
    const apiBody = await parseErrorBody(response);
    const code = apiBody?.error.code ?? 'UNKNOWN';
    const message =
      apiBody?.error.message ??
      FALLBACK_BY_STATUS[response.status] ??
      ERROR_MESSAGES.INTERNAL_ERROR;
    throw new ApiError(
      response.status,
      code,
      message,
      apiBody?.error.fieldErrors,
      apiBody?.error.details,
    );
  }

  return response.blob();
}

export const api = {
  get: <T>(path: string, options?: ApiRequestOptions): Promise<T> =>
    request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> =>
    request<T>('POST', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> =>
    request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, options?: ApiRequestOptions): Promise<T> =>
    request<T>('DELETE', path, options),
  getBlob: (path: string): Promise<Blob> => requestBlob(path),
};
