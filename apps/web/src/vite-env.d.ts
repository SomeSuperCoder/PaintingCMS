/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional mock Telegram initData string for `vite dev` outside Telegram.
   *  When unset, src/lib/tma.ts falls back to its built-in mock constant.
   *  Production builds never mock (initData comes from the real Telegram env). */
  readonly VITE_TMA_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
