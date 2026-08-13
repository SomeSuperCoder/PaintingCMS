/**
 * Painting detail page — route «/paintings/:id» (ui-design §2.3-2.5).
 * Photo gallery, price (ru-RU formatted from minor units), location card with
 * «Открыть сайт» for online sales, and the sticky edit/delete bottom bar.
 * Delete is confirmed in a Russian AlertDialog (danger above cancel — DOM
 * order [Cancel, Action] in the flex-col-reverse footer); the mutation toasts
 * its own outcome since the global mutation cache has no onError.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLinkIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { API_PATHS, type PaintingDto } from '@painting/shared';

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
import { BottomActionBar } from '@/components/paintings/bottom-action-bar';
import { ErrorState } from '@/components/paintings/error-state';
import { LocationKindBadge } from '@/components/paintings/location-view';
import { PhotoGallery } from '@/components/paintings/photo-gallery';
import { ScreenHeader } from '@/components/paintings/screen-header';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatPriceMinor } from '@/lib/money';
import { paintingEditPath, ROUTES } from '@/routes';
import { format, strings } from '@/strings';

export function PaintingDetailPage() {
  const { id } = useParams();
  const paintingId = id ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: painting, isPending, isError, refetch } = useQuery({
    queryKey: ['painting', paintingId],
    queryFn: () => api.get<PaintingDto>(API_PATHS.painting(paintingId)),
    enabled: paintingId.length > 0,
    meta: { suppressErrorToast: true },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete<void>(API_PATHS.painting(paintingId)),
    onSuccess: () => {
      toast.success(strings.painting.deleted);
      queryClient.invalidateQueries({ queryKey: ['paintings'] });
      setConfirmOpen(false);
      navigate(ROUTES.home);
    },
    onError: () => {
      toast.error(strings.painting.deleteFailed);
      setConfirmOpen(false);
    },
  });

  if (isPending) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
        <ScreenHeader title={strings.common.loading} onBack={() => navigate(ROUTES.home)} />
        <div className="space-y-6 px-5">
          <div className="aspect-[4/3] w-full rounded-2xl bg-muted" />
          <div className="h-7 w-1/3 rounded bg-muted" />
          <div className="h-18 rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  if (isError || !painting) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
        <ScreenHeader title={strings.painting.title} onBack={() => navigate(ROUTES.home)} />
        <div className="px-5">
          <ErrorState message={strings.common.loadFailed} onRetry={() => void refetch()} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <ScreenHeader title={painting.name} onBack={() => navigate(ROUTES.home)} />

      <main className="flex-1 space-y-6 px-5 pb-40">
        <PhotoGallery photos={painting.photos} paintingName={painting.name} />

        <section aria-labelledby="detail-price" className="space-y-1">
          <h2 id="detail-price" className="text-base font-semibold">
            {strings.form.price}
          </h2>
          <p className="text-2xl font-bold leading-tight tabular-nums">
            {formatPriceMinor(painting.price_minor, painting.currency)}
          </p>
        </section>

        <section aria-labelledby="detail-location" className="space-y-2">
          <h2 id="detail-location" className="text-base font-semibold">
            {strings.form.location}
          </h2>
          <div className="rounded-xl border border-border-subtle bg-card p-4">
            <div className="flex items-start gap-3">
              <LocationKindBadge kind={painting.location.kind} />
              <p className="min-w-0 flex-1 break-words text-lg leading-relaxed">
                {painting.location.value}
              </p>
            </div>
            {painting.location.kind === 'online' && (
              <a
                href={painting.location.value}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex h-13 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-base font-semibold transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <ExternalLinkIcon aria-hidden="true" className="size-4" />
                {strings.painting.openSite}
              </a>
            )}
          </div>
        </section>
      </main>

      <BottomActionBar>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="h-13 flex-1 text-base font-semibold"
            onClick={() => navigate(paintingEditPath(painting.id))}
          >
            <PencilIcon aria-hidden="true" className="size-4" />
            {strings.painting.edit}
          </Button>
          <Button
            variant="destructive"
            className="h-13 flex-1 text-base font-semibold"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2Icon aria-hidden="true" className="size-4" />
            {strings.painting.delete}
          </Button>
        </div>
      </BottomActionBar>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon aria-hidden="true" className="size-5 text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle>{format.deletePaintingTitle(painting.name)}</AlertDialogTitle>
            <AlertDialogDescription>{strings.painting.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="h-13 text-base font-semibold"
              onClick={() => setConfirmOpen(false)}
            >
              {strings.common.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="h-13 text-base font-semibold"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? strings.common.deleting : strings.painting.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
