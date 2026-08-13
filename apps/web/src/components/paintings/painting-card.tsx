/**
 * Painting list card (ui-design §2.2) — the whole card is ONE tap target
 * (≥120px tall, focus ring on the link): thumbnail 96×96, name 20px/700,
 * price 20px/600 with currency, location badge + value.
 */
import { Link } from 'react-router-dom';
import type { PaintingListItemDto } from '@painting/shared';

import { AuthedImage } from '@/components/paintings/authed-image';
import { LocationValue } from '@/components/paintings/location-view';
import { formatPriceMinor } from '@/lib/money';
import { paintingDetailPath } from '@/routes';
import { format } from '@/strings';

export function PaintingCard({ painting }: { painting: PaintingListItemDto }) {
  return (
    <Link
      to={paintingDetailPath(painting.id)}
      className="flex items-center gap-4 rounded-2xl border border-border-subtle bg-card p-3 transition-colors hover:border-border focus-visible:border-ring active:bg-[#FAF6EF]"
    >
      <AuthedImage
        photo={painting.firstPhoto}
        alt={format.photoAlt(painting.name)}
        className="h-24 w-24 shrink-0 rounded-xl"
      />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-lg font-bold leading-snug">{painting.name}</h3>
        <p className="mt-0.5 text-lg font-semibold leading-snug tabular-nums">
          {formatPriceMinor(painting.price_minor, painting.currency)}
        </p>
        <div className="mt-1.5">
          <LocationValue
            kind={painting.location.kind}
            value={painting.location.value}
            className="gap-2"
          />
        </div>
      </div>
    </Link>
  );
}

/** Loading placeholder — three muted card blocks, no shimmer (a11y §4.5). */
export function PaintingCardSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border-subtle bg-card p-3">
      <div className="h-24 w-24 shrink-0 rounded-xl bg-muted" />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="h-5 w-3/4 rounded bg-muted" />
        <div className="h-5 w-1/3 rounded bg-muted" />
        <div className="h-4 w-2/3 rounded bg-muted" />
      </div>
    </div>
  );
}
