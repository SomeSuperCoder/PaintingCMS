import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  Equals,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  validateSync,
  ValidationError,
} from 'class-validator';

/**
 * Environment variable contract (design D6 — ConfigModule with validation).
 *
 * The app fails fast at boot when the environment is invalid instead of
 * misbehaving at request time. Defaults mirror .env.example; process.env
 * always wins over the .env file (ConfigModule precedence).
 *
 * Why these fields:
 * - DATABASE_URL is REQUIRED — the API has no boot path without a database.
 * - DEV_MODE when true disables HMAC verification on initData and makes
 *   BOT_TOKEN optional — intended for local development and E2E testing only.
 *   NEVER set DEV_MODE=true in production.
 * - BOT_TOKEN is REQUIRED for auth in production: it is the HMAC secret for
 *   every initData validation (design D2). Optional when DEV_MODE=true.
 * - PUBLIC_URL is the ONE public URL for the whole app (Caddy domain, CORS
 *   allow-list, Telegram webhook base, bot Mini App button). It defaults to ''
 *   for local dev, where CORS reflects any origin; in production it is
 *   REQUIRED and must be https:// (fail fast instead of silently open CORS).
 */
export class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  @Matches(/^postgres(?:ql)?:\/\//, {
    message: 'DATABASE_URL must be a postgres:// or postgresql:// connection URL',
  })
  DATABASE_URL!: string;

  /**
   * Development escape hatch. When true: HMAC verification is skipped, every
   * request is the constant DEV_USER, and ownership persistence is bypassed
   * entirely — the app is fully unauthenticated and nobody owns it.
   *
   * MUST NOT be combined with NODE_ENV=production. The @ValidateIf/@Equals pair
   * below encodes that: the constraint only evaluates when DEV_MODE is true AND
   * NODE_ENV is production, and then demands DEV_MODE be false — so the
   * combination fails validation and the app refuses to boot, instead of relying
   * on the "NEVER in production" comment.
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @ValidateIf((obj) => obj.DEV_MODE === true && obj.NODE_ENV === 'production')
  @Equals(false, {
    message:
      'DEV_MODE=true is a development-only escape hatch (no auth, no ownership) and MUST NOT be used when NODE_ENV=production',
  })
  DEV_MODE: boolean = false;

  /** Required in production. Optional when DEV_MODE=true (HMAC bypass). */
  @ValidateIf((obj) => !obj.DEV_MODE)
  @IsString()
  @IsNotEmpty()
  BOT_TOKEN!: string;

  /**
   * The app's single public origin. Optional in dev (CORS reflects); REQUIRED
   * in production and must be https:// — except loopback http, which is
   * allowed so `just up` can smoke-test the full stack locally.
   */
  @ValidateIf((obj) => obj.NODE_ENV === 'production')
  @IsString()
  @IsNotEmpty()
  @Matches(/^(https:\/\/[^\s]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/, {
    message:
      'PUBLIC_URL must be an https:// URL in production (http:// is only allowed for localhost)',
  })
  PUBLIC_URL: string = '';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  INIT_DATA_MAX_AGE_SECONDS: number = 600;

  /**
   * Photos storage root (design D9): overrides the cwd/storage/photos default
   * so the api container can mount the compose volume there. Optional — the
   * photos module resolves its default when absent.
   */
  @IsOptional()
  @IsString()
  PHOTOS_STORAGE_DIR?: string;
}

/**
 * ConfigModule.validate hook. `whitelist: true` silently strips unrelated
 * variables (POSTGRES_USER, POSTGRES_PASSWORD, ...) instead of failing on
 * them; unknown API-level variables still surface as validation errors.
 */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors: ValidationError[] = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: true,
  });

  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('\n  - ');
    throw new Error(`Environment validation failed:\n  - ${details}`);
  }

  return validated;
}
