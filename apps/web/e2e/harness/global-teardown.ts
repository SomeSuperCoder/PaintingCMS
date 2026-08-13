/**
 * Global teardown — kills the API + web process trees and truncates the test
 * DB so the local stack is byte-identical after the run.
 */
import * as fs from 'node:fs';

import { API_STATE_FILE, TEST_DB_URL, WEB_STATE_FILE } from './env';
import { truncateTestDb } from './db';

function stopGroup(stateFile: string): void {
  let pid = -1;
  try {
    pid = Number(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    /* never started */
  }
  if (pid > 0) {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
    // Force-kill leftovers shortly after the graceful stop.
    setTimeout(() => {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        /* gone */
      }
    }, 400);
  }
  fs.rmSync(stateFile, { force: true });
}

export default async function globalTeardown(): Promise<void> {
  stopGroup(API_STATE_FILE);
  stopGroup(WEB_STATE_FILE);
  await new Promise((resolve) => setTimeout(resolve, 800));
  // Byte-identical DB after the run — delete every row created.
  try {
    await truncateTestDb(TEST_DB_URL);
  } catch {
    /* best-effort — the DB may already be gone */
  }
}
