/**
 * AuthedImage — renders a photo whose bytes come from an authed stream URL.
 *
 * The contract serves photos at paths requiring the X-Telegram-Init-Data
 * header (packages/shared PhotoDto.url), which a plain <img> cannot send. This
 * component fetches the bytes through the api wrapper and renders a blob URL.
 *
 * Caching: photos are immutable (Cache-Control: private, immutable) and few
 * (≤10 per painting), so the blob URL is cached forever per photo id — no
 * revocation, no refetch on re-mount. Bounded by the owner's catalog size.
 */
import { useQuery } from '@tanstack/react-query';
import { ImageIcon, Loader2Icon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { PhotoDto } from '@painting/shared';

interface AuthedImageProps {
  /** The photo to show; null renders the empty placeholder. */
  photo: PhotoDto | null;
  /** Accessible name for the image — always Russian («Фото картины «…»»). */
  alt: string;
  /** Sizing classes (width/height/radius). object-cover is always applied. */
  className?: string;
  /** Text under the placeholder icon (e.g. «Нет фотографий»). */
  placeholderLabel?: string;
}

function fetchPhotoBlobUrl(photo: PhotoDto): Promise<string> {
  return api.getBlob(photo.url).then((blob) => URL.createObjectURL(blob));
}

export function AuthedImage({ photo, alt, className, placeholderLabel }: AuthedImageProps) {
  const query = useQuery({
    queryKey: ['photo-blob', photo?.id ?? 'none'],
    queryFn: () => fetchPhotoBlobUrl(photo as PhotoDto),
    enabled: photo !== null,
    staleTime: Infinity,
    gcTime: Infinity,
    // The screen renders its own placeholder on failure — no global toast.
    meta: { suppressErrorToast: true },
  });

  if (photo !== null && query.isSuccess && query.data) {
    return (
      <img
        src={query.data}
        alt={alt}
        className={cn('object-cover', className)}
        loading="lazy"
      />
    );
  }

  const loading = photo !== null && query.isPending;
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex flex-col items-center justify-center gap-1 bg-muted text-muted-foreground',
        className,
      )}
    >
      {loading ? (
        <Loader2Icon className="size-6" />
      ) : (
        <>
          <ImageIcon className="size-6" />
          {placeholderLabel ? (
            <span className="px-2 text-center text-sm leading-snug">{placeholderLabel}</span>
          ) : null}
        </>
      )}
    </div>
  );
}
