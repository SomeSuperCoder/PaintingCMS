/**
 * Location kind badge + value display (ui-design §2.8).
 * Badge is icon + text — never color alone (a11y contract §4.3).
 */
import { GlobeIcon, MapPinIcon } from 'lucide-react';
import type { LocationKind } from '@painting/shared';

import { cn } from '@/lib/utils';
import { strings } from '@/strings';

export function LocationKindBadge({ kind }: { kind: LocationKind }) {
  const offline = kind === 'offline';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-base font-semibold leading-none',
        offline ? 'bg-warning-bg text-warning' : 'bg-success-bg text-success',
      )}
    >
      {offline ? (
        <MapPinIcon aria-hidden="true" className="size-4" />
      ) : (
        <GlobeIcon aria-hidden="true" className="size-4" />
      )}
      {offline ? strings.location.kindOffline : strings.location.kindOnline}
    </span>
  );
}

interface LocationValueProps {
  kind: LocationKind;
  value: string;
  className?: string;
}

/** Badge + value row — shared by list card, detail and the form's selected card. */
export function LocationValue({ kind, value, className }: LocationValueProps) {
  return (
    <span className={cn('flex min-w-0 items-center gap-3', className)}>
      <LocationKindBadge kind={kind} />
      <span className="min-w-0 flex-1 truncate text-base leading-relaxed text-muted-foreground">
        {value}
      </span>
    </span>
  );
}
