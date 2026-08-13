import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
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
 * Exactly-one-of gate for locationId | newLocation (contract: "validation:
 * exactly one of locationId | newLocation must be present").
 *
 * class-validator has no class-level decorator; the gate hangs on the
 * `newLocation` property (property-decorator reading sibling fields is the
 * codebase pattern — locations.dto.ts IsUrlWhenOnline). It runs even when
 * newLocation is undefined (no @IsOptional here), so "both absent" fires
 * LOCATION_REQUIRED; "both present" fires the same message; exactly one
 * passes. locationId is independently gated by @IsOptional + @Matches when
 * present.
 */
const IsLocationExactlyOneOf = (): PropertyDecorator =>
  ValidateBy(
    {
      name: 'isLocationExactlyOneOf',
      validator: {
        validate: (_value, args): boolean => {
          const object = args?.object as PaintingCreateDto;
          const hasLocationId = object.locationId !== undefined;
          const hasNewLocation = object.newLocation !== undefined;
          return hasLocationId !== hasNewLocation;
        },
      },
    },
    { message: FIELD_ERROR_MESSAGES.LOCATION_REQUIRED },
  );

/**
 * POST /api/v1/paintings body (contract PaintingCreateRequestDto): the
 * location is REQUIRED via exactly one of `locationId` (an existing location
 * from the bank) or `newLocation` (created inline and saved to the bank,
 * locations spec select-or-add inline — same kind/value validation as a
 * standalone POST /locations).
 *
 * Validation messages are the contract FIELD_ERROR_MESSAGES constants only
 * (Russian, SSOT). Ids travel as STRINGS on the wire (contract: opaque ids,
 * D3), even though the DB serials are integers — the service converts with
 * Number().
 */
export class PaintingCreateDto {
  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: FIELD_ERROR_MESSAGES.NAME_REQUIRED })
  @IsNotEmpty({ message: FIELD_ERROR_MESSAGES.NAME_REQUIRED })
  @MaxLength(200, { message: FIELD_ERROR_MESSAGES.NAME_TOO_LONG })
  name!: string;

  /** Integer minor units (kopecks/cents), non-negative — never a float. */
  @IsDefined({ message: FIELD_ERROR_MESSAGES.PRICE_REQUIRED })
  @IsInt({ message: FIELD_ERROR_MESSAGES.PRICE_INTEGER })
  @Min(0, { message: FIELD_ERROR_MESSAGES.PRICE_NON_NEGATIVE })
  price_minor!: number;

  @IsDefined({ message: FIELD_ERROR_MESSAGES.CURRENCY_REQUIRED })
  @IsIn(['rub', 'usd', 'eur'], { message: FIELD_ERROR_MESSAGES.CURRENCY_INVALID })
  currency!: Currency;

  /**
   * An existing location from the bank. Exactly-one-of with `newLocation`
   * (IsLocationExactlyOneOf below) — either may be absent, never both; the
   * service re-verifies existence (404).
   */
  @IsOptional()
  @Matches(/^\d+$/, { message: FIELD_ERROR_MESSAGES.LOCATION_ID_INVALID })
  locationId?: string;

  /**
   * Inline-created location (contract LocationCreateRequestDto) — validated
   * with the EXACT same rules as a standalone POST /locations (kind offline|
   * online, value non-empty ≤500, http/https URL when online), then persisted
   * to the bank and applied to the painting in the same transaction.
   * Exactly-one-of with `locationId` (IsLocationExactlyOneOf below).
   */
  @ValidateNested()
  @Type(() => LocationCreateRequestDto)
  @IsLocationExactlyOneOf()
  newLocation?: LocationCreateRequestDto;
}
