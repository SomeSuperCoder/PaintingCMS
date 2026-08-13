/**
 * «Доступ запрещён» — public calm screen (ux-design §2.6, ui-design §3.2).
 * Rendered by the AuthGate when any request returns 403: a valid Telegram user
 * who is NOT the current owner (including the previous owner right after a
 * transfer). No actions, no retry loop, no data requests (data-leak guard) —
 * Telegram back is the only way out. Calm by contract: the ex-owner must see
 * this WITHOUT an aggressive error flash (a11y calm-state rule).
 */
import { strings } from '@/strings';

export function DeniedPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center gap-4 px-5 text-center">
      <span aria-hidden="true" className="text-7xl leading-none">🚫</span>
      <h1 className="text-3xl font-bold leading-tight">{strings.denied.title}</h1>
      <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
        {strings.denied.body}
      </p>
    </main>
  );
}
