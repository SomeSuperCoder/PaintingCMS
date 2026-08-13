/**
 * LocationsService — persistence + mapping + domain errors for the location
 * bank (locations spec, task 4.3).
 * ============================================================================
 * DB ↔ DTO boundary: rows are snake_case with serial ids and Date timestamps;
 * the contract LocationDto is camelCase with string ids and ISO-8601 strings.
 * ALL mapping lives here (a select-projection concern per schema.ts
 * conventions) — controllers never see a DB row.
 *
 * Error policy: contract-shaped envelopes are thrown AT THE THROW SITE
 * (mirroring AuthGuard/OwnershipService) — the global HttpExceptionFilter
 * passes them through unchanged. Only 404 NOT_FOUND and 409 LOCATION_IN_USE
 * originate here; validation 400s come from the DTO pipe, 401/403 from the
 * guards.
 *
 * Delete is race-safe by construction (design D3 TOCTOU discipline): we do
 * NOT read-then-delete. The DELETE itself is the arbiter — if a painting
 * references the location, the FK RESTRICT (schema.ts paintings.location_id)
 * raises 23503 and we translate it to the contract 409, querying the affected
 * paintings only after the failure (never on the happy path — no N+1).
 */

import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';

import {
  ERROR_MESSAGES,
  type LocationDto,
  type LocationKind,
  type PaintingRefDto,
} from '@painting/shared';
import { DRIZZLE_DB, type DrizzleDb, type DrizzleTx } from '../db/drizzle.module';
import { locations, paintings } from '../db/schema';
import {
  LocationCreateRequestDto,
  LocationUpdateRequestDto,
} from './locations.dto';

/** The DB row shape for the locations table (serial id, Date timestamps). */
type LocationRow = typeof locations.$inferSelect;

@Injectable()
export class LocationsService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb) {}

  /** All locations in stable order — oldest first (endpoint registry: "stable order by createdAt for the select dropdown"); id breaks timestamp ties. */
  async findAll(): Promise<LocationDto[]> {
    const rows = await this.db
      .select()
      .from(locations)
      .orderBy(asc(locations.createdAt), asc(locations.id));
    return rows.map((row) => this.toDto(row));
  }

  /**
   * Create a location; the DTO pipe has already validated kind + value (201 via
   * the controller). The optional `tx` lets a caller (paintings inline
   * `newLocation`, locations spec select-or-add inline) run this insert inside
   * ITS OWN transaction: the row commits only when the caller's whole
   * transaction commits, so an inline location + painting save is atomic — a
   * painting never persists with a half-created location.
   */
  async create(body: LocationCreateRequestDto, tx?: DrizzleTx): Promise<LocationDto> {
    const db = tx ?? this.db;
    const [row] = await db
      .insert(locations)
      .values({ kind: body.kind, value: body.value })
      .returning();
    return this.toDto(row);
  }

  /**
   * Partial update. Only the fields present in the body are written; the
   * schema's $onUpdate (schema.ts) refreshes updated_at, and returning() gives
   * the fresh row in one round-trip — no N+1 re-select.
   *
   * An empty PATCH ({}) is a legitimate no-op per the contract (every field
   * optional) — but `UPDATE ... SET` with zero columns is invalid SQL, so the
   * current row is returned unchanged instead (updated_at untouched).
   */
  async update(id: number, body: LocationUpdateRequestDto): Promise<LocationDto> {
    const setValues: Partial<typeof locations.$inferInsert> = {};
    if (body.kind !== undefined) setValues.kind = body.kind;
    if (body.value !== undefined) setValues.value = body.value;

    if (Object.keys(setValues).length === 0) {
      const [row] = await this.db
        .select()
        .from(locations)
        .where(eq(locations.id, id))
        .limit(1);
      if (row === undefined) {
        throw this.notFound();
      }
      return this.toDto(row);
    }

    const [row] = await this.db
      .update(locations)
      .set(setValues)
      .where(eq(locations.id, id))
      .returning();
    if (row === undefined) {
      throw this.notFound();
    }
    return this.toDto(row);
  }

  /**
   * Delete a location. 204 on success (controller), 404 when missing, 409
   * LOCATION_IN_USE when paintings reference it — with the affected paintings
   * in details.paintings (contract ApiErrorBody, PaintingRefDto[]).
   */
  async remove(id: number): Promise<void> {
    try {
      const result = await this.db.delete(locations).where(eq(locations.id, id));
      // rowCount: 1 = deleted; 0 = nothing matched (404). `null` would also
      // 404 — impossible for a pg DELETE, but fail safe (mirrors OwnershipService).
      if (result.rowCount !== 1) {
        throw this.notFound();
      }
    } catch (error) {
      // 23503 = foreign_key_violation — the FK RESTRICT (schema.ts) refused
      // the delete because paintings reference this location. drizzle-orm ≥0.31
      // wraps EVERY driver error in DrizzleQueryError (pg-core/session
      // queryWithCache) and keeps the original pg DatabaseError on `cause` — a
      // bare `instanceof DatabaseError` on the outer error never matched, so
      // this 409 path used to be dead code (500 instead of 409).
      if (
        error instanceof DrizzleQueryError &&
        error.cause instanceof DatabaseError &&
        error.cause.code === '23503'
      ) {
        const refs = await this.db
          .select({ id: paintings.id, name: paintings.name })
          .from(paintings)
          .where(eq(paintings.locationId, id))
          // Stable order for the confirm dialog ("listing the affected paintings").
          .orderBy(asc(paintings.id));
        throw this.locationInUse(
          refs.map((painting) => ({
            id: String(painting.id),
            name: painting.name,
          })),
        );
      }
      // Any other failure (DB down, ...) is a real fault → rethrow → 500 by
      // the global filter; never masked as 404/409.
      throw error;
    }
  }

  /** DB row → contract LocationDto (snake→camel, serial id → string, Date → ISO-8601). */
  private toDto(row: LocationRow): LocationDto {
    return {
      id: String(row.id),
      // Safe assertion: locations_kind_check (schema.ts) only allows the two
      // contract kinds — same pattern as OwnershipService.eventType.
      kind: row.kind as LocationKind,
      value: row.value,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** 404 with the CONTRACT envelope (code + Russian message). */
  private notFound(): NotFoundException {
    return new NotFoundException({
      error: { code: 'NOT_FOUND', message: ERROR_MESSAGES.NOT_FOUND },
    });
  }

  /** 409 with the contract envelope + the affected paintings (for the reassign dialog). */
  private locationInUse(refs: PaintingRefDto[]): ConflictException {
    return new ConflictException({
      error: {
        code: 'LOCATION_IN_USE',
        message: ERROR_MESSAGES.LOCATION_IN_USE,
        details: { paintings: refs },
      },
    });
  }
}
