/**
 * Locations page — route «/locations» (ux-design §2.4, ui-design §3.6): the
 * persistent bank of sales locations. List rows with kind badge, loading
 * skeletons without shimmer, friendly empty state with a CTA, error + retry,
 * and the sticky «+ Добавить место» bottom bar.
 *
 * Delete is confirmed in a Russian AlertDialog (cancel-first, danger above).
 * Deleting a location used by paintings is BLOCKED: the API answers 409
 * LOCATION_IN_USE and the page shows the contract's Russian message plus the
 * affected painting names («…», «…») when the server provides them — the row
 * is NOT removed (locations spec: warn + block).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_PATHS, type LocationDto, type PaintingRefDto } from '@painting/shared';
import { toast } from 'sonner';

import { BottomActionBar } from '@/components/paintings/bottom-action-bar';
import { ErrorState } from '@/components/paintings/error-state';
import { ScreenHeader } from '@/components/paintings/screen-header';
import { LocationFormDialog } from '@/components/locations/location-form-dialog';
import { LocationRow } from '@/components/locations/location-row';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { api, apiErrorMessage, ApiError } from '@/lib/api';
import { ROUTES } from '@/routes';
import { format, strings } from '@/strings';

type LocationDialogState = { mode: 'create' } | { mode: 'edit'; location: LocationDto };

/** 409 blocked-delete payload: the contract message + affected paintings. */
interface BlockedDelete {
  message: string;
  paintings: PaintingRefDto[];
}

export function LocationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<LocationDialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LocationDto | null>(null);
  const [blocked, setBlocked] = useState<BlockedDelete | null>(null);

  const { data: locations, isPending, isError, refetch } = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get<LocationDto[]>(API_PATHS.locations),
    meta: { suppressErrorToast: true },
  });

  const deleteMutation = useMutation({
    mutationFn: (location: LocationDto) => api.delete<void>(API_PATHS.location(location.id)),
    onSuccess: () => {
      toast.success(strings.locations.deleted);
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      setDeleteTarget(null);
    },
    onError: (error) => {
      setDeleteTarget(null);
      if (error instanceof ApiError && error.code === 'LOCATION_IN_USE') {
        setBlocked({ message: error.message, paintings: error.details?.paintings ?? [] });
      } else {
        toast.error(apiErrorMessage(error));
      }
    },
  });

  const blockedMessage = blocked
    ? blocked.paintings.length > 0
      ? format.locationsInUse(blocked.paintings.map((p) => `«${p.name}»`).join(', '))
      : blocked.message
    : '';

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <ScreenHeader title={strings.locations.title} onBack={() => navigate(ROUTES.home)} />

      <main className="flex-1 px-5 pb-40">
        {isPending ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-18 rounded-xl border border-border-subtle bg-card" />
            ))}
          </div>
        ) : isError || !locations ? (
          <ErrorState message={strings.common.loadFailed} onRetry={() => void refetch()} />
        ) : locations.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span aria-hidden="true" className="text-7xl leading-none">🗺</span>
            <p className="text-xl font-bold leading-snug">{strings.location.empty}</p>
            <p className="text-lg leading-relaxed text-muted-foreground">
              {strings.location.emptyHint}
            </p>
            <Button
              type="button"
              className="h-13 text-lg font-bold"
              onClick={() => setDialog({ mode: 'create' })}
            >
              {strings.locations.add}
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {locations.map((location) => (
              <LocationRow
                key={location.id}
                location={location}
                onEdit={(l) => setDialog({ mode: 'edit', location: l })}
                onDelete={(l) => setDeleteTarget(l)}
              />
            ))}
          </ul>
        )}
      </main>

      <BottomActionBar>
        <Button
          type="button"
          className="h-13 w-full text-lg font-bold"
          onClick={() => setDialog({ mode: 'create' })}
        >
          <PlusIcon aria-hidden="true" className="size-5" />
          {strings.locations.add}
        </Button>
      </BottomActionBar>

      {dialog && (
        <LocationFormDialog
          mode={dialog.mode}
          location={dialog.mode === 'edit' ? dialog.location : undefined}
          onClose={() => setDialog(null)}
        />
      )}

      {/* Delete confirmation — unused location */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon aria-hidden="true" className="size-5 text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle>{strings.locations.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{strings.locations.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="h-13 text-base font-semibold"
              onClick={() => setDeleteTarget(null)}
            >
              {strings.common.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="h-13 text-base font-semibold"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget);
              }}
            >
              {deleteMutation.isPending ? strings.common.deleting : strings.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete blocked — location used by paintings (409 LOCATION_IN_USE) */}
      <AlertDialog
        open={blocked !== null}
        onOpenChange={(open) => { if (!open) setBlocked(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <TriangleAlertIcon aria-hidden="true" className="size-5 text-warning" />
            </AlertDialogMedia>
            <AlertDialogTitle>{strings.locations.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{blockedMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              className="h-13 text-base font-semibold"
              onClick={() => setBlocked(null)}
            >
              {strings.common.ok}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
