/**
 * LocationRow — one row of the locations bank (ui-design §3.6): kind badge,
 * the value (address text or URL — online rows link «Открыть» to http(s)
 * URLs only, target=_blank rel=noopener), and large «Изменить» / «Удалить»
 * actions. Every interactive target is ≥52px (a11y contract §4.2).
 */
import { ExternalLinkIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import type { LocationDto } from '@painting/shared';

import { LocationKindBadge } from '@/components/paintings/location-view';
import { Button } from '@/components/ui/button';
import { isHttpUrl } from '@/lib/validation';
import { strings } from '@/strings';

interface LocationRowProps {
  location: LocationDto;
  onEdit: (location: LocationDto) => void;
  onDelete: (location: LocationDto) => void;
}

export function LocationRow({ location, onEdit, onDelete }: LocationRowProps) {
  const isOnline = location.kind === 'online';
  // Defense in depth: the contract guarantees http(s) for online locations,
  // but never render a javascript:/data: href (spawn prompt: http/https only).
  const linkSafe = isOnline && isHttpUrl(location.value);

  return (
    <li className="rounded-xl border border-border-subtle bg-card p-4">
      <div className="flex items-start gap-3">
        <LocationKindBadge kind={location.kind} />
        <p className="min-w-0 flex-1 break-words text-lg leading-relaxed">{location.value}</p>
      </div>

      {linkSafe && (
        <a
          href={location.value}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex h-13 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-base font-semibold transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ExternalLinkIcon aria-hidden="true" className="size-4" />
          {strings.locations.open}
        </a>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-13 flex-1 text-base font-semibold"
          onClick={() => onEdit(location)}
        >
          <PencilIcon aria-hidden="true" className="size-4" />
          {strings.common.edit}
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="h-13 flex-1 text-base font-semibold"
          onClick={() => onDelete(location)}
        >
          <Trash2Icon aria-hidden="true" className="size-4" />
          {strings.common.delete}
        </Button>
      </div>
    </li>
  );
}
