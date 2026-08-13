/**
 * LocationsModule — wires the location bank surface (locations spec, task 4.3).
 * ============================================================================
 * NOT registered in AppModule yet — a final integration microtask wires
 * locations + paintings + photos into the root composition (this module is
 * deliberately self-contained and importable as-is).
 *
 * AuthModule + OwnershipModule are imported so the controller can reference
 * the exported AuthGuard and the exported OwnershipGuard in its @UseGuards
 * composition (mirrors OwnershipModule/PhotosModule).
 *
 * WHY OwnershipModule, not ad-hoc resolution: OwnershipGuard injects
 * TransferNotifierService (transfer notification, MAJOR-4). With only
 * AuthModule imported, Nest instantiated the guard ad-hoc in this module's
 * context — the notifier was unresolvable → UnknownDependenciesException at
 * boot. OwnershipModule provides AND exports OwnershipGuard and imports
 * BotModule (which exports TransferNotifierService), so both guard
 * dependencies resolve from the module graph. One-directional: OwnershipModule
 * imports nothing from locations — no cycle.
 *
 * OwnershipGuard is NOT registered globally — routes opt in explicitly.
 *
 * D: nothing is constructed here — LocationsService injects DRIZZLE_DB from
 * the @Global DrizzleModule; the composition root (AppModule) wires this module.
 */
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OwnershipModule } from '../ownership/ownership.module';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';

@Module({
  imports: [AuthModule, OwnershipModule],
  controllers: [LocationsController],
  providers: [LocationsService],
  // Exported so PaintingsService can inject it for inline newLocation
  // creation (locations spec, select-or-add inline) — one-directional
  // dependency (Paintings → Locations), no cycle.
  exports: [LocationsService],
})
export class LocationsModule {}
