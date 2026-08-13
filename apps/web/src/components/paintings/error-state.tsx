/**
 * Inline error state with a retry action — used by list/detail/form screens.
 * Always a plain Russian message + a ≥52px «Повторить» button (a11y §4.6).
 */
import { TriangleAlertIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { strings } from '@/strings';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  /** Rendered inside a card (default) or as a bare banner row. */
  variant?: 'card' | 'banner';
}

export function ErrorState({ message, onRetry, variant = 'card' }: ErrorStateProps) {
  if (variant === 'banner') {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-xl border border-destructive/40 bg-danger-bg p-4"
      >
        <p className="flex items-start gap-2 text-lg leading-relaxed text-destructive">
          <TriangleAlertIcon aria-hidden="true" className="mt-1 size-5 shrink-0" />
          {message}
        </p>
        {onRetry && (
          <Button type="button" variant="outline" size="lg" className="h-13" onClick={onRetry}>
            {strings.common.retry}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-6 rounded-xl border border-border-subtle bg-card px-6 py-10 text-center"
    >
      <TriangleAlertIcon aria-hidden="true" className="size-10 text-destructive" />
      <p className="text-lg leading-relaxed text-foreground">{message}</p>
      {onRetry && (
        <Button type="button" variant="outline" size="lg" className="h-13 px-8" onClick={onRetry}>
          {strings.common.retry}
        </Button>
      )}
    </div>
  );
}
