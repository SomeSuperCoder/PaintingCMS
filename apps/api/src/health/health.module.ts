import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/** Health module (design D6) — one controller, no providers, no DB access. */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
