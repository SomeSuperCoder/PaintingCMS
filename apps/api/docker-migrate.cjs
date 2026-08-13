/**
 * Container-start Drizzle migration runner (design D9 contract: the api
 * container "runs drizzle migrations on start").
 *
 * WHY this file exists: the production image cannot run `drizzle-kit migrate`
 * (drizzle-kit is a devDependency and pnpm deploy --prod excludes it; the
 * deployed package.json also carries a workspace:* dep that blocks reinstall).
 * drizzle-orm itself ships the programmatic migrator, and drizzle-orm + pg are
 * already prod dependencies in the image — so this ~20-line entrypoint applies
 * the journal in /app/drizzle before the server boots. No app code involved;
 * the NestJS application is untouched.
 *
 * Behavior:
 *   - Reads DATABASE_URL from the environment (set by compose / deploy).
 *   - Applies only UNAPPLIED journal entries (idempotent — safe on every
 *     container start), recording them in the `drizzle_migrations` table.
 *   - Exits non-zero on ANY failure so the CMD chain (`node migrate.cjs &&
 *     node dist/main.js`) refuses to start the API on an unmigrated/unreachable
 *     database — fail fast, matching env-validation philosophy (design D6).
 */
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const { Pool } = require('pg');
const { join } = require('node:path');

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);
  try {
    // SSOT with drizzle.config.ts (migrations.table: 'drizzle_migrations') and
    // drizzle-kit CLI default schema (search_path → public): the container and
    // CLI flows share one tracking table, so a DB migrated by either tool is
    // recognized as up-to-date by the other.
    await migrate(db, {
      migrationsFolder: join(__dirname, 'drizzle'),
      migrationsTable: 'drizzle_migrations',
      migrationsSchema: 'public',
    });
  } finally {
    await pool.end();
  }
  console.log('migrate: pending migrations applied (idempotent)');
}

run().catch((error) => {
  console.error(`migrate: FAILED — api will not start: ${error.message}`);
  process.exit(1);
});
