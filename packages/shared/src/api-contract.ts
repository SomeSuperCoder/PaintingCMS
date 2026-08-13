/**
 * PaintingCMS API Contract — v1 (types, constants, errors)
 * ========================================================
 * Single source of truth for the PaintingCMS REST API (design decisions D1/D6/D8).
 * Backend (NestJS class-validator DTOs) and frontend (React zod schemas) MIRROR
 * these types — do NOT redefine them. The contract lives in `packages/shared`
 * so both apps consume the same definitions. The endpoint surface table and
 * path builders live in `./endpoints` (re-exported from the package index).
 *
 * Conventions
 * -----------
 * - Base URL: `/api/v1` for every endpoint EXCEPT `/health`.
 * - Auth: every `/api/v1/*` request MUST carry the `X-Telegram-Init-Data`
 *   header (see AUTH_HEADER below). `/health` is unauthenticated.
 * - IDs are opaque strings (UUIDv4 / cuid2). Telegram user IDs are ALWAYS
 *   strings, never numbers — Telegram IDs exceed 2^53 (design D3).
 * - Money is transmitted as integer minor units (`price_minor`, kopecks/cents)
 *   with an ISO currency enum. Display formatting (ru-RU locale + currency
 *   symbol) is a FRONTEND concern: `Intl.NumberFormat('ru-RU', { style:
 *   'currency', currency: dto.currency })`. The API never sends pre-formatted
 *   price strings (avoids drift between price_minor and formatted value).
 * - Timestamps are ISO-8601 UTC strings.
 * - All user-facing strings (error messages, validation text) are RUSSIAN.
 *   Field names, codes, and types are English.
 * - Lists are bare arrays; pagination is intentionally deferred (single-owner
 *   scale). Adding pagination later is a BREAKING change → v2.
 * - Success bodies are the bare DTO (no `{ data: ... }` wrapper).
 */

/* ══════════════════════════════════════════════════════════════════════════
 * 1. AUTH HEADER & TRANSPORT
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * The raw Telegram Mini App initData string, passed verbatim on every request.
 * The server validates it per the official HMAC-SHA256 algorithm (design D2).
 * The frontend captures it once via @telegram-apps/sdk and attaches it with a
 * small fetch wrapper on every /api/v1 request.
 *
 * 401 → Russian "reopen the app" message (session expired / invalid initData).
 * 403 → Russian access-denied message (valid user who is NOT the owner — a
 *       known non-owner, or the previous owner whose transfer is pending).
 */
export const AUTH_HEADER = 'X-Telegram-Init-Data' as const;

/** Base path for all versioned endpoints. */
export const API_BASE_PATH = '/api/v1' as const;

/**
 * Unauthenticated liveness probe. Returns 200 { status: 'ok' } with no auth,
 * no data, no version prefix. Used by compose healthchecks and the deploy
 * smoke test (design D9).
 */
export const HEALTH_PATH = '/health' as const;

/**
 * Server-side freshness window for `auth_date` inside initData. Requests older
 * than this receive 401 SESSION_EXPIRED. Default 10 minutes; overridable via
 * env `INIT_DATA_MAX_AGE_SECONDS`. Shared so tests and docs agree.
 */
export const INIT_DATA_MAX_AGE_SECONDS = 10 * 60;

/* ══════════════════════════════════════════════════════════════════════════
 * 2. ERROR CATALOG (Russian messages — the shared, frontend-reusable block)
 * ══════════════════════════════════════════════════════════════════════════ */

/** Machine-readable, stable error codes. The key IS the code. */
export const ERROR_MESSAGES = {
  /** 401 — initData missing, malformed, or forged. Includes "reopen the app" guidance. */
  UNAUTHORIZED: 'Не удалось подтвердить вход. Откройте приложение заново и попробуйте ещё раз.',
  /** 401 — initData validly signed but `auth_date` older than the freshness window. */
  SESSION_EXPIRED: 'Сессия истекла. Откройте приложение заново.',
  /** 403 — valid Telegram user who is not the current owner (or owner whose transfer is pending). */
  ACCESS_DENIED: 'Доступ запрещён. Приложение доступно только его владельцу.',
  /** 404 — painting / location / photo does not exist (or was deleted). */
  NOT_FOUND: 'Запись не найдена.',
  /** 400 — request body failed validation; `fieldErrors` carries per-field Russian messages. */
  VALIDATION_ERROR: 'Проверьте правильность заполнения формы.',
  /** 400 — uploaded file is not an allowed image MIME type. */
  PHOTO_TYPE_INVALID: 'Недопустимый тип файла. Можно загружать только изображения (JPEG, PNG, WebP, GIF).',
  /** 413 — uploaded file exceeds the per-file size cap. */
  PHOTO_TOO_LARGE: 'Файл слишком большой. Максимальный размер одного файла — 10 МБ.',
  /** 400 — more than the per-painting photo cap in one upload. */
  PHOTO_LIMIT_EXCEEDED: 'Слишком много фотографий. Максимум — 10 фотографий на одну картину.',
  /** 409 — location is referenced by one or more paintings; `details.paintings` lists them. */
  LOCATION_IN_USE: 'Локацию нельзя удалить: она используется картинами. Сначала переназначьте картины на другие места продажи.',
  /** 422 — transfer target has never opened the app, so no username→ID resolution exists. */
  TRANSFER_USER_NOT_FOUND: 'Этот пользователь ещё не открывал приложение. Попросите его открыть приложение, после чего повторите передачу.',
  /** 429 — rate limit exceeded on auth/transfer endpoints; `Retry-After` header set. */
  RATE_LIMITED: 'Слишком много запросов. Пожалуйста, подождите немного и попробуйте ещё раз.',
  /** 500 — unexpected server failure. Internals are never leaked. */
  INTERNAL_ERROR: 'Что-то пошло не так. Попробуйте ещё раз позже.',
} as const;

export type ApiErrorCode = keyof typeof ERROR_MESSAGES;

/** HTTP status for each error code — single mapping, single source of truth. */
export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  SESSION_EXPIRED: 401,
  ACCESS_DENIED: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  PHOTO_TYPE_INVALID: 400,
  PHOTO_TOO_LARGE: 413,
  PHOTO_LIMIT_EXCEEDED: 400,
  LOCATION_IN_USE: 409,
  TRANSFER_USER_NOT_FOUND: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const;

/**
 * Per-field validation messages for the `fieldErrors` map (400 VALIDATION_ERROR).
 * Server-side class-validator emits these; the frontend reuses the same strings
 * for inline zod validation so server and client never disagree in Russian.
 */
export const FIELD_ERROR_MESSAGES = {
  NAME_REQUIRED: 'Введите название картины.',
  /** Painting name exceeds the 200-char contract cap (MaxLength 200). */
  NAME_TOO_LONG: 'Название слишком длинное. Максимум — 200 символов.',
  PRICE_REQUIRED: 'Укажите цену.',
  PRICE_INTEGER: 'Цена должна быть целым числом.',
  PRICE_NON_NEGATIVE: 'Цена не может быть отрицательной.',
  CURRENCY_REQUIRED: 'Укажите валюту.',
  CURRENCY_INVALID: 'Неизвестная валюта.',
  LOCATION_REQUIRED: 'Выберите или создайте место продажи.',
  LOCATION_EXACTLY_ONE: 'Укажите одно из двух: существующее место продажи или новое место продажи.',
  /** locationId is not a valid serial id string (service 404s on the DB miss). */
  LOCATION_ID_INVALID: 'Недопустимый идентификатор места продажи.',
  LOCATION_KIND_INVALID: 'Недопустимый тип места продажи.',
  LOCATION_VALUE_REQUIRED: 'Введите адрес или ссылку на сайт.',
  LOCATION_URL_INVALID: 'Ссылка должна быть действительным адресом (http или https).',
  TARGET_USERNAME_REQUIRED: 'Введите имя пользователя Telegram.',
  TARGET_USERNAME_FORMAT: 'Имя пользователя должно быть вида @username или username.',
} as const;

export type FieldErrorCode = keyof typeof FIELD_ERROR_MESSAGES;

/**
 * Standard error envelope — EVERY error response has exactly this shape.
 * Clients branch on `code` (stable) and HTTP status, never on message text.
 */
export interface ApiErrorBody {
  error: {
    /** Stable machine-readable code. */
    code: ApiErrorCode;
    /** Russian, user-facing message. */
    message: string;
    /**
     * Present on 400 VALIDATION_ERROR (and photo validation errors):
     * field name → array of Russian constraint messages.
     */
    fieldErrors?: Record<string, string[]>;
    /**
     * Extra structured context:
     * - LOCATION_IN_USE → `{ paintings: PaintingRefDto[] }` (the affected paintings).
     */
    details?: {
      paintings?: PaintingRefDto[];
    };
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 3. PRIMITIVES
 * ══════════════════════════════════════════════════════════════════════════ */

/** ISO-8601 UTC timestamp. */
export type IsoDateTime = string;

/** Price currency — only RUB/USD/EUR (design D4). */
export type Currency = 'rub' | 'usd' | 'eur';

/** Sales location kind (design D4): offline = street address, online = http(s) URL. */
export type LocationKind = 'offline' | 'online';

/** HTTP methods used by this API (PUT is intentionally unused). */
export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/* ══════════════════════════════════════════════════════════════════════════
 * 4. DTOs — RESPONSE SHAPES
 * ══════════════════════════════════════════════════════════════════════════ */

/** Lightweight user reference used across ownership DTOs. */
export interface UserSummaryDto {
  /** Telegram user ID as STRING — never a number (> 2^53 precision, design D3). */
  id: string;
  /** Telegram @username (without the leading @) or null if the user has none. */
  username: string | null;
  /** Telegram first name. */
  first_name: string;
}

/**
 * Response of GET /api/v1/auth/me — the app's bootstrap call.
 * Semantics:
 * - 401: initData invalid/missing/expired → reopen-app guidance (see ERROR_MESSAGES).
 * - 403 ACCESS_DENIED: a VALID user who is not the current owner — a known
 *   non-owner, OR the previous owner whose transfer is pending (access is
 *   lost immediately on confirmation, spec ownership-transfer). No data is
 *   returned; the frontend AuthGate routes this to the access-denied screen.
 * - 200: the caller IS the owner. On the very first-ever open this call
 *   claims ownership server-side (race-safe, design D3); on a pending
 *   transfer target's open it performs the atomic swap. `is_owner` is
 *   therefore ALWAYS `true` on 200 and `owner` describes the app's current
 *   owner (the caller).
 */
export interface UserDto extends UserSummaryDto {
  /** Always true on 200 (the ownership guard 403s every non-owner before this handler runs). */
  is_owner: boolean;
  /** The current app owner's identity — the "owner info" of the bootstrap call. */
  owner: UserSummaryDto;
}

/**
 * Ownership audit event types (design D4). The TWO-PHASE transfer flow
 * produces all three: 'transfer-initiated' (POST /ownership/transfer),
 * 'claim' (first-ever open), 'transfer-confirmed' (the target's next open —
 * the atomic swap in the ownership guard).
 */
export type OwnershipEventType = 'claim' | 'transfer-initiated' | 'transfer-confirmed';

export interface OwnershipEventDto {
  id: string;
  type: OwnershipEventType;
  /** Previous owner; `null` for 'claim' events (the first user has no predecessor). */
  from: UserSummaryDto | null;
  /** Claiming user for 'claim'; transfer target for transfer events. */
  to: UserSummaryDto;
  createdAt: IsoDateTime;
}

/**
 * Response of GET /api/v1/ownership — current owner + full audit trail.
 * Only the current owner may read it (403 otherwise).
 */
export interface OwnershipDto {
  owner: UserSummaryDto;
  /** History, newest first: claim, transfer-confirmed, ... */
  events: OwnershipEventDto[];
}

/**
 * Response of POST /api/v1/ownership/transfer (200).
 * ============================================================================
 * The transfer is TWO-PHASE (claim-on-next-open, design D3):
 *
 *   transfer-initiated → (target's next validated open) → transfer-confirmed
 *
 * This call performs ONLY the first phase: it records the pending transfer
 * (`status: 'transfer-initiated'` — an 'transfer-initiated' audit event) and
 * returns the FULL ownership state (OwnershipDto) AFTER that write: `owner`
 * is still the caller and `events[0]` is the freshly-recorded initiation.
 *
 * The second phase happens on the TARGET's next validated open: the ownership
 * guard atomically swaps ownership and writes the 'transfer-confirmed' event.
 * From that moment the PREVIOUS owner's every subsequent request (including
 * /auth/me) returns 403 ACCESS_DENIED; the target's request that performed
 * the swap returns 200.
 */
export interface TransferResultDto extends OwnershipDto {
  /** The phase reached by THIS call — always 'transfer-initiated' (two-phase flow). */
  status: 'transfer-initiated';
}

/** Minimal painting reference (used in LOCATION_IN_USE `details.paintings`). */
export interface PaintingRefDto {
  id: string;
  name: string;
}

/** Location summary embedded in painting DTOs (id + kind + value, no timestamps). */
export interface LocationSummaryDto {
  id: string;
  kind: LocationKind;
  value: string;
}

/**
 * A single photo attached to a painting.
 * `url` is the AUTHED stream path (e.g. `/api/v1/photos/<id>/stream`) — NOT an
 * embeddable `<img src>`: it requires the X-Telegram-Init-Data header, which
 * plain <img> cannot send. The frontend fetches bytes through its authed fetch
 * wrapper and creates a blob URL for display. Served with
 * `Cache-Control: private, immutable`.
 */
export interface PhotoDto {
  id: string;
  url: string;
  /** Gallery order index (0-based, upload order preserved). */
  position: number;
}

/** Fields shared by list items and full painting detail. */
export interface PaintingBaseDto {
  id: string;
  /** Painting name, Russian text. */
  name: string;
  /** Integer minor units (kopecks/cents). Never negative. */
  price_minor: number;
  currency: Currency;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/**
 * One row of GET /api/v1/paintings (newest first).
 * Includes the first photo's thumbnail URL + location summary, so the list
 * screen renders name, price, location, and thumbnail from one request.
 * Price is formatted client-side from `price_minor` + `currency` (ru-RU locale).
 */
export interface PaintingListItemDto extends PaintingBaseDto {
  /** The painting's sales location (address or URL). */
  location: LocationSummaryDto;
  /** First photo by gallery order, or null when the painting has no photos. */
  firstPhoto: PhotoDto | null;
  /** Total photo count (for "N фото" labels). */
  photoCount: number;
}

/**
 * Full painting detail — GET /api/v1/paintings/:id, and the response of
 * POST/PATCH /api/v1/paintings.
 */
export interface PaintingDto extends PaintingBaseDto {
  location: LocationSummaryDto;
  /** All photos in gallery order (by `position`). */
  photos: PhotoDto[];
}

/** Full location record — GET /api/v1/locations and POST/PATCH /api/v1/locations. */
export interface LocationDto {
  id: string;
  kind: LocationKind;
  /** Offline → street address; online → validated http(s) URL. */
  value: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/* ══════════════════════════════════════════════════════════════════════════
 * 5. REQUEST DTOs — BODY SHAPES
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * POST /api/v1/ownership/transfer body.
 * `target_username` accepts the target Telegram username with or without the
 * leading '@'. The server resolves it via the recorded-users table; unknown
 * users → 422 TRANSFER_USER_NOT_FOUND (they must open the app first).
 */
export interface TransferRequestDto {
  target_username: string;
}

/**
 * POST /api/v1/paintings body.
 * Location is REQUIRED via exactly one of:
 * - `locationId` — an existing location from the bank, or
 * - `newLocation` — created inline and saved to the bank, applied to the
 *   painting in the same request (locations spec, select-or-add inline).
 * `price_minor` is a non-negative integer (minor units). Photos are NOT part
 * of this body — attach them afterwards via POST /api/v1/paintings/:id/photos.
 */
export interface PaintingCreateRequestDto {
  name: string;
  price_minor: number;
  currency: Currency;
  locationId?: string;
  newLocation?: LocationCreateRequestDto;
  // validation: exactly one of locationId | newLocation must be present.
}

/**
 * PATCH /api/v1/paintings/:id body — partial update, every field optional.
 * The location exactly-one rule applies only when a location field is present.
 * Photos are NOT updated here (managed via the photos endpoints).
 */
export interface PaintingUpdateRequestDto {
  name?: string;
  price_minor?: number;
  currency?: Currency;
  locationId?: string;
  newLocation?: LocationCreateRequestDto;
}

/**
 * POST /api/v1/locations and inline `newLocation` body.
 * `value`: offline → non-empty street address; online → valid http(s) URL.
 */
export interface LocationCreateRequestDto {
  kind: LocationKind;
  value: string;
}

/** PATCH /api/v1/locations/:id body — partial update, every field optional. */
export interface LocationUpdateRequestDto {
  kind?: LocationKind;
  value?: string;
}

/**
 * POST /api/v1/paintings/:id/photos — multipart/form-data upload.
 * Wire format: field `photos`, one or more image files. Constraints below are
 * enforced server-side; violations → PHOTO_TYPE_INVALID / PHOTO_TOO_LARGE /
 * PHOTO_LIMIT_EXCEEDED (see ERROR_MESSAGES). The frontend applies the same
 * limits client-side before upload for a better UX.
 */
export const PHOTO_UPLOAD = {
  /** multipart field name — files are uploaded under this name. */
  fieldName: 'photos',
  /** Maximum files per painting (across all uploads, not per request). */
  maxFilesPerPainting: 10,
  /** Per-file size cap, bytes (10 MB). */
  maxSizeBytes: 10 * 1024 * 1024,
  /** Allowed image MIME types. */
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
} as const;

/** Response of POST /api/v1/paintings/:id/photos (201) — the created photos, gallery order preserved. */
export interface PhotoUploadResultDto {
  photos: PhotoDto[];
}
