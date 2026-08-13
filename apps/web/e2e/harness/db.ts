/**
 * Test-DB helpers. Runs inside the apps/api package so the `pg` driver
 * resolves from the API's node_modules (pnpm strict layout).
 */
import { execFileSync } from 'node:child_process';

import { REPO_ROOT } from './env';

const TRUNCATE_SCRIPT = `
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.TRUNCATE_DB_URL });
(async () => {
  await client.connect();
  await client.query('TRUNCATE TABLE photos, paintings, locations, ownership_events, app_state, users RESTART IDENTITY CASCADE');
  await client.end();
})().catch((error) => {
  console.error('e2e truncate failed:', error);
  process.exit(1);
});
`;

/** Wipe every table in the isolated test DB (fresh slate before/after the run). */
export async function truncateTestDb(dbUrl: string): Promise<void> {
  execFileSync(
    'pnpm',
    ['--filter', '@painting/api', 'exec', 'node', '-e', TRUNCATE_SCRIPT],
    { cwd: REPO_ROOT, env: { ...process.env, TRUNCATE_DB_URL: dbUrl }, stdio: 'pipe' },
  );
}
