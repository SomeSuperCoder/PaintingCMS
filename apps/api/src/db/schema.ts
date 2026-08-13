/**
 * PaintingCMS — Drizzle schema (openspec task 2.2, design D3/D4).
 * =============================================================
 * Six tables: users, app_state, ownership_events, locations, paintings, photos.
 *
 * Conventions
 * -----------
 * - Telegram user ids are TEXT, never numeric: Telegram ids exceed 2^53 and a
 *   JS/PG number silently loses precision (design D3). users.id is the FK
 *   target everywhere a user is referenced.
 * - Money is stored as integer minor units (`price_minor`, kopecks/cents) with
 *   a TEXT + CHECK currency enum — no floats (paintings spec, price validation).
 * - Enums are TEXT + CHECK constraints, not Postgres enum types: adding a value
 *   later is a cheap ALTER, and the CHECKed values match the shared contract
 *   (packages/shared/src/api-contract.ts: Currency, LocationKind,
 *   OwnershipEventType) 1:1.
 * - DB columns are snake_case; DTOs are camelCase (api-contract). Mapping is a
 *   select-projection concern in the service layer, never a DB rename.
 * - FK policies: photos → paintings ON DELETE CASCADE (painting delete removes
 *   photos — photos spec); paintings → locations ON DELETE RESTRICT (a location
 *   in use cannot be deleted — locations spec, LOCATION_IN_USE).
 * - `updated_at` is managed client-side via $onUpdate() (Drizzle query builder
 *   writes it on UPDATE). `created_at` is always a DB default now().
 */

import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/* ══════════════════════════════════════════════════════════════════════════
 * users — every validated Telegram user (design D3)
 * ══════════════════════════════════════════════════════════════════════════ */
export const users = pgTable(
  'users',
  {
    /** Telegram user id as TEXT (precision-safe, > 2^53). */
    id: text('id').primaryKey(),
    /** Telegram @username (without leading @), nullable — many users have none. */
    username: text('username'),
    /** Telegram first name, nullable (optional in initData). */
    firstName: text('first_name'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // NULLs are distinct in Postgres unique indexes → unlimited username-less users.
    uniqueIndex('users_username_idx').on(t.username),
  ],
);

/* ══════════════════════════════════════════════════════════════════════════
 * app_state — singleton row holding the current owner (design D3)
 * The single-row pattern: id defaults to 1 + CHECK (id = 1) makes exactly one
 * row exist. The first validated user's claim INSERT races on this constraint
 * — the loser's INSERT fails, so exactly one owner ever exists.
 * ══════════════════════════════════════════════════════════════════════════ */
export const appState = pgTable(
  'app_state',
  {
    /** Single-row sentinel — always 1 (CHECK below). */
    id: integer('id').primaryKey().default(1),
    /** The current owner. NOT NULL — there is always exactly one. */
    currentOwnerId: text('current_owner_id')
      .notNull()
      .references(() => users.id),
    /** Pending transfer target; the swap applies on the target's next open. */
    pendingTransferToId: text('pending_transfer_to_id').references(
      () => users.id,
    ),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check('app_state_single_row', sql`${t.id} = 1`)],
);

/* ══════════════════════════════════════════════════════════════════════════
 * ownership_events — append-only audit trail (design D3)
 * event_type values match the shared contract OwnershipEventType:
 * 'claim' | 'transfer-initiated' | 'transfer-confirmed'.
 * ══════════════════════════════════════════════════════════════════════════ */
export const ownershipEvents = pgTable(
  'ownership_events',
  {
    id: serial('id').primaryKey(),
    eventType: text('event_type').notNull(),
    /** Who performed the action (the validating user). */
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id),
    /** Previous owner; NULL for the first 'claim'. */
    fromOwnerId: text('from_owner_id').references(() => users.id),
    /** Target; NULL only for a hypothetical aborted-initiated event. */
    toOwnerId: text('to_owner_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'ownership_events_type_check',
      sql`${t.eventType} IN ('claim', 'transfer-initiated', 'transfer-confirmed')`,
    ),
    // Ownership screen lists history newest-first (ownership spec).
    index('ownership_events_created_at_idx').on(t.createdAt),
  ],
);

/* ══════════════════════════════════════════════════════════════════════════
 * locations — sales location bank (design D4)
 * kind: 'offline' (street address) | 'online' (http(s) URL — validated at the
 * API layer per locations spec). value is non-empty for both kinds.
 * ══════════════════════════════════════════════════════════════════════════ */
export const locations = pgTable(
  'locations',
  {
    id: serial('id').primaryKey(),
    kind: text('kind').notNull(),
    value: text('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("locations_kind_check", sql`${t.kind} IN ('offline', 'online')`),
    check('locations_value_check', sql`length(${t.value}) > 0`),
    // Locations screen filters/renders by kind.
    index('locations_kind_idx').on(t.kind),
  ],
);

/* ══════════════════════════════════════════════════════════════════════════
 * paintings — the sale records (design D4)
 * price_minor is integer minor units (kopecks/cents), non-negative.
 * currency: 'rub' | 'usd' | 'eur' — matches contract Currency.
 * location_id RESTRICT: a location referenced by any painting cannot be
 * deleted (locations spec: block until paintings are reassigned).
 * ══════════════════════════════════════════════════════════════════════════ */
export const paintings = pgTable(
  'paintings',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    priceMinor: integer('price_minor').notNull(),
    currency: text('currency').notNull(),
    locationId: integer('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check('paintings_name_check', sql`length(${t.name}) > 0`),
    check('paintings_price_check', sql`${t.priceMinor} >= 0`),
    check("paintings_currency_check", sql`${t.currency} IN ('rub', 'usd', 'eur')`),
    // List screen is newest-first (paintings spec).
    index('paintings_created_at_idx').on(t.createdAt.desc()),
  ],
);

/* ══════════════════════════════════════════════════════════════════════════
 * photos — a painting's gallery (design D5)
 * painting_id CASCADE: deleting a painting removes its photo rows (photos
 * spec: cleanup on painting delete; file bytes are removed by the service).
 * UNIQUE (painting_id, position): preserves the owner's chosen gallery order —
 * no two photos share a position inside one painting.
 * ══════════════════════════════════════════════════════════════════════════ */
export const photos = pgTable(
  'photos',
  {
    id: serial('id').primaryKey(),
    paintingId: integer('painting_id')
      .notNull()
      .references(() => paintings.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    /** Gallery order (0-based, upload order preserved — photos spec). */
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('photos_painting_position_idx').on(t.paintingId, t.position)],
);

/**
 * Aggregate schema object consumed by DrizzleModule:
 * `drizzle(pool, { schema })` types the query builder + migration generator
 * against every table.
 */
export const schema = {
  users,
  appState,
  ownershipEvents,
  locations,
  paintings,
  photos,
};
