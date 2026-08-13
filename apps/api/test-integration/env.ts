/**
 * Integration-suite environment constants — PURE module (no side effects,
 * no AppModule import), so both the vitest setup file and helpers.ts can
 * share them without triggering ConfigModule validation at import time.
 */

/** The dev .env has an EMPTY BOT_TOKEN — the suite signs fixtures with this KNOWN token. */
export const TEST_BOT_TOKEN = '123456789:TEST-BOT-TOKEN-for-painting-cms';

/** This suite's OWN database — never the dev DB, never the E2E TE's DB. */
export const TEST_DB_URL =
  'postgresql://paintingcms:paintingcms-dev@localhost:5432/paintingcms_test_te1b';
