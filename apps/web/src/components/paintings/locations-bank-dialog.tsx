/**
 * LocationsBankDialog — «Выбрать место» dialog listing every saved location
 * (GET /locations) as full-width rows with the kind badge, loading skeletons,
 * inline retry on error and a friendly empty state (ui-design §2.11).
 * Selection happens by tapping a row — no confirm step.
 */
import { useQuery } from '@tanstack/react-query';
import { ChevronRightIcon, MapIcon } from 'lucide-react';
import { API_PATHS, type LocationDto } from '@painting/shared';

import { ErrorState } from '@/components/paintings/error-state';
import { LocationKindBadge } from '@/components/paintings/location-view';
import { Button } from '@/components/ui/button';
import {
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { strings } from '@/strings';

interface LocationsBankDialogProps {
  onSelect: (location: LocationDto) => void;
  onClose: () => void;
}

export function LocationsBankDialog({ onSelect, onClose }: LocationsBankDialogProps) {
  const { data: locations, isPending, isError, refetch } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get<LocationDto[]>(API_PATHS.locations),
    meta: { suppressErrorToast: true },
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{strings.locations.title}</DialogTitle>
      </DialogHeader>

      <div className="-mx-5 max-h-[50dvh] overflow-y-auto px-5">
        {isPending ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-18 rounded-xl border border-border-subtle bg-card" />
            ))}
          </div>
        ) : isError || !locations ? (
          <ErrorState
            message={strings.common.loadFailed}
            onRetry={() => void refetch()}
            variant="banner"
          />
        ) : locations.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <MapIcon aria-hidden="true" className="size-10 text-muted-foreground" />
            <p className="text-lg leading-relaxed text-muted-foreground">{strings.location.empty}</p>
            <p className="text-base leading-relaxed text-muted-foreground">
              {strings.location.emptyHint}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {locations.map((location) => (
              <button
                key={location.id}
                type="button"
                onClick={() => onSelect(location)}
                className="flex min-h-18 w-full items-center gap-3 rounded-xl border border-border-subtle bg-card px-4 py-3 text-left transition-colors hover:border-border focus-visible:border-ring"
              >
                <LocationKindBadge kind={location.kind} />
                <span className="min-w-0 flex-1 truncate text-lg leading-relaxed">
                  {location.value}
                </span>
                <ChevronRightIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          className="h-13 w-full text-base font-semibold"
          onClick={onClose}
        >
          {strings.common.cancel}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
