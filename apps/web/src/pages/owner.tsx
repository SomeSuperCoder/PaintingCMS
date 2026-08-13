/**
 * «Владелец» — ownership / transfer screen (ux-design §2.5, ui-design §3.3):
 * current owner card, explanation, the «Передать владельцу» primary action
 * (opens the TransferDialog), and the full ownership history below («История»).
 *
 * History events are mapped to Russian labels (claim → «Получен доступ»,
 * transfer-initiated → «Передача запущена», transfer-confirmed → «Передача
 * подтверждена») with actor names and ru-RU dates. Loading skeletons, inline
 * error + retry, empty history — same patterns as the locations screen.
 */
import { useQuery } from '@tanstack/react-query';
import { ShieldUserIcon, UserRoundCheckIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  API_PATHS,
  type OwnershipDto,
  type OwnershipEventDto,
  type UserSummaryDto,
} from '@painting/shared';

import { TransferDialog } from '@/components/owner/transfer-dialog';
import { ErrorState } from '@/components/paintings/error-state';
import { ScreenHeader } from '@/components/paintings/screen-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatRuDate } from '@/lib/format';
import { ROUTES } from '@/routes';
import { format, strings } from '@/strings';

/** Display name for a user reference: «@username» when known, else first name. */
function displayName(user: UserSummaryDto | null): string {
  if (!user) return '';
  return user.username ? `@${user.username}` : user.first_name;
}

/** One Russian history line for an ownership event (ux-design §2.5). */
function historyLine(event: OwnershipEventDto): string {
  const date = formatRuDate(event.createdAt);
  if (event.type === 'claim') {
    return format.ownerEventClaim(date, displayName(event.to));
  }
  if (event.type === 'transfer-initiated') {
    return format.ownerEventTransferInitiated(date, displayName(event.from), displayName(event.to));
  }
  return format.ownerEventTransferConfirmed(date, displayName(event.from), displayName(event.to));
}

export function OwnerPage() {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: ownership, isPending, isError, refetch } = useQuery({
    queryKey: ['ownership'],
    queryFn: () => api.get<OwnershipDto>(API_PATHS.ownership),
    // The page renders its own error UI; 401/403 are routed by the AuthGate.
    meta: { suppressErrorToast: true },
  });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <ScreenHeader title={strings.owner.title} onBack={() => navigate(ROUTES.home)} />

      <main className="flex-1 px-5 pb-12">
        {isPending ? (
          <div className="space-y-3">
            <div className="h-24 rounded-xl border border-border-subtle bg-card" />
            <div className="h-16 rounded-xl border border-border-subtle bg-card" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-xl border border-border-subtle bg-card" />
            ))}
          </div>
        ) : isError || !ownership ? (
          <ErrorState message={strings.common.loadFailed} onRetry={() => void refetch()} />
        ) : (
          <>
            {/* Current owner */}
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted"
                >
                  <ShieldUserIcon className="size-5 text-primary" />
                </span>
                <p className="min-w-0 text-lg font-semibold leading-relaxed">
                  {format.ownerCurrent(displayName(ownership.owner))}
                </p>
              </div>
            </Card>

            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              {strings.owner.explanation}
            </p>

            <Button
              type="button"
              variant="destructive"
              className="mt-5 h-13 w-full text-lg font-bold"
              onClick={() => setDialogOpen(true)}
            >
              {strings.owner.transfer}
            </Button>

            {/* History */}
            <h2 className="mt-8 text-xl font-bold leading-tight">{strings.owner.history}</h2>
            {ownership.events.length === 0 ? (
              <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
                {strings.owner.historyEmpty}
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {ownership.events.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-start gap-3 rounded-xl border border-border-subtle bg-card p-4"
                  >
                    <UserRoundCheckIcon
                      aria-hidden="true"
                      className="mt-1 size-5 shrink-0 text-muted-foreground"
                    />
                    <p className="min-w-0 text-lg leading-relaxed">{historyLine(event)}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      {dialogOpen && <TransferDialog onClose={() => setDialogOpen(false)} />}
    </div>
  );
}
