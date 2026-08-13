/**
 * Painting photo gallery (ux-design §2.2, ui-design §2.6).
 * One large photo at a time with explicit text «←»/«→» buttons (≥48px — the
 * Boomer must not need to know swipe), a thumbnail strip (selected = ring +
 * position, not color alone) and the Russian counter «Фото {n} из {m}».
 */
import { useState } from 'react';
import type { PhotoDto } from '@painting/shared';

import { AuthedImage } from '@/components/paintings/authed-image';
import { cn } from '@/lib/utils';
import { format, strings } from '@/strings';

interface PhotoGalleryProps {
  photos: PhotoDto[];
  /** Painting name — used for the Russian alt text. */
  paintingName: string;
}

export function PhotoGallery({ photos, paintingName }: PhotoGalleryProps) {
  const [current, setCurrent] = useState(0);
  const total = photos.length;

  if (total === 0) {
    return (
      <AuthedImage
        photo={null}
        alt={format.photoAlt(paintingName)}
        className="aspect-[4/3] w-full rounded-2xl"
        placeholderLabel={strings.gallery.noPhotos}
      />
    );
  }

  // Keep the index valid when the photo list changes (e.g. after an edit).
  const index = Math.min(current, total - 1);
  const alt = format.photoAlt(paintingName);

  return (
    <div className="flex flex-col gap-3">
      <AuthedImage
        photo={photos[index]}
        alt={alt}
        className="aspect-[4/3] w-full rounded-2xl"
        placeholderLabel={strings.gallery.noPhotos}
      />

      {/* Thumbnail strip — horizontal scroll, 76×76 targets, ring on selected. */}
      <div aria-label={strings.form.photos} className="flex gap-2 overflow-x-auto pb-1">
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            type="button"
            aria-current={i === index}
            aria-label={`${alt}, ${format.photosCount(i + 1, total)}`}
            onClick={() => setCurrent(i)}
            className={cn(
              'relative h-19 w-19 shrink-0 overflow-hidden rounded-xl border-2',
              i === index ? 'border-primary' : 'border-transparent',
            )}
          >
            <AuthedImage photo={photo} alt="" className="h-full w-full rounded-[10px]" />
          </button>
        ))}
      </div>

      {/* Explicit prev/next + counter. */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label={strings.gallery.prevPhoto}
          disabled={index === 0}
          onClick={() => setCurrent(index - 1)}
          className="flex h-13 min-w-13 items-center justify-center rounded-xl border-2 border-border bg-card px-3 text-xl font-bold text-foreground disabled:opacity-40"
        >
          ←
        </button>
        <p className="text-center text-lg leading-relaxed text-muted-foreground" aria-live="polite">
          {format.photosCount(index + 1, total)}
        </p>
        <button
          type="button"
          aria-label={strings.gallery.nextPhoto}
          disabled={index === total - 1}
          onClick={() => setCurrent(index + 1)}
          className="flex h-13 min-w-13 items-center justify-center rounded-xl border-2 border-border bg-card px-3 text-xl font-bold text-foreground disabled:opacity-40"
        >
          →
        </button>
      </div>
    </div>
  );
}
