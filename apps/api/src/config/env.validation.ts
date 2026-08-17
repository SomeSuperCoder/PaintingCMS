import { plainToInstance, Transform, Type } from 'class-transformer';
import {
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
 * - WEBAPP_URL defaults to '' because CORS falls back to reflecting origins
 *   in local dev only; production sets it and CORS becomes strict.
 * - CADDY_DOMAIN is optional: it is consumed only by the Caddy container
 *   (compose-level), the API itself never reads it.
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

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  DEV_MODE: boolean = false;

  /** Required in production. Optional when DEV_MODE=true (HMAC bypass). */
  @ValidateIf((obj) => !obj.DEV_MODE)
  @IsString()
  @IsNotEmpty()
  BOT_TOKEN!: string;

  @IsString()
  WEBAPP_URL: string = '';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  INIT_DATA_MAX_AGE_SECONDS: number = 600;

  @IsOptional()
  @IsString()
  CADDY_DOMAIN?: string;

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
 * variables (POSTGRES_USER, DATABASE_URL_PROD, ...) instead of failing on
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
