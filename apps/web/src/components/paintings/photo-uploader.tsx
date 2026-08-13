/**
 * PhotoUploader — «Фото» form section (ui-design §3.3, paintings spec §4.5):
 * multi-file picker (hidden input for real file semantics), preview grid with
 * per-photo ✕ remove (48px targets), client-side validation driven by the
 * PHOTO_UPLOAD contract constants (max 10 files, ≤10MB, image/*) with the
 * contract's own Russian error messages, and the Russian counter/hint.
 */
import { useQueryClient } from '@tanstack/react-query';
import { PlusIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  PHOTO_UPLOAD,
  type PhotoDto,
} from '@painting/shared';

import { AuthedImage } from '@/components/paintings/authed-image';
import { FieldError } from '@/components/paintings/field-error';
import { formatMegabytes } from '@/lib/money';
import { apiErrorMessages, format, strings } from '@/strings';
import { cn } from '@/lib/utils';

interface PhotoUploaderProps {
  existingPhotos: PhotoDto[];
  newFiles: File[];
  onNewFilesChange: (files: File[]) => void;
  onRemoveExisting: (photoId: string) => void;
  /** Failed-upload message from the server (shown inline, submit still works). */
  uploadError?: string | null;
}

export function PhotoUploader({
  existingPhotos,
  newFiles,
  onNewFilesChange,
  onRemoveExisting,
  uploadError,
}: PhotoUploaderProps) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  // Object URLs for local previews — revoked on change/unmount (no leaks).
  const [fileUrls, setFileUrls] = useState<string[]>([]);
  useEffect(() => {
    const urls = newFiles.map((file) => URL.createObjectURL(file));
    setFileUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [newFiles]);

  // Cache photo blob URLs so removed-then-re-added photos render instantly.
  const invalidatePhotos = () => {
    void queryClient.invalidateQueries({ queryKey: ['photo-blob'] });
  };

  const total = existingPhotos.length + newFiles.length;
  const full = total >= PHOTO_UPLOAD.maxFilesPerPainting;
  const sectionId = 'photo-uploader';
  const errorId = 'photo-uploader-error';
  const visibleError = pickError ?? uploadError ?? null;

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const chosen = Array.from(fileList);
    const valid: File[] = [];
    let violation: string | null = null;

    for (const file of chosen) {
      if (existingPhotos.length + newFiles.length + valid.length >= PHOTO_UPLOAD.maxFilesPerPainting) {
        violation = apiErrorMessages.PHOTO_LIMIT_EXCEEDED;
        break;
      }
      // `some` instead of `includes` — the contract tuple is a literal union,
      // while file.type is a free string; equality comparison is type-safe
      // without widening the contract constant.
      if (!PHOTO_UPLOAD.allowedMimeTypes.some((mime) => mime === file.type)) {
        violation = apiErrorMessages.PHOTO_TYPE_INVALID;
        break;
      }
      if (file.size > PHOTO_UPLOAD.maxSizeBytes) {
        violation = apiErrorMessages.PHOTO_TOO_LARGE;
        break;
      }
      valid.push(file);
    }

    if (valid.length > 0) {
      onNewFilesChange([...newFiles, ...valid]);
    }
    setPickError(violation);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div
      role="group"
      aria-labelledby={sectionId}
      aria-describedby={visibleError ? errorId : undefined}
      className="space-y-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={sectionId} className="text-base font-semibold">
          {strings.form.photos}
        </h2>
        <p className="text-base text-muted-foreground tabular-nums">
          {format.formPhotosCountOf(total, PHOTO_UPLOAD.maxFilesPerPainting)}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {existingPhotos.map((photo) => (
          <div key={photo.id} className="relative h-24 w-24">
            <AuthedImage photo={photo} alt="" className="h-full w-full rounded-xl" />
            <button
              type="button"
              aria-label={strings.form.photosRemove}
              onClick={() => {
                onRemoveExisting(photo.id);
                invalidatePhotos();
              }}
              className="absolute -right-2 -top-2 flex size-12 items-center justify-center rounded-full border border-border-subtle bg-[#FFFFFF] text-foreground shadow-sm"
            >
              <XIcon aria-hidden="true" className="size-5" />
            </button>
          </div>
        ))}

        {newFiles.map((file, i) => (
          <div key={`${file.name}-${i}`} className="relative h-24 w-24">
            { }
            <img
              src={fileUrls[i]}
              alt=""
              className="h-full w-full rounded-xl object-cover"
            />
            <button
              type="button"
              aria-label={strings.form.photosRemove}
              onClick={() => onNewFilesChange(newFiles.filter((f) => f !== file))}
              className="absolute -right-2 -top-2 flex size-12 items-center justify-center rounded-full border border-border-subtle bg-[#FFFFFF] text-foreground shadow-sm"
            >
              <XIcon aria-hidden="true" className="size-5" />
            </button>
          </div>
        ))}

        {!full && (
          <button
            type="button"
            aria-label={strings.form.photosAddAria}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'flex h-24 w-24 items-center justify-center rounded-xl border-2 border-dashed bg-transparent',
              visibleError ? 'border-destructive' : 'border-border',
            )}
          >
            <PlusIcon aria-hidden="true" className="size-8 text-muted-foreground" />
          </button>
        )}
      </div>

      <p className="text-base leading-relaxed text-muted-foreground">
        {format.photosHint(PHOTO_UPLOAD.maxFilesPerPainting, formatMegabytes(PHOTO_UPLOAD.maxSizeBytes))}
      </p>

      <FieldError id={errorId} message={visibleError ?? undefined} />

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={PHOTO_UPLOAD.allowedMimeTypes.join(',')}
        onChange={(e) => handleFiles(e.target.files)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
