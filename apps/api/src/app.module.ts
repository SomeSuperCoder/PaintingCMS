import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { DrizzleModule } from './db/drizzle.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { BotModule } from './bot/bot.module';
import { OwnershipModule } from './ownership/ownership.module';
import { LocationsModule } from './locations/locations.module';
import { PaintingsModule } from './paintings/paintings.module';
import { PhotosModule } from './photos/photos.module';

/**
 * In production the API also serves the built SPA (design D8: ServeStaticModule
 * with SPA fallback to index.html). Registered ONLY when NODE_ENV=production
 * AND the built web app actually exists, so local dev (no apps/web/dist, or a
 * separate `just dev` Vite server) never gets a broken serving layer.
 *
 * Resolution: dist/main.js → __dirname = apps/api/dist → ../../web/dist =
 * apps/web/dist (same for ts-node dev: apps/api/src → apps/web/dist).
 */
function webAppServing(): DynamicModule[] {
  if (process.env.NODE_ENV !== 'production') {
    return [];
  }
  const webDist = join(__dirname, '..', '..', 'web', 'dist');
  if (!existsSync(webDist)) {
    return [];
  }
  return [
    ServeStaticModule.forRoot({
      rootPath: webDist,
      // The SPA catch-all (renderPath defaults to '{*any}') must never
      // swallow API or health routes (path-to-regexp v8 syntax).
      exclude: ['/api/{*splat}', '/health'],
    }),
  ];
}

/**
 * AppModule — the single composition root (design D6 / architecture law).
 * Every other module is wired here and injects its dependencies; nothing
 * below this point constructs its own infrastructure.
 *
 * S: this module exists for one reason — to compose the application.
 * O: new features attach as new modules in `imports`; nothing here changes.
 * I: modules expose only what they export; the root imports public module
 *    surfaces only.
 * D: ConfigService (validated env) is injected everywhere it is needed,
 *    including into the DrizzleModule factory.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // .env lives at the repo root; pnpm runs each workspace package from
      // its own dir, so cover both resolutions (missing files are ignored,
      // process.env always wins — `just` loads .env via dotenv-load).
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    // Global rate-limit basis (design D6). Auth + transfer endpoints tighten
    // per-endpoint with @Throttle in their waves.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
    }),
    DrizzleModule,
    AuthModule,
    // Ownership surface (guard + claim state machine, transfer service,
    // GET /ownership + POST /ownership/transfer, ownership controller).
    // Its guard is NOT global — controllers compose
    // @UseGuards(AuthGuard, OwnershipGuard).
    OwnershipModule,
    // Domain surface (design D6): locations + paintings + photos CRUD, each
    // controller composing @UseGuards(AuthGuard, OwnershipGuard) itself.
    // PaintingsModule imports PhotosModule for the delete cascade hook
    // (photos files cleaned on painting delete) — both stay self-contained
    // here, the root only registers them.
    LocationsModule,
    PaintingsModule,
    PhotosModule,
    HealthModule,
    // grammY bot (design D7): RU /start + WebApp button + transfer
    // notification. OPTIONAL-path infra — lifecycle + notifications are
    // fire-and-forget; CRUD never depends on it (spec telegram-bot).
    BotModule,
    ...webAppServing(),
  ],
  providers: [
    // Global exception filter: maps EVERY thrown error to the contract
    // ApiErrorBody envelope (code + Russian message; internals never leak).
    // Registered here (APP_FILTER) so guards, pipes, and services are covered
    // too, not just controllers.
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // Guards are registered as APP_GUARD providers (not useGlobalGuards in
    // main.ts) so they participate in DI — AuthGuard needs ConfigService
    // (BOT_TOKEN, INIT_DATA_MAX_AGE_SECONDS) and DRIZZLE_DB.
    // ORDER MATTERS: ThrottlerGuard runs first (rate limit before the
    // HMAC cost), then AuthGuard (global initData validation; /health opts
    // out via @Public()). Every endpoint except /health is authenticated.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
