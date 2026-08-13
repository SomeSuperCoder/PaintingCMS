/**
 * LocationPicker — the «Где продаётся» form section (ui-design §3.2).
 * Two equal-size option cards: «Выбрать место» (opens LocationsBankDialog) or
 * «Добавить новое место» (inline sub-form). The chosen value renders as a
 * card with badge + value + «Изменить». Field errors (root + nested value)
 * are rendered inline with ⚠ and linked via aria-describedby.
 */
import { MapPinIcon, PencilIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import type { LocationDto, LocationKind, LocationSummaryDto } from '@painting/shared';

import { FieldError } from '@/components/paintings/field-error';
import { LocationInlineAdd } from '@/components/paintings/location-inline-add';
import { LocationKindBadge } from '@/components/paintings/location-view';
import { LocationsBankDialog } from '@/components/paintings/locations-bank-dialog';
import { Dialog } from '@/components/ui/dialog';
import { strings } from '@/strings';
import { cn } from '@/lib/utils';

/**
 * Location value carried by the painting form (locations spec §4.4).
 * The existing branch carries the summary shape — the form only needs
 * id/kind/value (locationId for submit); the full LocationDto record is a
 * bank-dialog detail, never stored in the form state.
 */
export type LocationSelection =
  | { type: 'existing'; location: LocationSummaryDto }
  | { type: 'new'; kind: LocationKind; value: string };

interface LocationPickerProps {
  value: LocationSelection | null;
  onChange: (value: LocationSelection | null) => void;
  /** Root field error («Выберите место продажи»). */
  error?: string;
  /** Nested value error (invalid address / URL). */
  nestedError?: string;
  /** Called when the user starts choosing — clears server-side errors. */
  onInteract?: () => void;
}

export function LocationPicker({
  value,
  onChange,
  error,
  nestedError,
  onInteract,
}: LocationPickerProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [adding, setAdding] = useState(false);
  const [choosing, setChoosing] = useState(false);

  const labelId = 'location-picker-label';
  const errorId = 'location-picker-error';
  const visibleError = error ?? nestedError;
  const showOptions = value === null || choosing || adding;

  const selectExisting = (location: LocationDto) => {
    onChange({ type: 'existing', location });
    setShowDialog(false);
    setChoosing(false);
    setAdding(false);
  };

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={visibleError ? errorId : undefined}
      className="space-y-3"
    >
      <h2 id={labelId} className="text-base font-semibold">
        {strings.form.location}
      </h2>

      {showOptions ? (
        adding ? (
          <LocationInlineAdd
            onDone={(selection) => {
              onChange({ type: 'new', ...selection });
              setAdding(false);
              setChoosing(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                onInteract?.();
                setShowDialog(true);
              }}
              className="flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-border bg-card px-2 text-center transition-colors hover:border-border focus-visible:border-ring"
            >
              <MapPinIcon aria-hidden="true" className="size-6 text-foreground" />
              <span className="text-base font-semibold leading-snug">{strings.form.locationPick}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onInteract?.();
                setAdding(true);
              }}
              className="flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-border bg-card px-2 text-center transition-colors hover:border-border focus-visible:border-ring"
            >
              <PlusIcon aria-hidden="true" className="size-6 text-foreground" />
              <span className="text-base font-semibold leading-snug">{strings.form.locationAdd}</span>
            </button>
          </div>
        )
      ) : value ? (
        <div
          className={cn(
            'flex items-center gap-3 rounded-xl border-2 border-primary bg-card p-4',
            choosing && 'border-border',
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center gap-2">
              <LocationKindBadge
                kind={value.type === 'existing' ? value.location.kind : value.kind}
              />
            </div>
            <p className="truncate text-lg leading-relaxed">
              {value.type === 'existing' ? value.location.value : value.value}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setChoosing(true)}
            className="flex h-13 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-base font-semibold transition-colors hover:border-border focus-visible:border-ring"
          >
            <PencilIcon aria-hidden="true" className="size-4" />
            {strings.common.edit}
          </button>
        </div>
      ) : null}

      <FieldError id={errorId} message={visibleError} />

      <Dialog open={showDialog} onOpenChange={(open) => setShowDialog(open)}>
        {showDialog && (
          <LocationsBankDialog
            onSelect={selectExisting}
            onClose={() => setShowDialog(false)}
          />
        )}
      </Dialog>
    </div>
  );
}
