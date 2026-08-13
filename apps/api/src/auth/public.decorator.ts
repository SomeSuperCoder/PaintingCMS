import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for the @Public() route opt-out (NestJS convention).
 * The global AuthGuard skips any handler/controller carrying IS_PUBLIC_KEY.
 * /health is the ONLY public route in the contract (endpoints.ts: auth:
 * 'none') — every other endpoint MUST pass through AuthGuard.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as exempt from authentication. Use SPARINGLY. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
