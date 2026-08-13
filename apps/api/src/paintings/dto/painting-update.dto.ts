import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateBy,
  ValidateNested,
} from 'class-validator';

import { FIELD_ERROR_MESSAGES, type Currency } from '@painting/shared';
import { LocationCreateRequestDto } from '../../locations/locations.dto';

/**
 * PATCH XOR gate: the contract applies the exactly-one rule "only when a
 * location field is present" — so BOTH locationId AND newLocation together is
 * the only conflict (400 LOCATION_REQUIRED); neither is a valid no-op, one is
 * the normal case. @IsOptional on newLocation skips the gate when the field
 * is absent, so "neither" never trips it.
 */
const IsLocationNotBoth = (): PropertyDecorator =>
  ValidateBy(
    {
      name: 'isLocationNotBoth',
      validator: {
        validate: (_value, args): boolean => {
          const object = args?.object as PaintingUpdateDto;
          return !(
            object.locationId !== undefined &&
            object.newLocation !== undefined
          );
        },
      },
    },
    { message: FIELD_ERROR_MESSAGES.LOCATION_REQUIRED },
  );

/**
 * PATCH /api/v1/paintings/:id body (contract PaintingUpdateRequestDto) —
 * partial update, every field optional.
 *
 * class-validator 0.15 does NOT skip undefined values for ordinary validators
 * (@IsString/@IsInt/@IsIn etc. FAIL on undefined; the global ValidationPipe
 * runs with skipUndefinedProperties off), so every optional field must carry
 * @IsOptional: it registers the property's only conditional gate, which skips
 * the field's whole validation when the value is undefined/null. Without it, a
 * PATCH containing {} or any single field 400s on the absent fields.
 *
 * With @IsOptional on every field, an empty body {} is a valid no-op (service
 * returns the painting unchanged) and the same contract messages fire when a
 * field IS present but invalid.
 *
 * The location exactly-one rule applies only when a location field is present
 * (contract) — see IsLocationNotBoth below.
 */
export class PaintingUpdateDto {
  @IsOptional()
  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: FIELD_ERROR_MESSAGES.NAME_REQUIRED })
  @IsNotEmpty({ message: FIELD_ERROR_MESSAGES.NAME_REQUIRED })
  @MaxLength(200, { message: FIELD_ERROR_MESSAGES.NAME_TOO_LONG })
  name?: string;

  @IsOptional()
  @IsInt({ message: FIELD_ERROR_MESSAGES.PRICE_INTEGER })
  @Min(0, { message: FIELD_ERROR_MESSAGES.PRICE_NON_NEGATIVE })
  price_minor?: number;

  @IsOptional()
  @IsIn(['rub', 'usd', 'eur'], { message: FIELD_ERROR_MESSAGES.CURRENCY_INVALID })
  currency?: Currency;

  /** When provided, must reference an existing location (service re-verifies, 404). */
  @IsOptional()
  @Matches(/^\d+$/, { message: FIELD_ERROR_MESSAGES.LOCATION_ID_INVALID })
  locationId?: string;

  /**
   * When provided, inline-creates a location (same validation as standalone
   * POST /locations) and applies it to the painting atomically (locations
   * spec select-or-add inline). Mutually exclusive with `locationId` — both
   * present → 400 (IsLocationNotBoth below); neither is a valid no-op.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationCreateRequestDto)
  @IsLocationNotBoth()
  newLocation?: LocationCreateRequestDto;
}
