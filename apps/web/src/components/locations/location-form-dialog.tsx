/**
 * LocationFormDialog — «Новое место» / «Изменить место» (ui-design §2.7/§3.6):
 * kind choice as two large toggle cards («Офлайн (адрес)» / «Онлайн (сайт)»),
 * a large value field (address free text or http(s) URL), and «Сохранить».
 * Validation is Russian (strings module; http/https via isHttpUrl — same rule
 * as the painting form's inline add, locations spec). Server 400 fieldErrors
 * map inline; other server errors show a banner and the dialog stays open —
 * entered data is never lost (ux-design principle 6).
 * Success → toast + invalidate ['locations'], so the list here and the bank
 * dialog in the painting form both refresh.
 */
import { RadioGroup } from '@base-ui/react/radio-group';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  API_PATHS,
  type LocationCreateRequestDto,
  type LocationDto,
  type LocationKind,
  type LocationUpdateRequestDto,
} from '@painting/shared';
import { toast } from 'sonner';
import { z } from 'zod';

import { ErrorState } from '@/components/paintings/error-state';
import { FieldError } from '@/components/paintings/field-error';
import { RadioOption } from '@/components/paintings/radio-option';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiErrorMessage, ApiError } from '@/lib/api';
import { apiFieldErrorMessage } from '@/lib/form';
import { isHttpUrl } from '@/lib/validation';
import { strings } from '@/strings';

const locationFormSchema = z
  .object({
    kind: z.enum(['offline', 'online']),
    value: z.string().trim().min(1, strings.location.addressRequired),
  })
  .superRefine((data, ctx) => {
    if (data.kind === 'online' && !isHttpUrl(data.value)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: strings.location.urlInvalid });
    }
  });

type LocationFormValues = z.infer<typeof locationFormSchema>;

export interface LocationFormDialogProps {
  mode: 'create' | 'edit';
  /** Required in edit mode — the location being changed. */
  location?: LocationDto;
  onClose: () => void;
}

export function LocationFormDialog({ mode, location, onClose }: LocationFormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = mode === 'edit' && location !== undefined;

  // Mounted fresh per open (parent conditionally renders), so useState is safe.
  const [kind, setKind] = useState<LocationKind>(location?.kind ?? 'offline');
  const [value, setValue] = useState(location?.value ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isOnline = kind === 'online';

  const handleSubmit = async () => {
    const parsed = locationFormSchema.safeParse({ kind, value });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? strings.common.generic);
      return;
    }
    const values = parsed.data as LocationFormValues;
    const body: LocationCreateRequestDto = { kind: values.kind, value: values.value.trim() };

    setSubmitting(true);
    setSubmitError(null);
    setError(null);
    try {
      if (isEdit && location) {
        await api.patch<LocationDto>(
          API_PATHS.location(location.id),
          body satisfies LocationUpdateRequestDto,
        );
      } else {
        await api.post<LocationDto>(API_PATHS.locations, body);
      }
      toast.success(isEdit ? strings.locations.updated : strings.locations.added);
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        const valueErr = apiFieldErrorMessage(err.fieldErrors, 'value');
        const kindErr = apiFieldErrorMessage(err.fieldErrors, 'kind');
        setError(valueErr ?? kindErr ?? null);
      } else {
        setSubmitError(apiErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? strings.locations.edit : strings.locations.new}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {submitError && <ErrorState message={submitError} variant="banner" />}

          <RadioGroup
            value={kind}
            onValueChange={(v) => {
              setKind(v as LocationKind);
              setError(null);
            }}
            className="grid grid-cols-2 gap-2"
          >
            <RadioOption
              value="offline"
              className="min-h-16 px-2"
              selectedClassName="border-2 border-primary bg-primary text-primary-foreground"
              unselectedClassName="border-2 border-border bg-card text-foreground"
            >
              {strings.location.kindOfflinePick}
            </RadioOption>
            <RadioOption
              value="online"
              className="min-h-16 px-2"
              selectedClassName="border-2 border-primary bg-primary text-primary-foreground"
              unselectedClassName="border-2 border-border bg-card text-foreground"
            >
              {strings.location.kindOnlinePick}
            </RadioOption>
          </RadioGroup>

          <div className="space-y-2">
            <Label htmlFor="location-value" className="text-base font-semibold">
              {isOnline ? strings.location.site : strings.location.address}
            </Label>
            <Input
              id="location-value"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              autoComplete="off"
              inputMode={isOnline ? 'url' : undefined}
              placeholder={isOnline ? strings.location.sitePlaceholder : strings.location.addressPlaceholder}
              className="h-13 text-lg"
              aria-invalid={!!error}
              aria-describedby={error ? 'location-value-error' : undefined}
            />
            <FieldError id="location-value-error" message={error ?? undefined} />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-13 text-base font-semibold"
            onClick={onClose}
          >
            {strings.common.cancel}
          </Button>
          <Button
            type="button"
            className="h-13 text-base font-semibold"
            disabled={submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? strings.common.saving : strings.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
