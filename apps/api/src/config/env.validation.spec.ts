/**
 * env validation — the DEV_MODE × NODE_ENV guard.
 * ============================================================================
 * DEV_MODE is a development escape hatch: it skips HMAC verification, makes
 * every request the constant DEV_USER, and bypasses ownership persistence. The
 * app is therefore fully unauthenticated AND unowned while it is on.
 *
 * These tests pin the refusal to boot when that is combined with
 * NODE_ENV=production — the difference between a loud boot failure and a
 * catalog exposed to the internet behind no auth at all.
 */
import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.validation';

/** Minimal valid production-ish config; each test overrides what it exercises. */
const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/paintingcms',
  BOT_TOKEN: '123456:TEST-BOT-TOKEN',
  PUBLIC_URL: 'https://painting.example.com',
};

describe('validateEnv — DEV_MODE must never run in production', () => {
  it('rejects DEV_MODE=true with NODE_ENV=production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production', DEV_MODE: true })).toThrow(
      /DEV_MODE/,
    );
  });

  it('rejects the string form ("true") too, not just the boolean', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', DEV_MODE: 'true' }),
    ).toThrow(/DEV_MODE/);
  });

  it('allows DEV_MODE=true in development (the supported use)', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'development',
        DEV_MODE: true,
        PUBLIC_URL: '',
        // BOT_TOKEN is optional exactly when DEV_MODE is on.
        BOT_TOKEN: '',
      }),
    ).not.toThrow();
  });

  it('allows DEV_MODE=false in production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production', DEV_MODE: false })).not.toThrow();
  });

  it('allows DEV_MODE unset in production', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', DEV_MODE: undefined }),
    ).not.toThrow();
  });
});