import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { schema } from './schema';

/**
 * Injection token for the single shared Drizzle DB handle (design D7).
 * A Symbol keeps the token unique and non-clashable; consumers type their
 * parameter as `DrizzleDb` and inject via `@Inject(DRIZZLE_DB)`.
 */
export const DRIZZLE_DB = Symbol('DRIZZLE_DB');

/** The shared DB handle type — the ONLY surface consumers depend on. */
export type DrizzleDb = NodePgDatabase<typeof schema>;

/**
 * The transaction-handle type (`db.transaction` callback arg). Derived from
 * DrizzleDb so it always matches the installed drizzle version's signature —
 * services that run multi-statement writes atomically type their handles with
 * this (e.g. LocationsService.create(tx) for inline newLocation creation).
 */
export type DrizzleTx = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];

/**
 * @Global module exposing DRIZZLE_DB. One pg Pool + one drizzle instance for
 * the whole process (design D7: single shared pool — no per-module pools).
 * The Pool is created lazily from ConfigService (post-validated DATABASE_URL).
 *
 * L: the token + type are the abstraction — a test double (e.g. a mock pool)
 * can be provided in the same slot without touching any consumer.
 */
@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE_DB,
      inject: [ConfigService],
      useFactory: (config: ConfigService): DrizzleDb => {
        const pool = new Pool({
          connectionString: config.getOrThrow<string>('DATABASE_URL'),
        });
        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DRIZZLE_DB],
})
export class DrizzleModule {}
