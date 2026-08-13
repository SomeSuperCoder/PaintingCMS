/**
 * money.ts unit tests — ru-RU price formatting (design D4 / ux-design §2.2),
 * input <-> minor-units conversion. The contract: API prices are integer
 * minor units; display never touches floats directly.
 */
import { describe, expect, it } from 'vitest';

import { formatMegabytes, formatPriceMinor, minorToInput, parsePriceToMinor } from '@/lib/money';

/**
 * ICU versions emit NBSP (U+00A0) or NNBSP (U+202F) as the ru-RU grouping
 * separator. Normalize so assertions check meaning (digits, grouping, symbol)
 * rather than the ICU flavor of the separator.
 */
function normalizeSeparators(value: string): string {
  return value.replace(/[\u00A0\u202F\u2009]/g, ' ');
}

describe('formatPriceMinor', () => {
  it('formats RUB with the ₽ symbol after the number (design D4 examples)', () => {
    expect(normalizeSeparators(formatPriceMinor(120_000, 'rub'))).toBe('1 200 ₽');
  });

  it('formats USD with $ before the number', () => {
    expect(formatPriceMinor(12_000, 'usd')).toBe('$120');
  });

  it('formats EUR with € before the number', () => {
    expect(formatPriceMinor(12_000, 'eur')).toBe('€120');
  });

  it('shows two fraction digits only when kopecks/cents are present', () => {
    expect(normalizeSeparators(formatPriceMinor(50, 'rub'))).toBe('0,50 ₽');
    // ru-RU locale uses the comma decimal separator for EVERY currency —
    // only the symbol position differs per currency.
    expect(formatPriceMinor(12_345, 'usd')).toBe('$123,45');
  });

  it('formats zero as «0 ₽» with no decimal noise', () => {
    expect(formatPriceMinor(0, 'rub')).toBe('0 ₽');
    expect(formatPriceMinor(0, 'eur')).toBe('€0');
  });

  it('groups large values with the ru-RU separator and no float drift', () => {
    // 123456789 minor units = 1 234 567,89 — division happens once, Intl rounds.
    expect(normalizeSeparators(formatPriceMinor(123_456_789, 'rub'))).toBe('1 234 567,89 ₽');
    // Classic float-drift candidate: 1000.01 is not exact in binary, yet the
    // integer-division path must render it exactly.
    expect(normalizeSeparators(formatPriceMinor(100_001, 'rub'))).toBe('1 000,01 ₽');
    expect(normalizeSeparators(formatPriceMinor(123_45, 'rub'))).toBe('123,45 ₽');
  });

  it('does not crash on values at the JS safe-integer boundary', () => {
    expect(() => formatPriceMinor(Number.MAX_SAFE_INTEGER, 'rub')).not.toThrow();
    expect(normalizeSeparators(formatPriceMinor(Number.MAX_SAFE_INTEGER, 'rub'))).toMatch(/₽$/);
  });
});

describe('minorToInput', () => {
  it('converts minor units to the ru-RU decimal-separator number the user typed', () => {
    // RED LOCK — production bug (see handoff): minorToInput(125_050) currently
    // returns '1250,5' (String() drops the trailing zero: 10 kopecks → '0,1').
    // The docstring contract says 125050 → «1250,50»; keep asserting the
    // documented behavior until team/frontend fixes the implementation.
    expect(minorToInput(125_050)).toBe('1250,50');
    expect(minorToInput(125_000)).toBe('1250');
    expect(minorToInput(0)).toBe('0');
  });
});

describe('parsePriceToMinor', () => {
  it('parses ru-RU style input: space separators and comma/dot decimals', () => {
    expect(parsePriceToMinor('12 500')).toBe(1_250_000);
    expect(parsePriceToMinor('12500,50')).toBe(1_250_050);
    expect(parsePriceToMinor('1200.99')).toBe(120_099);
    expect(parsePriceToMinor('0')).toBe(0);
  });

  it('accepts non-breaking space variants used by copy-paste', () => {
    expect(parsePriceToMinor('12\u00A0500')).toBe(1_250_000);
    expect(parsePriceToMinor('12\u202F500')).toBe(1_250_000);
  });

  it('rejects empty, malformed and non-finite input with null', () => {
    expect(parsePriceToMinor('')).toBeNull();
    expect(parsePriceToMinor('abc')).toBeNull();
    expect(parsePriceToMinor('12,5,5')).toBeNull();
  });
});

describe('formatMegabytes', () => {
  it('formats whole megabytes without decimals and fractions with a comma', () => {
    expect(formatMegabytes(10 * 1024 * 1024)).toBe('10');
    expect(formatMegabytes(5.5 * 1024 * 1024)).toBe('5,5');
  });
});
