import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit config (task 2.2 wiring). The migrations-table name is set
 * explicitly ('drizzle_migrations') so it is stable across environments and
 * matches the design's migration contract. DATABASE_URL is read from the
 * process environment (loaded by `just`/compose/CI) — fail loudly at CLI time
 * instead of silently defaulting to a wrong database.
 */
if (!process.env.DATABASE_URL) {
  throw new Error(
    'drizzle.config.ts: DATABASE_URL is required (set it in .env or the shell, see .env.example).',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    table: 'drizzle_migrations',
  },
});
