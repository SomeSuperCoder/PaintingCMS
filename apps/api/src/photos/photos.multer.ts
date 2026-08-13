/**
 * Multer upload constraints for photos (design D5, contract PHOTO_UPLOAD).
 * ========================================================================
 * - diskStorage: files land in the resolved storage dir under UUID names —
 *   NEVER client filenames (OWASP upload hygiene; the DB row's file_path is
 *   the only reference to the bytes).
 * - limits.fileSize: hard 10 MB/file cap (contract PHOTO_UPLOAD.maxSizeBytes).
 *   An oversized file raises multer's LIMIT_FILE_SIZE, which Nest's
 *   FileInterceptor transforms into a 413 PayloadTooLargeException, which the
 *   global HttpExceptionFilter maps to the contract PHOTO_TOO_LARGE
 *   (verified against @nestjs/platform-express multer.utils.transformException
 *   + ERROR_STATUS — no custom mapping needed).
 * - fileFilter: image MIME whitelist. Source of truth is the CONTRACT
 *   (PHOTO_UPLOAD.allowedMimeTypes = jpeg/png/webp/gif — matches the
 *   PHOTO_TYPE_INVALID message "(JPEG, PNG, WebP, GIF)"; the design sketch's
 *   avif is NOT whitelisted, the contract wins). Rejection throws the
 *   contract-shaped 400 PHOTO_TYPE_INVALID envelope; transformException passes
 *   HttpExceptions through unchanged, so the global filter forwards it as-is.
 *
 * Filename extension policy: the client's original extension is used ONLY
 * after strict sanitization (≤10 alnum chars), else the MIME-canonical one.
 * The extension is cosmetic — Content-Type is always served from the DB
 * mime_type row, never derived from the filename.
 */

import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
// MulterOptions is NOT re-exported from the package root (the multer/interfaces
// barrel only exports files-upload-module.interface) — deep import required.
// Type-only: erased at compile; the module has no runtime exports.
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';

import { ERROR_MESSAGES, PHOTO_UPLOAD } from '@painting/shared';

/** Canonical extension per whitelisted MIME (fallback when the original is unusable). */
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/**
 * The contract tuple is `as const` (narrow literal union) — widen into a Set
 * so runtime `has(string)` checks are typed (includes() would require the
 * exact literal union).
 */
const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set(
  PHOTO_UPLOAD.allowedMimeTypes,
);

/**
 * Build the multer options for photo uploads. The storage dir is injected so
 * the options factory and PhotosService share one resolved path (L).
 */
export function buildMulterOptions(storageDir: string): MulterOptions {
  return {
    storage: diskStorage({
      destination: storageDir,
      filename: (_req, file, cb) => cb(null, buildFilename(file)),
    }),
    limits: { fileSize: PHOTO_UPLOAD.maxSizeBytes },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
        cb(null, true);
      } else {
        // Contract-shaped envelope → transformException passes HttpExceptions
        // through unchanged → global filter forwards it as 400 PHOTO_TYPE_INVALID.
        // Both callback args are required by the Nest MulterOptions type.
        cb(
          new BadRequestException({
            error: {
              code: 'PHOTO_TYPE_INVALID',
              message: ERROR_MESSAGES.PHOTO_TYPE_INVALID,
            },
          }),
          false,
        );
      }
    },
  };
}

/** UUID name + safe extension — never any client-controlled bytes in the name. */
function buildFilename(file: Express.Multer.File): string {
  return `${randomUUID()}${extensionFor(file)}`;
}

/** Sanitized original extension, falling back to the MIME-canonical one. */
function extensionFor(file: Express.Multer.File): string {
  const sanitized = sanitizedOriginalExtension(file.originalname);
  return sanitized ?? MIME_EXTENSIONS[file.mimetype] ?? '';
}

/** 'photo.JPG' → '.jpg'; anything non-alnum, >10 chars, or missing → null. */
function sanitizedOriginalExtension(name: string): string | null {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return null;
  const ext = name.slice(dot + 1);
  return /^[a-zA-Z0-9]{1,10}$/.test(ext) ? `.${ext.toLowerCase()}` : null;
}
