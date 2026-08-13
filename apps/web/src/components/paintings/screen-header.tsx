/**
 * Screen header — flat navigation: in-app «Назад» button (48px+ target, text
 * visible for the low-vision user) + the screen title (h1, exactly one per
 * screen, a11y §4.7). The root screen (list) renders without a back button.
 */
import { ChevronLeftIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { strings } from '@/strings';

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
}

export function ScreenHeader({ title, onBack }: ScreenHeaderProps) {
  return (
    <header className="flex items-center gap-2 px-5 pt-5 pb-4">
      {onBack && (
        <Button
          type="button"
          variant="ghost"
          className="h-13 shrink-0 px-3 text-base font-semibold"
          onClick={onBack}
        >
          <ChevronLeftIcon aria-hidden="true" className="size-6" />
          {strings.common.back}
        </Button>
      )}
      <h1 className="min-w-0 flex-1 truncate text-2xl font-bold leading-tight">{title}</h1>
    </header>
  );
}
