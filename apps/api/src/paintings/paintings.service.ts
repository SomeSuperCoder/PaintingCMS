/**
 * PaintingsService — the paintings CRUD + DTO mapping (task 4.1, spec
 * paintings, contract PaintingDto / PaintingListItemDto).
 * ============================================================================
 * Query discipline — NO N+1:
 *   - list():   2 queries — (1) paintings ⋈ locations (newest first), (2) ALL
 *               photos for those painting ids via IN (...), grouped in memory.
 *   - detail(): 2 queries — painting ⋈ location (LIMIT 1) + that painting's
 *               photos ordered by position.
 *   - create/update: fixed extra queries (location existence check, INSERT/
 *               UPDATE RETURNING) then the SAME detail() path — one mapping
 *               function, zero DTO drift between write and read responses.
 *
 * Mapping conventions (mirrors OwnershipService): DB serial ids → String()
 * for the wire (contract: opaque string ids), timestamps → ISO-8601 via
 * toISOString(), CHECK-constrained TEXT enums cast to the contract union with
 * a safe `as` (the CHECK is the runtime guarantee, schema.ts).
 *
 * Error policy: every 404 is thrown at the throw site with the CONTRACT
 * envelope ({ error: { code: 'NOT_FOUND', message } }) so the global
 * HttpExceptionFilter passes it through unchanged — never re-mapped, never
 * leaking internals.
 */

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, desc, eq, inArray } from 'drizzle-orm';

import {
  API_PATHS,
  ERROR_MESSAGES,
  type Currency,
  type LocationKind,
  type LocationSummaryDto,
  type PaintingDto,
  type PaintingListItemDto,
  type PhotoDto,
} from '@painting/shared';

import { DRIZZLE_DB, type DrizzleDb, type DrizzleTx } from '../db/drizzle.module';
import { LocationsService } from '../locations/locations.service';
import { locations, paintings, photos } from '../db/schema';
import { PhotosService } from '../photos/photos.service';
import type { PaintingCreateDto } from './dto/painting-create.dto';
import type { PaintingUpdateDto } from './dto/painting-update.dto';

/** Painting row joined with its location — the shape every mapping starts from. */
interface PaintingLocationRow {
  id: number;
  name: string;
  priceMinor: number;
  currency: string;
  locationId: number;
  createdAt: Date;
  updatedAt: Date;
  locationKind: string;
  locationValue: string;
}

/** The photos fields the DTOs need (url is derived, not stored). */
interface PhotoRow {
  id: number;
  position: number;
}

/**
 * Shared select projection: painting ⋈ location. Reused by list and detail so
 * both map from byte-identical rows — the join is the single source of truth
 * for the location summary.
 */
const paintingWithLocation = {
  id: paintings.id,
  name: paintings.name,
  priceMinor: paintings.priceMinor,
  currency: paintings.currency,
  locationId: paintings.locationId,
  createdAt: paintings.createdAt,
  updatedAt: paintings.updatedAt,
  locationKind: locations.kind,
  locationValue: locations.value,
};

@Injectable()
export class PaintingsService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    // Cascade hook target (photos module): injects the exported PhotosService
    // through the composition root — one-directional dependency (Paintings →
    // Photos), no event bus, no module cycle (PhotosModule imports nothing
    // from Paintings).
    private readonly photosService: PhotosService,
    // Inline newLocation creation (locations spec, select-or-add inline): the
    // locations module owns the insert + row→DTO mapping — this service only
    // asks it to run inside the painting's transaction. Injected through the
    // composition root, never constructed (D in SOLID); one-directional
    // dependency (Paintings → Locations), no cycle.
    private readonly locationsService: LocationsService,
  ) {}

  /** GET /api/v1/paintings — all paintings, newest first, with first photo + location. */
  async list(): Promise<PaintingListItemDto[]> {
    const rows = await this.db
      .select(paintingWithLocation)
      .from(paintings)
      .innerJoin(locations, eq(paintings.locationId, locations.id))
      .orderBy(desc(paintings.createdAt));

    if (rows.length === 0) {
      return [];
    }

    // ONE photos query for every list row — grouped in memory, never per-row
    // (the N+1 the photos join order would otherwise cause).
    const photoRows = await this.db
      .select({
        paintingId: photos.paintingId,
        id: photos.id,
        position: photos.position,
      })
      .from(photos)
      .where(inArray(photos.paintingId, rows.map((row) => row.id)))
      .orderBy(asc(photos.position), asc(photos.id));

    const photosByPainting = new Map<number, PhotoRow[]>();
    for (const photo of photoRows) {
      const group = photosByPainting.get(photo.paintingId);
      if (group === undefined) {
        photosByPainting.set(photo.paintingId, [photo]);
      } else {
        group.push(photo);
      }
    }

    return rows.map((row) =>
      this.toListItem(row, photosByPainting.get(row.id) ?? []),
    );
  }

  /** GET /api/v1/paintings/:id — full detail; 404 when missing or malformed id. */
  async getDetail(rawId: string): Promise<PaintingDto> {
    return this.getDetailById(this.parseId(rawId));
  }

  /**
   * POST /api/v1/paintings — create and return the full detail (201, Location
   * header set by the controller). The location comes from exactly one of
   * `locationId` (existence re-verified with a direct SELECT so a bad id is a
   * clean 404, never a raw FK 23503 that would surface as 500) or
   * `newLocation` (created inline and saved to the bank — locations spec
   * select-or-add inline). Both writes run in ONE transaction: a failed
   * location insert rolls the painting back, so a painting can never persist
   * without its location.
   */
  async create(dto: PaintingCreateDto): Promise<PaintingDto> {
    if (dto.locationId !== undefined) {
      await this.assertLocationExists(dto.locationId);
    }

    const inserted = await this.db.transaction(async (tx) => {
      let locationId: number;
      if (dto.newLocation !== undefined) {
        const created = await this.locationsService.create(dto.newLocation, tx);
        locationId = Number(created.id);
      } else {
        // The DTO exactly-one gate (isLocationExactlyOneOf) guarantees
        // locationId is defined whenever newLocation is absent.
        locationId = Number(dto.locationId);
      }

      const [row] = await tx
        .insert(paintings)
        .values({
          name: dto.name,
          priceMinor: dto.price_minor,
          currency: dto.currency,
          locationId,
        })
        .returning({ id: paintings.id });
      return row;
    });

    return this.getDetailById(inserted.id);
  }

  /**
   * PATCH /api/v1/paintings/:id — partial update, returns the updated detail;
   * 404 when the painting or a provided location does not exist. An empty
   * body (nothing to update) is a no-op that returns the current painting.
   * A `newLocation` update (mutually exclusive with locationId, enforced by
   * the DTO) creates the location row in the SAME transaction as the painting
   * UPDATE — atomic, mirroring create().
   */
  async update(rawId: string, dto: PaintingUpdateDto): Promise<PaintingDto> {
    const id = this.parseId(rawId);

    // Pre-read separates "painting missing" (404) from "nothing to update"
    // (no-op) — Drizzle rejects .set({}) with an empty object, so the no-op
    // must never reach an UPDATE.
    const [existing] = await this.db
      .select({ id: paintings.id })
      .from(paintings)
      .where(eq(paintings.id, id))
      .limit(1);
    if (existing === undefined) {
      throw this.notFound();
    }

    if (dto.locationId !== undefined) {
      await this.assertLocationExists(dto.locationId);
    }

    const set: Partial<typeof paintings.$inferInsert> = {};
    if (dto.name !== undefined) set.name = dto.name;
    if (dto.price_minor !== undefined) set.priceMinor = dto.price_minor;
    if (dto.currency !== undefined) set.currency = dto.currency;

    const locationChanged =
      dto.locationId !== undefined || dto.newLocation !== undefined;
    if (locationChanged) {
      // Resolve the target location INSIDE the painting's transaction so a
      // failed inline insert rolls back the painting UPDATE too.
      await this.db.transaction(async (tx) => {
        if (dto.newLocation !== undefined) {
          const created = await this.locationsService.create(dto.newLocation, tx);
          set.locationId = Number(created.id);
        } else {
          // DTO not-both gate guarantees locationId is defined here.
          set.locationId = Number(dto.locationId);
        }
        await this.applyUpdate(tx, id, set);
      });
    } else if (Object.keys(set).length > 0) {
      await this.applyUpdate(this.db, id, set);
    }

    return this.getDetailById(id);
  }

  /** DELETE /api/v1/paintings/:id — 204; 404 when missing. Photo rows cascade
   * in the DB (schema.ts onDelete: 'cascade'); the file BYTES are cleaned by
   * the photos module's cascade hook (photos spec) — see remove(). */
  async remove(rawId: string): Promise<void> {
    const id = this.parseId(rawId);

    // File-byte cleanup BEFORE the row delete, as the photos module contract
    // mandates: deleteFilesByPainting reads photo ROWS to resolve their
    // paths, so it must run while they still exist (after the DB CASCADE it
    // is a safe no-op that would leave orphaned bytes). The hook is
    // best-effort and never throws; a failed unlink is logged and swept
    // operationally (design D5) — a disk hiccup must not fail a 204 delete.
    // A malformed id never reaches either step (parseId throws 404); a
    // non-existent painting deletes 0 files and then 0 rows → 404.
    await this.photosService.deleteFilesByPainting(id);

    const result = await this.db
      .delete(paintings)
      .where(eq(paintings.id, id));

    if (result.rowCount === 0) {
      throw this.notFound();
    }
  }

  /* ─────────────────────────── internals ─────────────────────────── */

  /** Single detail loader + mapping path — used by GET/POST/PATCH alike. */
  private async getDetailById(id: number): Promise<PaintingDto> {
    const [row] = await this.db
      .select(paintingWithLocation)
      .from(paintings)
      .innerJoin(locations, eq(paintings.locationId, locations.id))
      .where(eq(paintings.id, id))
      .limit(1);

    if (row === undefined) {
      throw this.notFound();
    }

    const photoRows = await this.loadPhotos(id);
    return this.toDetail(row, photoRows);
  }

  private async loadPhotos(paintingId: number): Promise<PhotoRow[]> {
    return this.db
      .select({ id: photos.id, position: photos.position })
      .from(photos)
      .where(eq(photos.paintingId, paintingId))
      // Gallery order; id breaks any position tie deterministically.
      .orderBy(asc(photos.position), asc(photos.id));
  }

  /**
   * UPDATE ... WHERE id, shared by the bare-db and transactional paths (both
   * handles expose the same query surface). 404s when the row vanished
   * between the pre-read and the write (concurrent delete) — never a silent
   * 200 for a deleted painting.
   */
  private async applyUpdate(
    db: DrizzleDb | DrizzleTx,
    id: number,
    set: Partial<typeof paintings.$inferInsert>,
  ): Promise<void> {
    const [updated] = await db
      .update(paintings)
      .set(set)
      .where(eq(paintings.id, id))
      .returning({ id: paintings.id });
    if (updated === undefined) {
      throw this.notFound();
    }
  }

  /** Direct existence check — the FK would catch it, but as a raw 23503 500. */
  private async assertLocationExists(locationId: string): Promise<void> {
    const id = Number(locationId);
    // Defense in depth (mirrors parseId): the DTO pipe guarantees /^\d+$/ on
    // the happy path, but a NaN/≤0 that slips through would hit pg as an
    // invalid parameter (500) or falsely match row 0 — answer the contract 404.
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw this.notFound();
    }

    const [location] = await this.db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.id, id))
      .limit(1);

    if (location === undefined) {
      throw this.notFound();
    }
  }

  /**
   * The :id path param must be a positive integer. Anything else can never
   * match a serial row — answer 404, NEVER send it to Postgres (an int parse
   * error there would surface as 500 and leak internals).
   */
  private parseId(raw: string): number {
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw this.notFound();
    }
    return id;
  }

  private toListItem(row: PaintingLocationRow, photoRows: PhotoRow[]): PaintingListItemDto {
    const first = photoRows[0] ?? null;
    return {
      id: String(row.id),
      name: row.name,
      price_minor: row.priceMinor,
      currency: row.currency as Currency,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      location: this.toLocationSummary(row),
      firstPhoto: first ? this.toPhoto(first) : null,
      photoCount: photoRows.length,
    };
  }

  private toDetail(row: PaintingLocationRow, photoRows: PhotoRow[]): PaintingDto {
    return {
      id: String(row.id),
      name: row.name,
      price_minor: row.priceMinor,
      currency: row.currency as Currency,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      location: this.toLocationSummary(row),
      photos: photoRows.map((photo) => this.toPhoto(photo)),
    };
  }

  private toLocationSummary(row: PaintingLocationRow): LocationSummaryDto {
    return {
      id: String(row.locationId),
      // Safe assertion: locations_kind_check (schema.ts) limits the column to
      // the two contract LocationKind values.
      kind: row.locationKind as LocationKind,
      value: row.locationValue,
    };
  }

  private toPhoto(photo: PhotoRow): PhotoDto {
    const id = String(photo.id);
    return {
      id,
      // The AUTHED stream path (contract PhotoDto.url): the photos module
      // serves the bytes; this module only publishes the path.
      url: API_PATHS.photoStream(id),
      position: photo.position,
    };
  }

  /** 404 with the CONTRACT envelope — the global filter passes it through. */
  private notFound(): NotFoundException {
    return new NotFoundException({
      error: { code: 'NOT_FOUND', message: ERROR_MESSAGES.NOT_FOUND },
    });
  }
}
