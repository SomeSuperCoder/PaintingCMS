/**
 * Shared constants for the E2E harness.
 *
 * The suite boots the REAL API + Vite dev server against an ISOLATED test
 * database (`paintingcms_test_te2b`) — never the dev `paintingcms` DB and
 * never another agent's test DB. The API requires a non-empty BOT_TOKEN to
 * boot, so the harness injects a dedicated test token (the fixture helper
 * signs initData with the same token).
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root — this file lives at apps/web/e2e/harness/. */
export const REPO_ROOT = path.resolve(here, '../../../../');
export const HARNESS_DIR = path.join(REPO_ROOT, 'apps/web/.harness');

export const API_PORT = Number(process.env.E2E_API_PORT ?? 3000);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5173);
export const API_BASE = `http://localhost:${API_PORT}`;
export const WEB_BASE = `http://localhost:${WEB_PORT}`;

/** Isolated test database — a dedicated DB per test session. */
export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://paintingcms:paintingcms-dev@localhost:5432/paintingcms_test_te2b';

/** Test bot token — injected into the API process AND used to sign fixtures. */
export const TEST_BOT_TOKEN = process.env.TEST_BOT_TOKEN ?? '123456:PAINTINGCMS-E2E-TEST-TOKEN';

export const API_STATE_FILE = path.join(HARNESS_DIR, 'api.pid');
export const WEB_STATE_FILE = path.join(HARNESS_DIR, 'web.pid');
