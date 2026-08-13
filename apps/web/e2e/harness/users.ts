/**
 * Test users. Telegram user ids are TEXT in the API (precision-safe) — USER_B
 * deliberately exceeds Number.MAX_SAFE_INTEGER (9007199254740991) so any
 * number-coercion regression in the user-id pipeline fails loudly.
 */
export interface TestUser {
  id: string;
  first_name: string;
  username: string;
  language_code: string;
}

/** First valid opener — claims ownership implicitly (no frontend authMe call). */
export const OWNER_A: TestUser = {
  id: '1010101010101',
  first_name: 'Анна',
  username: 'owner_anna',
  language_code: 'ru',
};

/** Transfer target — big id above 2^53. */
export const USER_B: TestUser = {
  id: '9007199254740993',
  first_name: 'Борис',
  username: 'user_boris',
  language_code: 'ru',
};

/** Third user — used for forged/expired fixtures (never legitimately opens). */
export const USER_C: TestUser = {
  id: '2020202020202',
  first_name: 'Виктор',
  username: 'user_viktor',
  language_code: 'ru',
};
