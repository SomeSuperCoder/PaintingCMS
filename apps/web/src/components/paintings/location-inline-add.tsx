/**
 * LocationInlineAdd — «Добавить новое место» sub-form (locations spec):
 * offline (address text) or online (http(s) URL), validated locally with
 * Russian messages before committing to the parent form.
 */
import { RadioGroup } from '@base-ui/react/radio-group';
import { useState } from 'react';
import type { LocationKind } from '@painting/shared';
import { z } from 'zod';

import { FieldError } from '@/components/paintings/field-error';
import { RadioOption } from '@/components/paintings/radio-option';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { strings } from '@/strings';
import { isHttpUrl } from '@/lib/validation';

const inlineSchema = z
  .object({
    kind: z.enum(['offline', 'online']),
    value: z.string().trim().min(1, strings.location.addressRequired),
  })
  .superRefine((data, ctx) => {
    if (data.kind === 'online' && !isHttpUrl(data.value)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: strings.location.urlInvalid });
    }
  });

type InlineValues = z.infer<typeof inlineSchema>;

export interface LocationInlineAddProps {
  onDone: (selection: { kind: LocationKind; value: string }) => void;
  onCancel: () => void;
}

export function LocationInlineAdd({ onDone, onCancel }: LocationInlineAddProps) {
  const [kind, setKind] = useState<LocationKind>('offline');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isOnline = kind === 'online';

  const handleSubmit = () => {
    const parsed = inlineSchema.safeParse({ kind, value });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? strings.form.locationRequired);
      return;
    }
    const values = parsed.data as InlineValues;
    onDone({ kind: values.kind, value: values.value.trim() });
  };

  return (
    <div className="space-y-4">
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
          className="h-16 px-3"
          selectedClassName="border-2 border-primary bg-primary text-primary-foreground"
          unselectedClassName="border-2 border-border bg-card text-foreground"
        >
          {strings.location.kindOfflinePick}
        </RadioOption>
        <RadioOption
          value="online"
          className="h-16 px-3"
          selectedClassName="border-2 border-primary bg-primary text-primary-foreground"
          unselectedClassName="border-2 border-border bg-card text-foreground"
        >
          {strings.location.kindOnlinePick}
        </RadioOption>
      </RadioGroup>

      <div className="space-y-2">
        <Label htmlFor="new-location-value" className="text-base font-semibold">
          {isOnline ? strings.location.site : strings.location.address}
        </Label>
        <Input
          id="new-location-value"
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
          aria-describedby={error ? 'new-location-error' : undefined}
        />
        <FieldError id="new-location-error" message={error ?? undefined} />
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-13 flex-1 text-base font-semibold"
          onClick={onCancel}
        >
          {strings.common.cancel}
        </Button>
        <Button
          type="button"
          className="h-13 flex-1 text-base font-semibold"
          onClick={handleSubmit}
        >
          {strings.location.done}
        </Button>
      </div>
    </div>
  );
}
