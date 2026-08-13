/**
 * Locations request DTOs — class-validator mirrors of the shared contract
 * (packages/shared/src/api-contract.ts: LocationCreateRequestDto /
 * LocationUpdateRequestDto). The contract header says backend DTOs MIRROR the
 * shared types — the shapes are never redefined here, only enforced.
 *
 * Validation rules (locations spec + contract FIELD_ERROR_MESSAGES):
 * - kind: exactly 'offline' | 'online' (contract LocationKind).
 * - value: non-empty after trim, ≤ 500 chars; when kind === 'online' it must
 *   also be a valid http/https URL (spec: "validated as a valid http/https URL").
 *
 * Cross-field note: the online-vs-offline URL rule lives in a custom
 * constraint (IsUrlWhenOnline) because class-validator's only gate,
 * @ValidateIf, skips the WHOLE property when its condition is false
 * (ValidationExecutor.performValidations) — it cannot condition one validator
 * while letting sibling validators run. The constraint checks the request
 * body's own kind, so in a PATCH that sends only { value } the stored kind is
 * unknown at the API layer and the URL rule does not apply — the DB CHECK
 * (locations_value_check, schema.ts) backstops non-emptiness, not URL-ness.
 * The frontend edit screen always edits kind + value together (spec: "edit the
 * kind and value of an existing location"), so this limitation never surfaces
 * in the real user flow.
 */

import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateBy,
} from 'class-validator';

import { FIELD_ERROR_MESSAGES, type LocationKind } from '@painting/shared';

/**
 * The two legal kinds. The `satisfies` assertion keeps this compile-checked
 * against the shared contract: if LocationKind ever grows a third value, this
 * literal stops compiling and the enum is updated deliberately.
 */
const LOCATION_KINDS = ['offline', 'online'] as const satisfies readonly LocationKind[];

/**
 * URL gate for the online kind, mirroring class-validator's @IsUrl
 * ({ require_protocol: true, protocols: ['http', 'https'] }):
 * - non-string / empty / whitespace-containing → invalid
 * - must carry an explicit http:// or https:// protocol
 * - host must be present and dotted (FQDN) or an IP literal
 * Implemented locally because 'validator' (validator.js) is not a declared
 * dependency of apps/api (pnpm strict layout) and class-validator does not
 * re-export isURL. Minor drift from validator.js isURL on exotic inputs (e.g.
 * out-of-range ports) is accepted; the 500-char MaxLength caps input size.
 */
function isHttpUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0 || /[\s<>]/.test(value)) {
    return false;
  }
  // require_protocol + protocol whitelist (http/https only).
  if (!/^https?:\/\//i.test(value)) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false; // malformed: bad port, bad IPv6, stray characters, ...
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }
  // require_host + require_tld: a dotted FQDN or an IP literal ('[::1]' for IPv6).
  const host = parsed.hostname;
  return host !== '' && (host.includes('.') || host.startsWith('['));
}

/**
 * The online-vs-offline conditional applied ONLY to the URL rule.
 *
 * class-validator's conditional decorators (@ValidateIf, @IsOptional) gate the
 * WHOLE property: ValidationExecutor.performValidations skips every other
 * validator on the property when any condition is false. A conditional @IsUrl
 * therefore cannot coexist with the unconditional IsString/IsNotEmpty/
 * MaxLength checks on `value` — the condition is internalized in this single
 * constraint instead:
 * - kind !== 'online' → URL rule not applicable, always valid (base validators
 *   below own the value for both kinds: required, non-empty, ≤ 500 chars).
 * - kind === 'online' → a non-empty string must additionally be a valid
 *   http/https URL (LOCATION_URL_INVALID). Empty/absent values are left to
 *   IsNotEmpty (LOCATION_VALUE_REQUIRED) so a missing URL does not double-error.
 */
const IsUrlWhenOnline = (): PropertyDecorator =>
  ValidateBy(
    {
      name: 'isUrlWhenOnline',
      validator: {
        validate: (value, args): boolean => {
          const kind = (args?.object as { kind?: LocationKind } | undefined)?.kind;
          if (kind !== 'online') {
            return true;
          }
          if (typeof value !== 'string' || value.trim() === '') {
            return true; // required/empty owned by IsNotEmpty (LOCATION_VALUE_REQUIRED)
          }
          return isHttpUrl(value);
        },
      },
    },
    { message: FIELD_ERROR_MESSAGES.LOCATION_URL_INVALID },
  );

/**
 * POST /api/v1/locations body — both fields required.
 * The @Transform trim runs before validation so IsNotEmpty/MaxLength/IsUrlWhenOnline
 * all measure the trimmed value (a body of '   ' is empty, not a URL).
 */
export class LocationCreateRequestDto {
  @IsIn(LOCATION_KINDS, { message: FIELD_ERROR_MESSAGES.LOCATION_KIND_INVALID })
  kind!: LocationKind;

  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: FIELD_ERROR_MESSAGES.LOCATION_VALUE_REQUIRED })
  @IsNotEmpty({ message: FIELD_ERROR_MESSAGES.LOCATION_VALUE_REQUIRED })
  // No LOCATION_VALUE_TOO_LONG constant exists in the contract; reusing the
  // required-message is imperfect but no new string may be invented (contract
  // amendment noted for the integration microtask).
  @MaxLength(500, { message: FIELD_ERROR_MESSAGES.LOCATION_VALUE_REQUIRED })
  // Base validators above run for BOTH kinds (offline empty/whitespace/too-long
  // → 400, never the DB CHECK → 500); the URL rule applies only for online.
  @IsUrlWhenOnline()
  value!: string;
}

/**
 * PATCH /api/v1/locations/:id body — partial update, every field optional.
 * @IsOptional makes `undefined` skip all validators (null is treated as
 * absent too), so a field the client did not send is never re-validated.
 * When `value` IS present it must satisfy the same rules as create; the URL
 * rule fires when the body's own kind is 'online' (see file header note).
 */
export class LocationUpdateRequestDto {
  @IsOptional()
  @IsIn(LOCATION_KINDS, { message: FIELD_ERROR_MESSAGES.LOCATION_KIND_INVALID })
  kind?: LocationKind;

  @IsOptional()
  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: FIELD_ERROR_MESSAGES.LOCATION_VALUE_REQUIRED })
  @IsNotEmpty({ message: FIELD_ERROR_MESSAGES.LOCATION_VALUE_REQUIRED })
  @MaxLength(500, { message: FIELD_ERROR_MESSAGES.LOCATION_VALUE_REQUIRED })
  @IsUrlWhenOnline()
  value?: string;
}
