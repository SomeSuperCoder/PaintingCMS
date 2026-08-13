/**
 * PhotosModule — wires the photo surface (design D5/D6).
 * ======================================================
 * - MulterModule.registerAsync provides MULTER_MODULE_OPTIONS, which the
 *   FilesInterceptor in this module's controller picks up automatically.
 * - PHOTO_STORAGE_DIR is provided for PhotosService (unlink/stream resolution)
 *   and consumed by no other module.
 * - AuthModule + OwnershipModule are imported so the controller can compose
 *   @UseGuards(AuthGuard, OwnershipGuard) (mirrors OwnershipModule).
 * - PhotosService is EXPORTED so the paintings module can call
 *   deleteFilesByPainting BEFORE its painting-row delete (the DB CASCADE
 *   removes photo rows; this hook removes the bytes — photos spec).
 *
 * WHY the storage dir is resolved in TWO factories: Nest resolves a dynamic
 * module's registerAsync `inject` deps in the dynamic module's OWN context,
 * which cannot see this module's local providers (the documented pattern adds
 * the dep's module to registerAsync's `imports` — circular here). ConfigService
 * is @Global, so both factories safely resolve it; resolvePhotoStorageDir is
 * idempotent (recursive mkdir), so calling it twice at init is harmless.
 *
 * D: nothing is constructed here — multer options, the storage dir, and the
 * DB all arrive injected; the composition root (AppModule) wires this module.
 */
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';

import { AuthModule } from '../auth/auth.module';
import { OwnershipModule } from '../ownership/ownership.module';
import { PhotosController } from './photos.controller';
import { buildMulterOptions } from './photos.multer';
import { PHOTO_STORAGE_DIR, resolvePhotoStorageDir } from './photos-storage';
import { PhotosService } from './photos.service';

@Module({
  imports: [
    AuthModule,
    OwnershipModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildMulterOptions(resolvePhotoStorageDir(config)),
    }),
  ],
  controllers: [PhotosController],
  providers: [
    {
      provide: PHOTO_STORAGE_DIR,
      inject: [ConfigService],
      useFactory: (config: ConfigService): string =>
        resolvePhotoStorageDir(config),
    },
    PhotosService,
  ],
  exports: [PhotosService],
})
export class PhotosModule {}
