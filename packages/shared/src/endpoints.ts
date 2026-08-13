/**
 * PaintingCMS API Contract — v1 (endpoint surface)
 * ================================================
 * The complete endpoint table + path builders for the contract. Types and
 * constants (DTOs, errors, auth header) live in `./api-contract`; import both
 * through the package index. All 16 endpoints are listed here — the backend
 * implements exactly this surface, the frontend consumes exactly this surface.
 */
import type { ApiErrorCode, HttpMethod } from './api-contract';

/** Runtime path builders — the ONLY place paths are defined. */
export const API_PATHS = {
  health: '/health',
  authMe: '/api/v1/auth/me',
  ownership: '/api/v1/ownership',
  transfer: '/api/v1/ownership/transfer',
  paintings: '/api/v1/paintings',
  painting: (id: string) => `/api/v1/paintings/${id}`,
  paintingPhotos: (id: string) => `/api/v1/paintings/${id}/photos`,
  photo: (id: string) => `/api/v1/photos/${id}`,
  photoStream: (id: string) => `/api/v1/photos/${id}/stream`,
  locations: '/api/v1/locations',
  location: (id: string) => `/api/v1/locations/${id}`,
} as const;

/** Human + machine-readable endpoint registry (documentation; the DTOs in api-contract carry the shapes). */
export interface EndpointDef {
  method: HttpMethod;
  path: string;
  /** 'none' = unauthenticated; 'init-data' = requires X-Telegram-Init-Data header. */
  auth: 'none' | 'init-data';
  description: string;
  /** Request body type name (or 'multipart: photos[]' / '—'). */
  request: string;
  /** Response body type name (or '204 No Content' / 'binary stream'). */
  response: string;
  /** Error codes this endpoint can return (all also require auth codes when auth: 'init-data'). */
  errors: ApiErrorCode[];
}

/** All 16 endpoints — the complete API surface. */
export const ENDPOINTS: readonly EndpointDef[] = [
  {
    method: 'GET',
    path: API_PATHS.health,
    auth: 'none',
    description: 'Liveness probe — no auth, no data.',
    request: '—',
    response: '{ status: "ok" }',
    errors: [],
  },
  {
    method: 'GET',
    path: API_PATHS.authMe,
    auth: 'init-data',
    description: 'Bootstrap: current user + owner info; first-ever open claims ownership; known non-owner or previous owner with pending transfer → 403 ACCESS_DENIED.',
    request: '—',
    response: 'UserDto',
    errors: ['UNAUTHORIZED', 'SESSION_EXPIRED', 'ACCESS_DENIED', 'RATE_LIMITED'],
  },
  {
    method: 'GET',
    path: API_PATHS.ownership,
    auth: 'init-data',
    description: 'Current owner + full ownership event history (newest first).',
    request: '—',
    response: 'OwnershipDto',
    errors: ['UNAUTHORIZED', 'SESSION_EXPIRED', 'ACCESS_DENIED', 'NOT_FOUND', 'RATE_LIMITED'],
  },
  {
    method: 'POST',
    path: API_PATHS.transfer,
    auth: 'init-data',
    description: 'Resolve target username and INITIATE an ownership transfer (two-phase: status transfer-initiated; target becomes owner on their next open via the atomic swap).',
    request: 'TransferRequestDto',
    response: 'TransferResultDto',
    errors: ['UNAUTHORIZED', 'SESSION_EXPIRED', 'ACCESS_DENIED', 'VALIDATION_ERROR', 'TRANSFER_USER_NOT_FOUND', 'RATE_LIMITED'],
  },
  {
    method: 'GET',
    path: API_PATHS.paintings,
    auth: 'init-data',
    description: 'All paintings, newest first, with thumbnail + location summary.',
    request: '—',
    response: 'PaintingListItemDto[]',
    errors: ['UNAUTHORIZED', 'SESSION_EXPIRED', 'ACCESS_DENIED', 'RATE_LIMITED'],
  },
  {
    method: 'POST',
    path: API_PATHS.paintings,
    auth: 'init-data',
    description: 'Create a painting (location from bank or created inline; photos attached afterwards).',
    request: 'PaintingCreateRequestDto',
    response: 'PaintingDto (201 Created, Location header)',
    errors: ['UNAUTHORIZED', 'SESSION_EXPIRED', 'ACCESS_DENIED', 'VALIDATION_ERROR', 'RATE_LIMITED'],
  },
  {
    method: 'GET',
    path: API_PATHS.painting(':id'),
    auth: 'init-data',
    description: 'Full painting detail: photos (gallery order) + location.',
    request: '—',
    response: 'PaintingDto',
    errors: ['UNAUTHORIZED', 'SESSION_EXPIRED', 'ACCESS_DENIED', 'NOT_FOUND', 'RATE_LIMITED'],
  },
  {
    method: 'PATCH',
    path: API_PATHS.painting(':id'),
    auth: 'init-data',
    description: 'Update painting fields (name, price, currency, location).',
    request: 'PaintingUpdateRequestDto',
    response: 'PaintingDto',
    errors: ['UNAUTHORIZED', 'SESSION_EXPIRED', 'ACCESS_DENIED', 'VALIDATION_ERROR', 'NOT_FOUND', 'RATE_LIMITED'],
  },
  {
    method: 'DELETE',
    path: API_PATHS.painting(':id'),
    auth: 'init-data',
    description: 'Delete a painting — cascades photo deletion (DB rows + files).',
    request: '—',
    response: '204 No Content',
    errors: ['UNAUTHORIZED', 'SESSION_EXPIRED', 'ACCESS_DENIED', 'NOT_FOUND', 'RATE_LIMITED'],
  },
  {
    method: 'GET',
    path: API_PATHS.locations,
    auth: 'init-data',
    description: 'All locations (stable order by createdAt for the select dropdown).',
    request: '—',
    response: 'LocationDto[]',
    errors: ['UNAUTHORIZED', 'SESSION_EXPIRED', 'ACCESS_DENIED', 'RATE_LIMITED'],
  },
  {
    method: 'POST',
    path: API_PATHS.locations,
    auth: 'init-data',
    description: 'Create a location (offline address or online http(s) URL).',
    request: 'LocationCreateRequestDto',
    response: 'LocationDto (201 Created)',
    errors: ['UNAUTHORIZED', 'SESSION_EXPIRED', 'ACCESS_DENIED', 'VALIDATION_ERROR', 'RATE_LIMITED'],
  },
  {
    method: 'PATCH',
    path: API_PATHS.location(':id'),
    auth: 'init-data',
    description: 'Update location kind and/or value.',
    request: 'LocationUpdateRequestDto',
    response: 'LocationDto',
    errors: ['UNAUTHORIZED', 'SESSION_EXPIRED', 'ACCESS_DENIED', 'VALIDATION_ERROR', 'NOT_FOUND', 'RATE_LIMITED'],
  },
  {
    method: 'DELETE',
    path: API_PATHS.location(':id'),
    auth: 'init-data',
    description: 'Delete an unused location. If paintings use it → 409 LOCATION_IN_USE with affected paintings in details.',
    request: '—',
    response: '204 No Content',
    errors: ['UNAUTHORIZED', 'SESSION_EXPIRED', 'ACCESS_DENIED', 'NOT_FOUND', 'LOCATION_IN_USE', 'RATE_LIMITED'],
  },
  {
    method: 'POST',
    path: API_PATHS.paintingPhotos(':id'),
    auth: 'init-data',
    description: 'Upload photos to a painting (multipart/form-data, field "photos").',
    request: 'multipart: photos[]',
    response: 'PhotoUploadResultDto (201 Created)',
    errors: ['UNAUTHORIZED', 'SESSION_EXPIRED', 'ACCESS_DENIED', 'NOT_FOUND', 'PHOTO_TYPE_INVALID', 'PHOTO_TOO_LARGE', 'PHOTO_LIMIT_EXCEEDED', 'RATE_LIMITED'],
  },
  {
    method: 'DELETE',
    path: API_PATHS.photo(':id'),
    auth: 'init-data',
    description: 'Delete a single photo (storage + DB row).',
    request: '—',
    response: '204 No Content',
    errors: ['UNAUTHORIZED', 'SESSION_EXPIRED', 'ACCESS_DENIED', 'NOT_FOUND', 'RATE_LIMITED'],
  },
  {
    method: 'GET',
    path: API_PATHS.photoStream(':id'),
    auth: 'init-data',
    description: 'Auth-guarded photo bytes. Content-Type: image/*; Cache-Control: private, immutable. NOT embeddable as plain <img src>.',
    request: '—',
    response: 'binary (image bytes)',
    errors: ['UNAUTHORIZED', 'SESSION_EXPIRED', 'ACCESS_DENIED', 'NOT_FOUND', 'RATE_LIMITED'],
  },
];

/* ══════════════════════════════════════════════════════════════════════════
 * VERSIONING STRATEGY
 * ══════════════════════════════════════════════════════════════════════════
 * - URL versioning: `/api/v1/...`. Visible, cache-friendly, tooling-friendly.
 * - ADDITIVE changes (new optional fields, new endpoints, new error codes) are
 *   allowed within v1 without a bump — they never break existing clients.
 * - BREAKING changes (renamed/removed fields, changed semantics, added
 *   pagination) require `/api/v2/...`. Old versions stay alive through a
 *   documented deprecation window and send a `Sunset` header.
 * - Clients MUST switch on `code`/HTTP status, never on message text.
 */
