/**
 * Photos storage — local volume directory resolution (design D5).
 * =================================================================
 * Storage root: `storage/photos` under the process cwd (apps/api at runtime,
 * the compose-mounted photos volume in production), overridable via the
 * PHOTOS_STORAGE_DIR env var (design D9: api container mounts the volume
 * there). Resolved ONCE per process at module init (provider factory) and
 * created if missing, so the first upload never fails on a missing dir.
 *
 * Why a provider token (DI): every consumer — the multer options factory and
 * PhotosService — receives the SAME resolved absolute path; tests can provide
 * a temp dir in the same slot without touching any consumer (L).
 */

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { ConfigService } from '@nestjs/config';

/** Injection token for the resolved absolute photos storage directory. */
export const PHOTO_STORAGE_DIR = Symbol('PHOTO_STORAGE_DIR');

/**
 * Immutable photos are cacheable forever (contract PhotoDto comment:
 * `Cache-Control: private, immutable`). `private` keeps them out of shared
 * caches (they are auth-guarded — no shared cache may store them);
 * `immutable` tells the browser cache they never change; 1 year is the
 * standard max-age paired with `immutable`.
 */
export const PHOTO_CACHE_MAX_AGE_SECONDS = 31536000;

/**
 * Resolve the photos storage directory: env override or cwd/storage/photos.
 * Always returns an ABSOLUTE path (multer diskStorage + unlink both rely on
 * it). The recursive mkdir is idempotent — safe to call from every factory.
 */
export function resolvePhotoStorageDir(config: ConfigService): string {
  const fromEnv = config.get<string>('PHOTOS_STORAGE_DIR');
  const dir =
    fromEnv && fromEnv.trim().length > 0
      ? resolve(fromEnv)
      : join(process.cwd(), 'storage', 'photos');
  mkdirSync(dir, { recursive: true });
  return dir;
}
