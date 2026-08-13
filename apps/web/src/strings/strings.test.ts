/**
 * Strings module contract tests (docs/ux-design.md §6 master table):
 * 1. every UI string key exists and is non-empty;
 * 2. 100% Russian — no leftover English words (placeholders, URLs, @handles
 *    and the Telegram proper noun are legitimately non-Russian and stripped);
 * 3. formatters substitute their placeholders; t() returns the section.
 */
import { describe, expect, it } from 'vitest';

import { format, strings, t } from '@/strings';

interface Leaf {
  path: string;
  value: string;
}

function collectLeaves(value: unknown, path: string, out: Leaf[]): void {
  if (typeof value === 'string') {
    out.push({ path, value });
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      collectLeaves(child, path ? `${path}.${key}` : key, out);
    }
  }
}

/** Remove the legitimately non-Russian fragments before the Latin scan. */
function stripNonRussian(value: string): string {
  return value
    .replace(/\{[^}]*\}/g, ' ') // {n} {maxFiles} {name} placeholders
    .replace(/https?:\/\/\S+/g, ' ') // https://art.ru, https://…
    .replace(/@\S+/g, ' ') // @username
    .replace(/\bTelegram\b/g, ' ') // proper noun
    .replace(/\busername\b/g, ' '); // Telegram product term («Telegram username»)
}

const LATIN_WORD = /[A-Za-z]{3,}/;

describe('strings contract', () => {
  // collectLeaves pushes into the passed array (returns void).
  const leaves: Leaf[] = [];
  collectLeaves(strings, '', leaves);

  it('exposes a meaningful number of UI strings', () => {
    expect(leaves.length).toBeGreaterThan(40);
  });

  it('every UI string key exists and is non-empty', () => {
    for (const leaf of leaves) {
      expect(leaf.value.trim(), `string ${leaf.path} must be non-empty`).not.toBe('');
    }
  });

  it('contains no leftover English words — 100% Russian', () => {
    const violations: string[] = [];
    for (const leaf of leaves) {
      const rest = stripNonRussian(leaf.value);
      const latin = rest.match(LATIN_WORD);
      if (latin) {
        violations.push(`${leaf.path} = ${JSON.stringify(leaf.value)} (leftover: ${latin.join(', ')})`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps the key strings the screens and components depend on', () => {
    expect(strings.expired.title).toBe('Сессия истекла');
    expect(strings.denied.title).toBe('Доступ запрещён');
    expect(strings.form.locationPick).toBe('Выбрать место');
    expect(strings.form.locationAdd).toBe('Добавить новое место');
    expect(strings.form.currencyRUB).toBe('₽ Рубли');
    expect(strings.form.currencyUSD).toBe('$ Доллары');
    expect(strings.form.currencyEUR).toBe('€ Евро');
    expect(strings.painting.deleteTitle).toBe('Удалить картину «{name}»?');
    expect(strings.painting.deleteBody).toBe('Это действие нельзя отменить.');
    expect(strings.common.network).toBe('Нет соединения. Проверьте интернет.');
  });
});

describe('format helpers', () => {
  it('substitutes placeholders in parameterized strings', () => {
    expect(format.deletePaintingTitle('Закат над рекой')).toBe('Удалить картину «Закат над рекой»?');
    expect(format.photosCount(1, 3)).toBe('Фото 1 из 3');
    expect(format.formPhotosCountOf(2, 5)).toBe('Фото: 2 из 5');
    expect(format.photosHint(10, '10')).toBe('Максимум 10 фотографий. Одно фото — не больше 10 МБ.');
    expect(format.ownerCurrent('ivan')).toBe('Владелец: ivan');
    expect(format.ownerConfirmTitle('ivan')).toBe('Передать владельцу @ivan?');
    expect(format.locationsInUse('Галерея')).toBe(
      'Это место используют картины: Галерея. Сначала замените место у этих картин.',
    );
    expect(format.photoAlt('Закат над рекой')).toBe('Фото картины «Закат над рекой»');
  });
});

describe('t() accessor', () => {
  it('returns a typed section', () => {
    expect(t('home').title).toBe('Мои картины');
    expect(t('expired').reopen).toBe('Открыть заново');
    expect(t('form').price).toBe('Цена');
  });
});
