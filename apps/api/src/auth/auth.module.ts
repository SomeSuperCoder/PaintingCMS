/**
 * AuthModule — wires the auth surface (design D6).
 * The AuthGuard is registered GLOBALLY from AppModule (APP_GUARD) so every
 * future domain endpoint is authenticated by default; it is exported here so
 * AppModule can reference the class and other controllers compose
 * @UseGuards(AuthGuard) with their domain guards. AuthController handles
 * GET /api/v1/auth/me.
 *
 * Ownership gate on /auth/me (contract 403 semantics, MAJOR-3): AuthController
 * composes @UseGuards(AuthGuard, OwnershipGuard) so the bootstrap call runs the
 * full ownership state machine — first-open claim, pending-target swap, 403
 * for known non-owners AND the previous owner whose transfer is pending.
 * OwnershipGuard is provided HERE (a second, stateless instance beside
 * OwnershipModule's) so the controller can compose it WITHOUT a circular
 * AuthModule ↔ OwnershipModule import; BotModule is imported so the guard's
 * TransferNotifierService dependency resolves. DRIZZLE_DB comes from the
 * @Global DrizzleModule. Nothing is constructed here (architecture law, D).
 */
import { Module } from '@nestjs/common';

import { BotModule } from '../bot/bot.module';
import { OwnershipGuard } from '../ownership/ownership.guard';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';

@Module({
  imports: [BotModule],
  controllers: [AuthController],
  providers: [AuthGuard, OwnershipGuard],
  exports: [AuthGuard],
})
export class AuthModule {}
