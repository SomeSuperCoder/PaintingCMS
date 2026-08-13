import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { contractValidationExceptionFactory } from './common/http-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Security headers + CSP defaults (design D6).
  app.use(helmet());

  // Everything except /health lives under /api/v1 (contract API_BASE_PATH).
  // The liveness probe stays at the root for compose healthchecks (design D9).
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  const config = app.get(ConfigService);

  // TMA origin from env (WEBAPP_URL). When unset (local dev) reflect any
  // origin — the Vite dev proxy keeps the browser same-origin anyway; in
  // production WEBAPP_URL is set and CORS is strict.
  const webappUrl = config.get<string>('WEBAPP_URL', '');
  app.enableCors({
    origin: webappUrl || true,
  });

  // Strict body validation everywhere (design D6, class-validator):
  // strip unknown properties, reject them explicitly, and transform plain
  // JSON into DTO class instances so handlers receive typed objects.
  // The exceptionFactory (common/http-exception.filter.ts) shapes class-
  // validator errors into the CONTRACT 400 envelope with per-field Russian
  // messages — all error shaping lives in the filter file (SSOT), and the
  // global HttpExceptionFilter passes that envelope through unchanged.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: contractValidationExceptionFactory,
    }),
  );

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
}

void bootstrap();
