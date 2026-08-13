/**
 * Global setup — boots the REAL stack in test mode against the isolated test
 * DB (never the dev `paintingcms` DB):
 *   1. truncates the test DB (fresh state — journey 01 claims ownership),
 *   2. spawns the API (NODE_ENV=test, injected test BOT_TOKEN, test
 *      DATABASE_URL) on :3000,
 *   3. spawns the Vite dev server on :5173,
 *   4. waits for API /health and the web server to answer.
 * global-teardown.ts kills both process trees and truncates the DB again.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  API_BASE,
  API_PORT,
  API_STATE_FILE,
  HARNESS_DIR,
  REPO_ROOT,
  TEST_BOT_TOKEN,
  TEST_DB_URL,
  WEB_BASE,
  WEB_PORT,
  WEB_STATE_FILE,
} from './env';
import { truncateTestDb } from './db';

async function waitForHttp(url: string, timeoutMs: number, label: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label} at ${url} (last error: ${String(lastError)})`);
}

function spawnLogged(
  label: string,
  command: string,
  args: string[],
  env: Record<string, string>,
  stateFile: string,
): ChildProcess {
  const logFile = path.join(HARNESS_DIR, `${label}.log`);
  const out = fs.createWriteStream(logFile, { flags: 'a' });
  out.write(`\n=== boot ${label} ${new Date().toISOString()} ===\n`);
  // detached: true → own process group, so teardown can kill the whole tree
  // (pnpm → nest/tsc → node) with process.kill(-pid).
  const child = spawn(command, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  child.stdout?.on('data', (chunk) => out.write(chunk));
  child.stderr?.on('data', (chunk) => out.write(chunk));
  child.on('exit', (code, signal) => {
    out.write(`\n[${label}] exited code=${code} signal=${signal}\n`);
    out.end();
  });
  fs.writeFileSync(stateFile, String(child.pid ?? -1));
  return child;
}

export default async function globalSetup(): Promise<void> {
  fs.mkdirSync(HARNESS_DIR, { recursive: true });

  // Fresh DB — every run starts from the empty state.
  await truncateTestDb(TEST_DB_URL);

  const api = spawnLogged(
    'api',
    'pnpm',
    ['--filter', '@painting/api', 'exec', 'nest', 'start'],
    {
      DATABASE_URL: TEST_DB_URL,
      NODE_ENV: 'test',
      BOT_TOKEN: TEST_BOT_TOKEN,
      INIT_DATA_MAX_AGE_SECONDS: '600',
      PORT: String(API_PORT),
    },
    API_STATE_FILE,
  );
  try {
    await waitForHttp(`${API_BASE}/health`, 120_000, 'API health');
  } catch (error) {
    try {
      process.kill(-(api.pid ?? 0), 'SIGKILL');
    } catch {
      /* ignore */
    }
    throw error;
  }

  const web = spawnLogged(
    'web',
    'pnpm',
    ['--filter', '@painting/web', 'exec', 'vite', '--port', String(WEB_PORT), '--strictPort'],
    {},
    WEB_STATE_FILE,
  );
  try {
    await waitForHttp(WEB_BASE, 90_000, 'web dev server');
  } catch (error) {
    try {
      process.kill(-(web.pid ?? 0), 'SIGKILL');
    } catch {
      /* ignore */
    }
    throw error;
  }
}
