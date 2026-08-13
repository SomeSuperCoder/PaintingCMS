/**
 * Integration test helpers — apps/api supertest suite (task 8.2 integration).
 * ===========================================================================
 * Shared fixtures + boot + teardown for HTTP-level tests against a REAL
 * Postgres 16 test database (paintingcms_test_te1b — never the dev DB).
 *
 * Design decisions:
 * - App boot mirrors main.ts EXACTLY (global prefix, ValidationPipe with the
 *   same options + contract exceptionFactory, helmet). The APP_GUARD/APP_FILTER
 *   providers come from AppModule itself — so guards (Throttler + Auth) and the
 *   error filter are the REAL production ones over real HTTP.
 * - BOT_TOKEN is a KNOWN test token (dev .env has it empty). Fixtures are
 *   signed with it per the official Telegram algorithm, so auth is real.
 * - NODE_ENV=test keeps BotModule inert (no webhook, no network) and the
 *   TransferNotifier is fire-and-forget (never blocks the transfer response).
 * - PHOTOS_STORAGE_DIR points at a per-file temp dir → photo bytes never
 *   pollute the repo and the cascade-cleanup test can assert file deletion.
 * - Each spec file boots its OWN app → fresh Throttler buckets per file
 *   (global basis is 100 req/min per IP; every file stays far below it).
 * - DB reset: TRUNCATE all six tables RESTART IDENTITY CASCADE — clean state
 *   per test with serials reset, so ids are deterministic (1, 2, ...).
 */

import { createHmac } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { INestApplication, Type } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import helmet from 'helmet';
import type { Pool } from 'pg';
import { expect } from 'vitest';

import { AppModule } from '../src/app.module';
import { contractValidationExceptionFactory } from '../src/common/http-exception.filter';
import { DRIZZLE_DB, type DrizzleDb } from '../src/db/drizzle.module';
// Local use + re-export for any spec that needs the token/DB URL.
import { TEST_BOT_TOKEN, TEST_DB_URL } from './env';
export { TEST_BOT_TOKEN, TEST_DB_URL } from './env';

export interface TestUser {
  /** Telegram id as TEXT (precision-safe, contract D3). */
  id: string;
  username?: string;
  firstName: string;
}

/** The four fixture identities used across the suite. */
export const ALICE: TestUser = { id: '111111111', username: 'alice', firstName: 'Алиса' };
export const BOB: TestUser = { id: '222222222', username: 'bob', firstName: 'Борис' };
export const CHARLIE: TestUser = { id: '333333333', username: 'charlie', firstName: 'Чарли' };
export const MALLORY: TestUser = { id: '444444444', username: 'mallory', firstName: 'Мэллори' };

/**
 * Sign initData per the official Telegram algorithm (secret key = HMAC over
 * the bot token keyed with 'WebAppData'; data check string = non-hash fields
 * alpha-sorted `key=value` joined by '\n'). auth_date is fresh (never stale).
 */
export function buildInitData(user: TestUser): string {
  const fields: Record<string, string> = {
    user: JSON.stringify({
      id: user.id,
      ...(user.username !== undefined ? { username: user.username } : {}),
      first_name: user.firstName,
    }),
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `AAG-test-${user.id}`,
  };
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData')
    .update(TEST_BOT_TOKEN)
    .digest();
  const hash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) params.append(key, value);
  params.append('hash', hash);
  return params.toString();
}

export interface TestApp {
  app: INestApplication;
  db: DrizzleDb;
  /** The per-file photos temp dir (PHOTOS_STORAGE_DIR) — for file-cleanup assertions. */
  storageDir: string;
}

/**
 * Boot the FULL production AppModule over real HTTP. `extraControllers`
 * lets the envelope spec mount a test-only throwing route; the production
 * APP_GUARDs + APP_FILTER apply to it exactly as to real controllers.
 */
export async function createTestApp(extraControllers: Type[] = []): Promise<TestApp> {
  const storageDir = mkdtempSync(join(tmpdir(), 'paintingcms-it-'));

  // Process env BEFORE ConfigModule.compile() — process.env wins over .env.
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.BOT_TOKEN = TEST_BOT_TOKEN;
  process.env.INIT_DATA_MAX_AGE_SECONDS = '600';
  process.env.PHOTOS_STORAGE_DIR = storageDir;

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: extraControllers,
  }).compile();

  const app = moduleRef.createNestApplication();
  // Mirror of apps/api/src/main.ts — SSOT is main.ts; this block is the test twin.
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: contractValidationExceptionFactory,
    }),
  );
  app.use(helmet());
  await app.init();

  const db = app.get(DRIZZLE_DB);
  return { app, db, storageDir };
}

/** Close the app AND the underlying pg pool (DrizzleModule has no destroy hook). */
export async function destroyTestApp(testApp: TestApp): Promise<void> {
  await testApp.app.close();
  // $client is the live pg Pool on drizzle's node-postgres instance (not in
  // the DrizzleDb type declaration — narrow cast).
  await (testApp.db as unknown as { $client: Pool }).$client.end();
  rmSync(testApp.storageDir, { recursive: true, force: true });
}

/** Wipe every row + reset serials — clean slate per test. */
export async function resetDb(db: DrizzleDb): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE users, app_state, ownership_events, locations, paintings, photos
    RESTART IDENTITY CASCADE
  `);
}

/** True when the string contains Cyrillic — every user-facing message is Russian. */
export function isRussian(text: string): boolean {
  return /[А-Яа-яЁё]/.test(text);
}

/** Assert the CONTRACT envelope for any non-2xx: { error: { code, message } }, Russian. */
export function expectContractError(
  response: { status: number; body: { error?: { code?: string; message?: string } } },
  status: number,
  code: string,
): void {
  expect(response.status).toBe(status);
  expect(response.body.error?.code).toBe(code);
  expect(typeof response.body.error?.message).toBe('string');
  expect(isRussian(response.body.error?.message ?? '')).toBe(true);
}

/** Assert a file exists on disk (photos cascade cleanup). */
export function expectFileExists(absolutePath: string): void {
  expect(existsSync(absolutePath)).toBe(true);
}
