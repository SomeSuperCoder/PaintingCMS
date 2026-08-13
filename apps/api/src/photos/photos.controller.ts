/**
 * PhotosController — the photo HTTP surface (contract API_PATHS, design D5).
 * =========================================================================
 * Three routes, all composed with @UseGuards(AuthGuard, OwnershipGuard) like
 * the ownership controller (the global AuthGuard already runs; composing both
 * here makes the ownership dependency explicit). No route is public, no
 * static serving — every photo byte flows through the guarded stream route.
 *
 * - POST   /api/v1/paintings/:id/photos  — multipart upload (field 'photos',
 *          PHOTO_UPLOAD.fieldName), FilesInterceptor hard-caps ONE request at
 *          10 files (disk protection; >10-in-one-request surfaces multer's
 *          LIMIT_FILE_COUNT → 400 VALIDATION_ERROR — documented contract
 *          nuance, the per-painting existing+incoming cap yields
 *          PHOTO_LIMIT_EXCEEDED in the service).
 * - DELETE /api/v1/photos/:id             — row + file, 204.
 * - GET    /api/v1/photos/:id/stream      — auth-guarded image bytes with
 *          Content-Type from the DB mime_type, Content-Length from the DB
 *          size_bytes, and `Cache-Control: private, max-age=1y, immutable`
 *          (contract: private, immutable; StreamableFile never touches
 *          Cache-Control, so @Header is authoritative).
 */

import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Logger,
  Param,
  Post,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'node:fs';

import {
  PHOTO_UPLOAD,
  type PhotoUploadResultDto,
} from '@painting/shared';
import { AuthGuard } from '../auth/auth.guard';
import { OwnershipGuard } from '../ownership/ownership.guard';
import { PHOTO_CACHE_MAX_AGE_SECONDS } from './photos-storage';
import { PhotosService } from './photos.service';

@Controller()
@UseGuards(AuthGuard, OwnershipGuard)
export class PhotosController {
  private readonly logger = new Logger(PhotosController.name);

  constructor(private readonly service: PhotosService) {}

  /** POST /api/v1/paintings/:id/photos — validated multipart batch (201 PhotoUploadResultDto). */
  @Post('paintings/:id/photos')
  @UseInterceptors(
    FilesInterceptor(PHOTO_UPLOAD.fieldName, PHOTO_UPLOAD.maxFilesPerPainting),
  )
  async upload(
    @Param('id') paintingId: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<PhotoUploadResultDto> {
    return this.service.uploadPhotos(paintingId, files ?? []);
  }

  /** DELETE /api/v1/photos/:id — remove the row + storage file (204). */
  @Delete('photos/:id')
  @HttpCode(204)
  async remove(@Param('id') photoId: string): Promise<void> {
    await this.service.deletePhoto(photoId);
  }

  /**
   * GET /api/v1/photos/:id/stream — auth-guarded photo bytes.
   * 404 when the row or its file is missing (service). If the file vanishes
   * mid-stream the response is already committed — log and let the socket
   * drop (the global filter cannot rewrite sent headers).
   */
  @Get('photos/:id/stream')
  @Header(
    'Cache-Control',
    `private, max-age=${PHOTO_CACHE_MAX_AGE_SECONDS}, immutable`,
  )
  async stream(@Param('id') photoId: string): Promise<StreamableFile> {
    const photo = await this.service.getPhotoForStream(photoId);

    const stream = createReadStream(photo.absolutePath);
    stream.on('error', (error) => {
      this.logger.error(
        `stream error for photo ${photoId}: ${describeError(error)}`,
      );
    });

    return new StreamableFile(stream, {
      type: photo.mimeType,
      length: photo.sizeBytes,
      disposition: 'inline',
    });
  }
}

/** Real error text for the server log only — never for the client (filter policy). */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}
