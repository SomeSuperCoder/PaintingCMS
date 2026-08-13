/**
 * Painting DTO validators (tasks 8.1-8.2 unit portion).
 * ======================================================================
 * Every failure MUST map to the contract FIELD_ERROR_MESSAGES constant
 * (Russian, SSOT) — never an invented string. Exercises the real
 * class-validator pipeline (plainToInstance + validate), including the
 * @Transform trim on `name`.
 */

import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { FIELD_ERROR_MESSAGES } from '@painting/shared';
import { PaintingCreateDto } from './painting-create.dto';
import { PaintingUpdateDto } from './painting-update.dto';

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

const LONG_NAME = 'К'.repeat(201);

describe('PaintingCreateDto', () => {
  it('accepts a valid painting body', async () => {
    const errors = await errorsFor(PaintingCreateDto, {
      name: 'Красный закат',
      price_minor: 1500,
      currency: 'rub',
      locationId: '12',
    });
    expect(errors).toHaveLength(0);
  });

  it.each([
    { case: 'name too long (201 chars)', plain: { name: LONG_NAME }, expected: FIELD_ERROR_MESSAGES.NAME_TOO_LONG },
    { case: 'empty name', plain: { name: '' }, expected: FIELD_ERROR_MESSAGES.NAME_REQUIRED },
    { case: 'whitespace-only name (trimmed to empty)', plain: { name: '   ' }, expected: FIELD_ERROR_MESSAGES.NAME_REQUIRED },
    { case: 'missing name', plain: {}, expected: FIELD_ERROR_MESSAGES.NAME_REQUIRED },
  ])('rejects $case → $expected', async ({ plain, expected }) => {
    const errors = await errorsFor(PaintingCreateDto, {
      price_minor: 100,
      currency: 'rub',
      locationId: '1',
      ...plain,
    });
    expect(messagesFor(errors, 'name')).toContain(expected);
  });

  it.each([
    { case: 'negative price', plain: { price_minor: -1 }, expected: FIELD_ERROR_MESSAGES.PRICE_NON_NEGATIVE },
    { case: 'fractional price', plain: { price_minor: 1.5 }, expected: FIELD_ERROR_MESSAGES.PRICE_INTEGER },
    { case: 'missing price', plain: {}, expected: FIELD_ERROR_MESSAGES.PRICE_REQUIRED },
  ])('rejects $case → $expected', async ({ plain, expected }) => {
    const errors = await errorsFor(PaintingCreateDto, {
      name: 'Картина',
      currency: 'rub',
      locationId: '1',
      ...plain,
    });
    expect(messagesFor(errors, 'price_minor')).toContain(expected);
  });

  it.each([
    { case: 'unknown currency', plain: { currency: 'gbp' }, expected: FIELD_ERROR_MESSAGES.CURRENCY_INVALID },
    { case: 'missing currency', plain: {}, expected: FIELD_ERROR_MESSAGES.CURRENCY_REQUIRED },
  ])('rejects $case → $expected', async ({ plain, expected }) => {
    const errors = await errorsFor(PaintingCreateDto, {
      name: 'Картина',
      price_minor: 100,
      locationId: '1',
      ...plain,
    });
    expect(messagesFor(errors, 'currency')).toContain(expected);
  });

  it.each([
    { case: 'non-numeric locationId', plain: { locationId: 'abc' }, expected: FIELD_ERROR_MESSAGES.LOCATION_ID_INVALID },
    { case: 'fractional locationId', plain: { locationId: '12.5' }, expected: FIELD_ERROR_MESSAGES.LOCATION_ID_INVALID },
    { case: 'missing locationId', plain: {}, expected: FIELD_ERROR_MESSAGES.LOCATION_REQUIRED },
  ])('rejects $case → $expected', async ({ plain, expected }) => {
    const errors = await errorsFor(PaintingCreateDto, {
      name: 'Картина',
      price_minor: 100,
      currency: 'rub',
      ...plain,
    });
    expect(messagesFor(errors, 'locationId')).toContain(expected);
  });
});

describe('PaintingUpdateDto', () => {
  // ── Partial PATCH (fix landed: @IsOptional on every field) ─────────────────
  // class-validator 0.15 runs ordinary validators on `undefined`, so every
  // optional field carries @IsOptional: PATCH {} is a valid no-op and a
  // single-field PATCH does not 400 on the ABSENT fields. The contract
  // messages still fire when a field IS present but invalid (asserted below).
  it('accepts an empty body as a valid no-op (partial update)', async () => {
    const errors = await errorsFor(PaintingUpdateDto, {});
    expect(errors).toHaveLength(0);
  });

  it('accepts a single valid partial field without erroring on absent fields', async () => {
    const errors = await errorsFor(PaintingUpdateDto, { price_minor: 100 });
    expect(errors).toHaveLength(0);
  });

  it('rejects a too-long name → NAME_TOO_LONG', async () => {
    const errors = await errorsFor(PaintingUpdateDto, { name: LONG_NAME });
    expect(messagesFor(errors, 'name')).toContain(FIELD_ERROR_MESSAGES.NAME_TOO_LONG);
  });

  it('rejects a negative price → PRICE_NON_NEGATIVE', async () => {
    const errors = await errorsFor(PaintingUpdateDto, { price_minor: -5 });
    expect(messagesFor(errors, 'price_minor')).toContain(FIELD_ERROR_MESSAGES.PRICE_NON_NEGATIVE);
  });

  it('rejects a fractional price → PRICE_INTEGER', async () => {
    const errors = await errorsFor(PaintingUpdateDto, { price_minor: 2.5 });
    expect(messagesFor(errors, 'price_minor')).toContain(FIELD_ERROR_MESSAGES.PRICE_INTEGER);
  });

  it('rejects an unknown currency → CURRENCY_INVALID', async () => {
    const errors = await errorsFor(PaintingUpdateDto, { currency: 'gbp' });
    expect(messagesFor(errors, 'currency')).toContain(FIELD_ERROR_MESSAGES.CURRENCY_INVALID);
  });

  it('rejects a non-numeric locationId → LOCATION_ID_INVALID', async () => {
    const errors = await errorsFor(PaintingUpdateDto, { locationId: 'x1' });
    expect(messagesFor(errors, 'locationId')).toContain(FIELD_ERROR_MESSAGES.LOCATION_ID_INVALID);
  });
});
