/**
 * Locations DTO validators (tasks 8.1-8.2 unit portion).
 * ======================================================================
 * kind: exactly 'offline' | 'online'. value: non-empty after trim, ≤500;
 * when kind === 'online' it must be a valid http/https URL. Every failure
 * maps to the contract FIELD_ERROR_MESSAGES constant. Intended behavior: in a
 * PATCH with only { value } (kind unknown), the URL check is NOT applied
 * (the API layer cannot know the stored kind; the DB CHECK backstops
 * non-emptiness, not URL-ness).
 */

import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { FIELD_ERROR_MESSAGES } from '@painting/shared';
import {
  LocationCreateRequestDto,
  LocationUpdateRequestDto,
} from './locations.dto';

async function errorsFor(
  cls: new () => object,
  plain: Record<string, unknown>,
): Promise<ValidationError[]> {
  return validate(plainToInstance(cls, plain));
}

function messagesFor(errors: ValidationError[], property: string): string[] {
  const error = errors.find((e) => e.property === property);
  return Object.values(error?.constraints ?? {});
}

const LONG_VALUE = 'г'.repeat(501);

describe('LocationCreateRequestDto', () => {
  it('accepts a valid offline location (street address)', async () => {
    const errors = await errorsFor(LocationCreateRequestDto, {
      kind: 'offline',
      value: 'ул. Пушкина, 10',
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts a valid online location (http/https URL)', async () => {
    const errors = await errorsFor(LocationCreateRequestDto, {
      kind: 'online',
      value: 'https://example.com/shop',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects an unknown kind → LOCATION_KIND_INVALID', async () => {
    const errors = await errorsFor(LocationCreateRequestDto, {
      kind: 'physical',
      value: 'что-то',
    });
    expect(messagesFor(errors, 'kind')).toContain(FIELD_ERROR_MESSAGES.LOCATION_KIND_INVALID);
  });

  it('rejects a value too long (501 chars) → LOCATION_VALUE_REQUIRED when the URL gate is open (online)', async () => {
    // kind === 'online' → ValidateIf passes → IsString/IsNotEmpty/MaxLength run.
    const errors = await errorsFor(LocationCreateRequestDto, {
      kind: 'online',
      value: LONG_VALUE,
    });
    expect(messagesFor(errors, 'value')).toContain(FIELD_ERROR_MESSAGES.LOCATION_VALUE_REQUIRED);
  });

  // ── Offline value gate (fix landed: base validators run for BOTH kinds) ────
  // IsString/IsNotEmpty/MaxLength are unconditional; the URL rule is the only
  // kind-conditional check (IsUrlWhenOnline). So offline empty / whitespace /
  // 501-char values are rejected at the DTO layer with the 400 contract
  // message — never left to the DB CHECK (locations_value_check), which would
  // surface to the client as a 500.
  it.each([
    { case: 'empty value', plain: { value: '' } },
    { case: 'whitespace-only value', plain: { value: '   ' } },
    { case: 'value too long (501 chars)', plain: { value: LONG_VALUE } },
  ])(
    'rejects offline $case at the DTO layer → LOCATION_VALUE_REQUIRED (400 contract, never 500)',
    async ({ plain }) => {
      const errors = await errorsFor(LocationCreateRequestDto, {
        kind: 'offline',
        ...plain,
      });
      expect(messagesFor(errors, 'value')).toContain(FIELD_ERROR_MESSAGES.LOCATION_VALUE_REQUIRED);
    },
  );

  it.each([
    { case: 'not a URL', plain: { value: 'not a url' } },
    { case: 'wrong protocol (ftp)', plain: { value: 'ftp://example.com' } },
    { case: 'missing protocol', plain: { value: 'example.com' } },
  ])('rejects an online value that is not an http/https URL: $case → LOCATION_URL_INVALID', async ({ plain }) => {
    const errors = await errorsFor(LocationCreateRequestDto, {
      kind: 'online',
      ...plain,
    });
    expect(messagesFor(errors, 'value')).toContain(FIELD_ERROR_MESSAGES.LOCATION_URL_INVALID);
  });
});

describe('LocationUpdateRequestDto', () => {
  it('accepts an empty body (partial update — every field optional)', async () => {
    const errors = await errorsFor(LocationUpdateRequestDto, {});
    expect(errors).toHaveLength(0);
  });

  it('rejects an unknown kind → LOCATION_KIND_INVALID', async () => {
    const errors = await errorsFor(LocationUpdateRequestDto, { kind: 'physical' });
    expect(messagesFor(errors, 'kind')).toContain(FIELD_ERROR_MESSAGES.LOCATION_KIND_INVALID);
  });

  it('rejects a value too long → LOCATION_VALUE_REQUIRED when the URL gate is open (kind online)', async () => {
    const errors = await errorsFor(LocationUpdateRequestDto, {
      kind: 'online',
      value: LONG_VALUE,
    });
    expect(messagesFor(errors, 'value')).toContain(FIELD_ERROR_MESSAGES.LOCATION_VALUE_REQUIRED);
  });

  // ── Value-only PATCH gate (fix landed: base validators unconditional) ──────
  it('rejects a value-only PATCH (501 chars) at the DTO layer → LOCATION_VALUE_REQUIRED', async () => {
    const errors = await errorsFor(LocationUpdateRequestDto, { value: LONG_VALUE });
    expect(messagesFor(errors, 'value')).toContain(FIELD_ERROR_MESSAGES.LOCATION_VALUE_REQUIRED);
  });

  it('rejects a non-URL value when kind === online is present → LOCATION_URL_INVALID', async () => {
    const errors = await errorsFor(LocationUpdateRequestDto, {
      kind: 'online',
      value: 'not a url',
    });
    expect(messagesFor(errors, 'value')).toContain(FIELD_ERROR_MESSAGES.LOCATION_URL_INVALID);
  });

  it('does NOT apply the URL check when only { value } is sent (stored kind unknown — intended behavior)', async () => {
    const errors = await errorsFor(LocationUpdateRequestDto, {
      value: 'неизвестно что',
    });
    expect(errors).toHaveLength(0);
  });
});
