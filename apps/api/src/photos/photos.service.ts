/**
 * PhotosService — photo lifecycle (design D5, photos spec).
 * =========================================================
 * Every photo operation behind the guarded controller:
 *  - uploadPhotos: validate (painting exists → 404, per-painting cap →
 *    400 PHOTO_LIMIT_EXCEEDED), assign gallery positions, insert rows. On
 *    ANY failure the files multer already wrote to disk are deleted — the
 *    cleanup contract (a failed upload never leaves orphaned bytes).
 *  - deletePhoto: delete the row (DB = source of truth), then unlink the
 *    file best-effort — a stale file is an orphan for the operational sweep,
 *    never a failed user request (design D5 risk section).
 *  - getPhotoForStream: 404 when the row OR its bytes are gone (the guarded
 *    stream endpoint serves nothing for a missing photo).
 *  - deleteFilesByPainting: the painting-delete cascade hook (photos spec:
 *    deleting a painting removes all its photo FILES; the rows cascade in the
 *    DB). The paintings module calls it BEFORE deleting the painting row,
 *    while photo rows still exist to read their paths; called after the
 *    cascade it is a safe no-op. One-directional dependency, injected through
 *    the composition root — no event bus, no tight coupling.
 *
 * DB file_path is RELATIVE to the storage dir (portable across container
 * volume mounts, design D9); resolved against the injected storage dir at use
 * time. IDs arrive as route-param strings; serial ids are positive integers —
 * anything else is 404 (contract lists NOT_FOUND for all three endpoints).
 */

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { count, eq, max } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join, relative } from 'node:path';

import {
  API_PATHS,
  ERROR_MESSAGES,
  PHOTO_UPLOAD,
  type PhotoDto,
  type PhotoUploadResultDto,
} from '@painting/shared';
import { DRIZZLE_DB, type DrizzleDb } from '../db/drizzle.module';
import { paintings, photos } from '../db/schema';
import { PHOTO_STORAGE_DIR } from './photos-storage';

@Injectable()
export class PhotosService {
  private readonly logger = new Logger(PhotosService.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(PHOTO_STORAGE_DIR) private readonly storageDir: string,
  ) {}

  /**
   * POST /paintings/:id/photos — persist a validated multipart batch.
   * Multer has already written every file to disk and enforced the per-file
   * size cap + MIME whitelist before this runs; here we enforce the painting
   * contract (exists, per-painting count cap), assign positions, and insert.
   */
  async uploadPhotos(
    rawPaintingId: string,
    files: Express.Multer.File[],
  ): Promise<PhotoUploadResultDto> {
    if (files.length === 0) {
      // Contract: "field photos, one or more image files" — an empty upload
      // is a malformed form, not a photo-limit problem.
      throw new BadRequestException({
        error: { code: 'VALIDATION_ERROR', message: ERROR_MESSAGES.VALIDATION_ERROR },
      });
    }

    try {
      // Multer has already written every file to disk before this handler —
      // EVERY failure path below must delete them, so the whole flow
      // (including id parsing) lives inside the try whose catch cleans up.
      const paintingId = this.parseId(rawPaintingId);

      // 1) The painting must exist (contract 404) before any photo work.
      const [painting] = await this.db
        .select({ id: paintings.id })
        .from(paintings)
        .where(eq(paintings.id, paintingId))
        .limit(1);
      if (painting === undefined) {
        throw this.notFound();
      }

      // 2) Per-painting cap: existing rows + this batch (contract
      //    PHOTO_LIMIT_EXCEEDED). The >10-in-ONE-request half of the cap is
      //    already enforced by FilesInterceptor's maxCount (multer aborts
      //    before writing the extras); this check covers existing + incoming.
      const [{ existing }] = await this.db
        .select({ existing: count() })
        .from(photos)
        .where(eq(photos.paintingId, paintingId));
      if (existing + files.length > PHOTO_UPLOAD.maxFilesPerPainting) {
        throw this.limitExceeded();
      }

      // 3) Gallery order: 0-based positions continuing from the current max
      //    (photos spec: upload order preserved; schema enforces unique
      //    (painting_id, position)). max() is null on an empty gallery.
      const [{ currentMax }] = await this.db
        .select({ currentMax: max(photos.position) })
        .from(photos)
        .where(eq(photos.paintingId, paintingId));
      const firstFreePosition = (currentMax ?? -1) + 1;

      // 4) One transaction for the whole batch: all rows land or none do.
      //    Concurrent uploads can collide on the unique (painting_id,
      //    position) index — the loser's transaction throws, the catch below
      //    deletes its files, and the client sees a contract 500 (single
      //    owner, rare race — documented, never corrupted data).
      const inserted = await this.db.transaction(async (tx) =>
        tx
          .insert(photos)
          .values(
            files.map((file, index) => ({
              paintingId,
              filePath: relative(this.storageDir, file.path),
              mimeType: file.mimetype,
              sizeBytes: file.size,
              position: firstFreePosition + index,
            })),
          )
          .returning({ id: photos.id, position: photos.position }),
      );

      return {
        photos: inserted.map((row) => this.toPhotoDto(row.id, row.position)),
      };
    } catch (error) {
      // Multer already wrote every file to disk before this handler ran; any
      // failure here (404, cap, DB) must not leave orphaned bytes behind.
      await this.deleteFilesQuietly(files);
      throw error;
    }
  }

  /** DELETE /photos/:id — delete the row, then unlink the file best-effort (204). */
  async deletePhoto(rawPhotoId: string): Promise<void> {
    const photoId = this.parseId(rawPhotoId);

    const [row] = await this.db
      .select({ filePath: photos.filePath })
      .from(photos)
      .where(eq(photos.id, photoId))
      .limit(1);
    if (row === undefined) {
      throw this.notFound();
    }

    // Row first, file second: if the unlink fails the row is already gone and
    // the orphan is swept operationally — never fail a user request over disk.
    await this.db.delete(photos).where(eq(photos.id, photoId));

    await this.unlinkQuietly(this.resolvePath(row.filePath));
  }

  /**
   * GET /photos/:id/stream — row + disk lookup for the guarded stream route.
   * 404 when the row is gone OR the bytes are missing on disk (the photo is
   * effectively gone; bytes are never served half-missing).
   */
  async getPhotoForStream(rawPhotoId: string): Promise<{
    mimeType: string;
    sizeBytes: number;
    absolutePath: string;
  }> {
    const photoId = this.parseId(rawPhotoId);

    const [row] = await this.db
      .select({
        filePath: photos.filePath,
        mimeType: photos.mimeType,
        sizeBytes: photos.sizeBytes,
      })
      .from(photos)
      .where(eq(photos.id, photoId))
      .limit(1);
    if (row === undefined) {
      throw this.notFound();
    }

    const absolutePath = this.resolvePath(row.filePath);
    if (!existsSync(absolutePath)) {
      throw this.notFound();
    }

    return {
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      absolutePath,
    };
  }

  /**
   * Painting-delete cascade hook (photos spec: painting deletion removes all
   * photo FILES; the DB CASCADE removes the rows). Call from the paintings
   * module BEFORE deleting the painting row — photo rows must still exist to
   * read their paths. After the cascade this is a safe no-op (0 rows).
   * Returns the number of files removed.
   */
  async deleteFilesByPainting(paintingId: number): Promise<number> {
    const rows = await this.db
      .select({ filePath: photos.filePath })
      .from(photos)
      .where(eq(photos.paintingId, paintingId));

    let removed = 0;
    for (const row of rows) {
      if (await this.unlinkQuietly(this.resolvePath(row.filePath))) {
        removed += 1;
      }
    }
    return removed;
  }

  /* ── private helpers ────────────────────────────────────────────── */

  private toPhotoDto(id: number, position: number): PhotoDto {
    return {
      id: String(id),
      url: API_PATHS.photoStream(String(id)),
      position,
    };
  }

  /** Route-param → positive serial id; anything else is not found (404). */
  private parseId(raw: string): number {
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw this.notFound();
    }
    return id;
  }

  private resolvePath(relativePath: string): string {
    return join(this.storageDir, relativePath);
  }

  private async deleteFilesQuietly(files: Express.Multer.File[]): Promise<void> {
    await Promise.all(files.map((file) => this.unlinkQuietly(file.path)));
  }

  /** Unlink without ever throwing: failures are logged, orphans swept later. */
  private async unlinkQuietly(absolutePath: string): Promise<boolean> {
    try {
      await unlink(absolutePath);
      return true;
    } catch (error) {
      // ENOENT (already gone) and any fs error (permissions, I/O) must not
      // fail the request that triggered the cleanup.
      this.logger.warn(
        `failed to delete photo file ${absolutePath}: ${describeError(error)}`,
      );
      return false;
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      error: { code: 'NOT_FOUND', message: ERROR_MESSAGES.NOT_FOUND },
    });
  }

  private limitExceeded(): BadRequestException {
    return new BadRequestException({
      error: {
        code: 'PHOTO_LIMIT_EXCEEDED',
        message: ERROR_MESSAGES.PHOTO_LIMIT_EXCEEDED,
      },
    });
  }
}

/** Real error text for the server log only — never for the client (filter policy). */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}
