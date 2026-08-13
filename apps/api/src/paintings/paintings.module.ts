/**
 * PaintingsModule — the paintings CRUD surface (task 4.1, design D6).
 * ============================================================================
 * NOT wired into AppModule yet: a final integration microtask registers this
 * module (with LocationsModule + PhotosModule) in the root module.
 *
 * AuthModule + OwnershipModule are imported so the controller's
 * @UseGuards(AuthGuard, OwnershipGuard) class references resolve through the
 * module graph — the exact composition pattern OwnershipModule documents for
 * its own controller. DRIZZLE_DB needs no import: DrizzleModule is @Global.
 *
 * PhotosModule is imported for the painting-delete cascade hook: its exported
 * PhotosService (deleteFilesByPainting) is injected into PaintingsService.
 * One-directional dependency (Paintings → Photos) — PhotosModule imports
 * nothing from this module, so no cycle exists.
 *
 * D: nothing is constructed here — PaintingsService injects DRIZZLE_DB from
 * the @Global DrizzleModule; the composition root (AppModule) wires this
 * module. A fake DB can be provided in the DRIZZLE_DB slot without touching
 * any consumer.
 */
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { LocationsModule } from '../locations/locations.module';
import { OwnershipModule } from '../ownership/ownership.module';
import { PhotosModule } from '../photos/photos.module';
import { PaintingsController } from './paintings.controller';
import { PaintingsService } from './paintings.service';

@Module({
  imports: [AuthModule, OwnershipModule, PhotosModule, LocationsModule],
  controllers: [PaintingsController],
  providers: [PaintingsService],
})
export class PaintingsModule {}
