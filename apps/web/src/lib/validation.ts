/**
 * Shared validation helpers — Russian messages come from the zod schemas in
 * the screens; this module holds the pure predicates only.
 */

/** True when the value is an absolute http(s) URL (locations spec). */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
