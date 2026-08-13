/**
 * Money formatting for PaintingCMS — ru-RU locale (design D4 / ux-design §2.2).
 *
 * The API transmits prices as integer minor units (`price_minor`) + ISO
 * currency; display is purely a frontend concern. Examples from the design:
 *   RUB 120000 → «1 200 ₽»        USD 12000 → «$120»        EUR 12000 → «€120»
 *   RUB 50     → «0,50 ₽»         (kopecks shown only when present)
 */
import type { Currency } from '@painting/shared';

const CURRENCY_SYMBOL: Record<Currency, string> = {
  rub: '₽',
  usd: '$',
  eur: '€',
};

/** Number of minor units per one whole unit (kopecks/cents). */
const MINOR_UNITS = 100;

/**
 * Format an integer minor-units price for the ru-RU locale.
 * Whole amounts drop the decimals («1 200 ₽»); amounts with kopecks/cents keep
 * two («0,50 ₽»). The symbol sits after the number for RUB, before for $/€.
 */
export function formatPriceMinor(priceMinor: number, currency: Currency): string {
  const amount = priceMinor / MINOR_UNITS;
  const hasFractions = !Number.isInteger(amount);
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: hasFractions ? 2 : 0,
    maximumFractionDigits: hasFractions ? 2 : 0,
  }).format(amount);
  if (currency === 'rub') return `${formatted} ${CURRENCY_SYMBOL.rub}`;
  return `${CURRENCY_SYMBOL[currency]}${formatted}`;
}

/**
 * Display helper for a text input: minor units → the number the user sees,
 * always with two fraction digits (125050 → «1250,50», 125000 → «1250,00»,
 * 5 → «0,05»). Comma is the ru-RU decimal separator. Used to prefill the
 * price field in edit mode.
 *
 * Implemented with integer arithmetic (floor + modulo) rather than
 * division-then-toFixed: on doubles the operations are exact for integer
 * values, so no rounding is introduced even at magnitudes approaching 2^53
 * where `n / 100` starts to lose cents.
 */
export function minorToInput(priceMinor: number): string {
  const sign = priceMinor < 0 ? '-' : '';
  const absolute = Math.abs(priceMinor);
  const whole = Math.floor(absolute / MINOR_UNITS);
  const fraction = absolute % MINOR_UNITS;
  return `${sign}${whole},${String(fraction).padStart(2, '0')}`;
}

/**
 * Parse a user-typed price into integer minor units.
 * Accepts ru-RU style input: spaces/nbsp as thousand separators and a comma
 * (or dot) decimal separator: «12 500», «12500,50», «1200.99».
 * Returns null when the input is not a finite number (validation shows the
 * Russian «Введите цену числом» message).
 */
export function parsePriceToMinor(input: string): number | null {
  const normalized = input.replace(/[\s\u00A0\u202F\u2009]/g, '').replace(',', '.');
  if (normalized === '') return null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * MINOR_UNITS);
}

/**
 * Human-readable size hint for the photo constraint («10 МБ»).
 * `maxSizeBytes` comes from PHOTO_UPLOAD.maxSizeBytes (10 * 1024 * 1024).
 */
export function formatMegabytes(maxSizeBytes: number): string {
  const megabytes = maxSizeBytes / (1024 * 1024);
  return Number.isInteger(megabytes) ? String(megabytes) : megabytes.toFixed(1).replace('.', ',');
}
