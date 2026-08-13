/**
 * Vitest INTEGRATION setup — runs BEFORE any test file is imported.
 * ==================================================================
 * AppModule evaluates ConfigModule.forRoot({ validate }) at import time, and
 * the dev .env has an EMPTY BOT_TOKEN → AppModule would throw during module
 * evaluation, before any test hook runs. This setup injects the KNOWN test
 * token + test DB URL + inert-bot flags into process.env FIRST, so the
 * production AppModule boots as-is when the test files import it.
 * (process.env wins over .env in ConfigModule.)
 */

import { TEST_BOT_TOKEN, TEST_DB_URL } from './env';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = TEST_DB_URL;
process.env.BOT_TOKEN = TEST_BOT_TOKEN;
process.env.INIT_DATA_MAX_AGE_SECONDS = '600';
