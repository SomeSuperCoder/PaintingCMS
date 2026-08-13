import { Controller, Get } from '@nestjs/common';

import { Public } from '../auth/public.decorator';

/**
 * Unauthenticated liveness probe (contract HEALTH_PATH = '/health').
 * Deliberately outside the /api/v1 prefix (excluded in main.ts) so compose
 * healthchecks and the deploy smoke test can hit it with zero auth, zero
 * dependencies (design D9). Response shape is exactly { status: 'ok' }.
 *
 * @Public() opts this route out of the global AuthGuard — it is the ONLY
 * unauthenticated route in the contract (endpoints.ts: auth: 'none').
 */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
