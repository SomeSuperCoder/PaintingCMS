/**
 * Date formatting for the ru-RU locale — ownership history lines render like
 * «12.08.2026 — Получен доступ: @newuser» (ux-design §2.5).
 *
 * The API transmits timestamps as ISO-8601 UTC strings; display is purely a
 * frontend concern. Unparseable input falls back to the raw string so the UI
 * never renders an English "Invalid Date".
 */
export function formatRuDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}
