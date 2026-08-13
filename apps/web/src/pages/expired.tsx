/**
 * «Сессия истекла» — public calm screen (ux-design §2.7, ui-design §3.1).
 * Rendered by the AuthGate when any request returns 401 (initData missing,
 * invalid or expired). One action: «Открыть заново» re-captures a fresh
 * initData (tma.reinitTMA) and reloads the app so the bootstrap runs again.
 */
import { useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { reinitTMA } from '@/lib/tma';
import { strings } from '@/strings';

export function ExpiredPage() {
  const handleReopen = useCallback(() => {
    reinitTMA();
    window.location.reload();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center gap-4 px-5 text-center">
      <span aria-hidden="true" className="text-7xl leading-none">🔐</span>
      <h1 className="text-3xl font-bold leading-tight">{strings.expired.title}</h1>
      <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
        {strings.expired.body}
      </p>
      <Button
        type="button"
        className="mt-2 h-13 px-10 text-lg font-bold"
        onClick={handleReopen}
      >
        {strings.expired.reopen}
      </Button>
    </main>
  );
}
