/**
 * RadioOption — a large toggle button backed by Base UI Radio semantics
 * (aria-checked, arrow-key navigation, hidden input) with the ui-design
 * segment-control look: selected = primary fill + ✓ + bold, never color alone.
 * Used for the currency selector and the location kind switch.
 */
import { Radio } from '@base-ui/react/radio';
import { CheckIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface RadioOptionProps {
  value: string;
  /** Classes shared by both states (layout, size, radius). */
  className: string;
  /** Extra classes when selected. */
  selectedClassName?: string;
  /** Extra classes when unselected. */
  unselectedClassName?: string;
  children: ReactNode;
}

export function RadioOption({
  value,
  className,
  selectedClassName,
  unselectedClassName,
  children,
}: RadioOptionProps) {
  return (
    <Radio.Root
      value={value}
      render={(props, state) => (
        <button
          type="button"
          {...props}
          className={cn(
            'flex items-center justify-center gap-2 rounded-xl text-base font-semibold transition-colors',
            className,
            state.checked ? selectedClassName : unselectedClassName,
          )}
        >
          {state.checked && <CheckIcon aria-hidden="true" className="size-4 shrink-0" />}
          {children}
        </button>
      )}
    />
  );
}
