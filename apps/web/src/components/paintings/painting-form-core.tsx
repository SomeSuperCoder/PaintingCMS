/**
 * PaintingFormCore — shared create/edit form body (ui-design §3, paintings
 * spec §4): name, price (big numeric input + currency segment), location
 * (picker / inline add / bank dialog) and photos (uploader with previews).
 *
 * Submit orchestration: save painting (POST/PATCH with locationId or
 * newLocation) → DELETE removed photos → multipart upload new files →
 * toast + navigate to the detail. Server field errors map back into the
 * matching RHF fields with Russian messages; photo failures after a saved
 * painting surface as an inline upload error instead of a blocking banner.
 */
import { RadioGroup } from '@base-ui/react/radio-group';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  API_PATHS,
  PHOTO_UPLOAD,
  type Currency,
  type PaintingCreateRequestDto,
  type PaintingDto,
  type PaintingUpdateRequestDto,
  type PhotoUploadResultDto,
} from '@painting/shared';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { BottomActionBar } from '@/components/paintings/bottom-action-bar';
import { ErrorState } from '@/components/paintings/error-state';
import { FieldError } from '@/components/paintings/field-error';
import {
  LocationPicker,
} from '@/components/paintings/location-picker';
import { PhotoUploader } from '@/components/paintings/photo-uploader';
import { RadioOption } from '@/components/paintings/radio-option';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { api, apiErrorMessage, ApiError } from '@/lib/api';
import { useCreateZodForm, fieldErrorMessage, apiFieldErrorMessage } from '@/lib/form';
import { minorToInput, parsePriceToMinor } from '@/lib/money';
import { paintingDetailPath } from '@/routes';
import { strings } from '@/strings';
import { isHttpUrl } from '@/lib/validation';

/* ── Schema (zod v4; Russian messages; input === output for the resolver) ── */

function priceSuperRefine(value: string, ctx: z.RefinementCtx) {
  const minor = parsePriceToMinor(value);
  if (minor === null) {
    ctx.addIssue({ code: 'custom', message: strings.form.priceInvalid });
    return;
  }
  if (minor < 0) {
    ctx.addIssue({ code: 'custom', message: strings.form.priceNegative });
  }
}

const locationSelectionSchema = z.union([
  z.object({
    type: z.literal('existing'),
    location: z.object({
      id: z.string().min(1),
      kind: z.enum(['offline', 'online']),
      value: z.string().min(1),
    }),
  }),
  z
    .object({
      type: z.literal('new'),
      kind: z.enum(['offline', 'online']),
      value: z.string().trim().min(1, strings.location.addressRequired),
    })
    .superRefine((data, ctx) => {
      if (data.kind === 'online' && !isHttpUrl(data.value)) {
        ctx.addIssue({ code: 'custom', path: ['value'], message: strings.location.urlInvalid });
      }
    }),
]);

const paintingFormSchema = z.object({
  name: z.string().trim().min(1, strings.form.nameRequired),
  priceInput: z.string().superRefine(priceSuperRefine),
  currency: z.enum(['rub', 'usd', 'eur']),
  location: locationSelectionSchema
    .nullable()
    // superRefine (not refine) so the output stays nullable — the form's
    // initial state has no selection yet and RHF must accept null there.
    // TS 5.5 infers a type predicate from `v !== null` in refine, which would
    // narrow the output to non-null and break the input === output contract.
    .superRefine((v, ctx) => {
      if (v === null) {
        ctx.addIssue({ code: 'custom', message: strings.form.locationRequired });
      }
    }),
});

type PaintingFormValues = z.infer<typeof paintingFormSchema>;

const currencyOptions: Currency[] = ['rub', 'usd', 'eur'];
const currencyLabel: Record<Currency, string> = {
  rub: strings.form.currencyRUB,
  usd: strings.form.currencyUSD,
  eur: strings.form.currencyEUR,
};

/** Pull the root «choose a location» error out of the RHF union error shape. */
function locationRootError(errors: { location?: unknown }): string | undefined {
  const loc = errors.location;
  if (!loc || typeof loc === 'string') return undefined;
  const root = (loc as { message?: string }).message;
  return root || undefined;
}

/** Pull the nested value error (bad address/URL) out of the error shape. */
function nestedLocationError(errors: { location?: unknown }): string | undefined {
  const loc = errors.location;
  if (!loc || typeof loc === 'string') return undefined;
  return (loc as { value?: { message?: string } }).value?.message;
}

/* ── Component ──────────────────────────────────────────────────────────── */

export interface PaintingFormCoreProps {
  mode: 'create' | 'edit';
  /** Required in edit mode — the loaded painting (parents mount only when ready). */
  painting?: PaintingDto;
}

export function PaintingFormCore({ mode, painting }: PaintingFormCoreProps) {
  const isEdit = mode === 'edit' && painting !== undefined;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const defaultValues: PaintingFormValues =
    isEdit && painting
      ? {
          name: painting.name,
          priceInput: minorToInput(painting.price_minor),
          currency: painting.currency,
          location: {
            type: 'existing',
            location: {
              id: painting.location.id,
              kind: painting.location.kind,
              value: painting.location.value,
            },
          },
        }
      : { name: '', priceInput: '', currency: 'rub', location: null };

  const form = useCreateZodForm<PaintingFormValues>(paintingFormSchema, { defaultValues });
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    watch,
    formState: { errors, isSubmitting },
  } = form;

  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);

  const visibleExistingPhotos =
    isEdit && painting ? painting.photos.filter((p) => !removedPhotoIds.includes(p.id)) : [];

  const onSubmit = async (values: PaintingFormValues) => {
    setSubmitError(null);
    setPhotoUploadError(null);

    const body: PaintingCreateRequestDto = {
      name: values.name.trim(),
      price_minor: parsePriceToMinor(values.priceInput) ?? 0,
      currency: values.currency,
    };
    const location = values.location;
    // Unreachable: the schema requires a selection before submit (the resolver
    // blocks invalid values), but the field type is nullable — the form starts
    // with no selection. Guard keeps the flow honest with that type.
    if (location === null) return;
    if (location.type === 'existing') {
      body.locationId = location.location.id;
    } else {
      body.newLocation = { kind: location.kind, value: location.value };
    }

    let paintingSaved = false;
    try {
      const saved =
        isEdit && painting
          ? await api.patch<PaintingDto>(
              API_PATHS.painting(painting.id),
              body satisfies PaintingUpdateRequestDto,
            )
          : await api.post<PaintingDto>(API_PATHS.paintings, body);
      paintingSaved = true;

      if (isEdit && removedPhotoIds.length > 0) {
        await Promise.all(
          removedPhotoIds.map((photoId) => api.delete<void>(API_PATHS.photo(photoId))),
        );
      }

      if (newFiles.length > 0) {
        const formData = new FormData();
        newFiles.forEach((file) => formData.append(PHOTO_UPLOAD.fieldName, file));
        await api.post<PhotoUploadResultDto>(API_PATHS.paintingPhotos(saved.id), formData);
      }

      // Invalidate the cached lists so the change shows immediately after
      // back-navigation — the global staleTime is 60s, so without this the
      // user would keep seeing the pre-mutation data for a minute. Mirrors
      // the delete pattern in painting-detail.tsx. An inline location create
      // also changes the locations list, so that cache is invalidated too.
      queryClient.invalidateQueries({ queryKey: ['paintings'] });
      queryClient.invalidateQueries({ queryKey: ['painting', saved.id] });
      if (location.type === 'new') {
        queryClient.invalidateQueries({ queryKey: ['locations'] });
      }

      toast.success(isEdit ? strings.form.updated : strings.form.saved);
      navigate(paintingDetailPath(saved.id));
    } catch (error) {
      if (paintingSaved) {
        // The painting itself is fine — the photo step failed; stay on the
        // form so the user can retry just the upload.
        setPhotoUploadError(apiErrorMessage(error));
      } else if (error instanceof ApiError && error.fieldErrors) {
        const fe = error.fieldErrors;
        const nameErr = apiFieldErrorMessage(fe, 'name');
        const priceErr = apiFieldErrorMessage(fe, 'price_minor');
        const currErr = apiFieldErrorMessage(fe, 'currency');
        const locErr =
          apiFieldErrorMessage(fe, 'locationId') ??
          apiFieldErrorMessage(fe, 'newLocation') ??
          apiFieldErrorMessage(fe, 'location');
        if (nameErr) setError('name', { message: nameErr });
        if (priceErr) setError('priceInput', { message: priceErr });
        if (currErr) setError('currency', { message: currErr });
        if (locErr) setError('location', { message: locErr });
      } else {
        setSubmitError(apiErrorMessage(error));
      }
    }
  };

  const submitLabel = isSubmitting
    ? strings.common.saving
    : isEdit
      ? strings.form.save
      : strings.home.add;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col"
    >
      <div className="flex-1 space-y-8 px-5 pb-40">
        {submitError && <ErrorState message={submitError} variant="banner" />}

        <div className="space-y-2">
          <Label htmlFor="painting-name" className="text-base font-semibold">
            {strings.form.name}
          </Label>
          <Input
            id="painting-name"
            {...register('name')}
            placeholder={strings.form.namePlaceholder}
            className="h-13 text-lg"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'name-error' : undefined}
          />
          <FieldError id="name-error" message={fieldErrorMessage(errors, 'name')} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="painting-price" className="text-base font-semibold">
            {strings.form.price}
          </Label>
          <Input
            id="painting-price"
            {...register('priceInput')}
            inputMode="decimal"
            placeholder={strings.form.pricePlaceholder}
            className="h-13 text-lg tabular-nums"
            aria-invalid={!!errors.priceInput}
            aria-describedby={errors.priceInput ? 'price-error' : undefined}
          />
          <RadioGroup
            value={watch('currency')}
            onValueChange={(v) => {
              setValue('currency', v as Currency, { shouldValidate: true, shouldDirty: true });
              clearErrors('currency');
            }}
            className="grid grid-cols-3 gap-2"
          >
            {currencyOptions.map((c) => (
              <RadioOption
                key={c}
                value={c}
                className="h-13 px-2"
                selectedClassName="border-2 border-primary bg-primary text-primary-foreground"
                unselectedClassName="border-2 border-border bg-card text-foreground"
              >
                {currencyLabel[c]}
              </RadioOption>
            ))}
          </RadioGroup>
          <FieldError id="price-error" message={fieldErrorMessage(errors, 'priceInput')} />
          <FieldError
            id="currency-error"
            message={fieldErrorMessage(errors, 'currency')}
          />
        </div>

        <LocationPicker
          value={watch('location')}
          onChange={(v) => {
            setValue('location', v, { shouldValidate: true, shouldDirty: true });
            clearErrors('location');
          }}
          error={locationRootError(errors)}
          nestedError={nestedLocationError(errors)}
          onInteract={() => clearErrors('location')}
        />

        <PhotoUploader
          existingPhotos={visibleExistingPhotos}
          newFiles={newFiles}
          onNewFilesChange={setNewFiles}
          onRemoveExisting={(photoId) => setRemovedPhotoIds((ids) => [...ids, photoId])}
          uploadError={photoUploadError}
        />
      </div>

      <BottomActionBar>
        <Button type="submit" className="h-13 w-full text-lg font-bold" disabled={isSubmitting}>
          {submitLabel}
        </Button>
      </BottomActionBar>
    </form>
  );
}
