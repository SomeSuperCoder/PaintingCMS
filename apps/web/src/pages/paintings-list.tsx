/**
 * Paintings list page — route «/» (ui-design §2.1).
 * Cards in gallery order (newest first), loading skeletons without shimmer,
 * inline error + retry, friendly empty state with a CTA, and the sticky
 * «+ Добавить картину» bottom bar. Footer links to the locations and owner
 * screens (built in the next wave).
 */
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { API_PATHS, type PaintingListItemDto } from '@painting/shared';

import { BottomActionBar } from '@/components/paintings/bottom-action-bar';
import { ErrorState } from '@/components/paintings/error-state';
import { PaintingCard, PaintingCardSkeleton } from '@/components/paintings/painting-card';
import { ScreenHeader } from '@/components/paintings/screen-header';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { ROUTES } from '@/routes';
import { strings } from '@/strings';

export function PaintingsListPage() {
  const { data: paintings, isPending, isError, refetch } = useQuery({
    queryKey: ['paintings'],
    queryFn: () => api.get<PaintingListItemDto[]>(API_PATHS.paintings),
    meta: { suppressErrorToast: true },
  });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <ScreenHeader title={strings.home.title} />

      <main className="flex-1 px-5 pb-40">
        {isPending ? (
          <div className="space-y-3">
            <PaintingCardSkeleton />
            <PaintingCardSkeleton />
            <PaintingCardSkeleton />
          </div>
        ) : isError || !paintings ? (
          <ErrorState message={strings.common.loadFailed} onRetry={() => void refetch()} />
        ) : paintings.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <p className="text-xl font-bold leading-snug">{strings.home.empty}</p>
            <p className="text-lg leading-relaxed text-muted-foreground">{strings.home.emptyHint}</p>
            <Button render={<Link to={ROUTES.paintingNew} />} className="h-13 text-lg font-bold">
              {strings.home.addFirst}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {paintings.map((painting) => (
              <PaintingCard key={painting.id} painting={painting} />
            ))}
          </div>
        )}

        <footer className="mt-10 flex flex-col items-center gap-2 border-t border-border-subtle pt-5 text-center">
          <Link
            to={ROUTES.locations}
            className="text-base font-semibold text-foreground underline-offset-4 hover:underline focus-visible:underline"
          >
            {strings.home.footerLocations}
          </Link>
          <Link
            to={ROUTES.owner}
            className="text-base font-semibold text-foreground underline-offset-4 hover:underline focus-visible:underline"
          >
            {strings.home.footerOwner}
          </Link>
        </footer>
      </main>

      <BottomActionBar>
        <Button render={<Link to={ROUTES.paintingNew} />} className="h-13 w-full text-lg font-bold">
          <PlusIcon aria-hidden="true" className="size-5" />
          {strings.home.add}
        </Button>
      </BottomActionBar>
    </div>
  );
}
