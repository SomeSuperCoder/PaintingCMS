/**
 * Bottom action bar — the app's signature a11y pattern (ui-design §2.10):
 * the primary screen action is always visible, full-width, 56px tall, inside
 * the thumb zone, with safe-area padding for the Telegram home indicator.
 */
import type { ReactNode } from 'react';

export function BottomActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 border-t border-border-subtle bg-bottom-bar px-5 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">{children}</div>
    </div>
  );
}
