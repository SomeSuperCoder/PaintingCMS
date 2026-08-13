/**
 * OwnershipModule — wires the ownership surface (design D6).
 * ============================================================================
 * OwnershipGuard is NOT registered globally: routes opt IN to ownership
 * enforcement by composing @UseGuards(AuthGuard, OwnershipGuard) explicitly
 * (the ownership controller does exactly that). AuthModule is imported so the
 * controller can reference the exported AuthGuard in that composition;
 * BotModule is imported so OwnershipService can inject TransferNotifierService
 * (the fire-and-forget transfer notification, design D3).
 *
 * WHY BotModule is RE-EXPORTED (exports below): Nest registers every
 * @UseGuards(OwnershipGuard) class as a fresh injectable of the CONSUMING
 * module (DependenciesScanner.insertInjectable), so the guard's
 * TransferNotifierService dependency must resolve from each consumer's own
 * scope — importing this module alone is not enough (imports are not
 * transitive). Re-exporting BotModule lets the injector walk from any consumer
 * (Locations/Photos/Paintings) down through this module into BotModule, where
 * the notifier is declared. One-directional: BotModule imports nothing, so
 * there is no cycle.
 *
 * D: nothing is constructed here — OwnershipGuard injects DRIZZLE_DB from the
 * @Global DrizzleModule, OwnershipService injects DRIZZLE_DB +
 * TransferNotifierService; the composition root (AppModule) wires this module.
 */
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BotModule } from '../bot/bot.module';
import { OwnershipController } from './ownership.controller';
import { OwnershipGuard } from './ownership.guard';
import { OwnershipService } from './ownership.service';

@Module({
  imports: [AuthModule, BotModule],
  controllers: [OwnershipController],
  providers: [OwnershipGuard, OwnershipService],
  exports: [OwnershipGuard, BotModule],
})
export class OwnershipModule {}
