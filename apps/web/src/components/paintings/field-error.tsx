/**
 * Inline Russian field error (a11y §4.8): destructive text ≥4.5:1 + ⚠ icon
 * (never color alone), linked to the field via aria-describedby and announced
 * through the live region of the containing form.
 */
import { TriangleAlertIcon } from 'lucide-react';

interface FieldErrorProps {
  id: string;
  message?: string;
}

export function FieldError({ id, message }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className="flex items-start gap-2 text-base leading-relaxed text-destructive"
    >
      <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      {message}
    </p>
  );
}
