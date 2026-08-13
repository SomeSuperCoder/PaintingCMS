/**
 * TransferDialog — «Передать владельцу» (ux-design §2.5 / Flow F, ui-design
 * §3.3): a large @username input (zod: strip a leading @, trim, pattern
 * /^[a-zA-Z0-9_]{5,32}$/) with the Russian hint, then an AlertDialog
 * confirmation («Передать владельцу @user? После подтверждения доступ будет
 * ограничен.» — cancel-first, destructive) before POST /ownership/transfer.
 *
 * On 422 TRANSFER_USER_NOT_FOUND the contract's Russian guidance is shown
 * inline and the dialog stays open — the typed username is never lost
 * (ux-design principle 6). On success a calm toast fires and the ownership
 * query refreshes; the ex-owner then loses access immediately, so the refresh
 * 403s and the AuthGate switches to the calm «Доступ запрещён» screen.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRightIcon } from 'lucide-react';
import { useState } from 'react';
import { API_PATHS, type TransferRequestDto, type TransferResultDto } from '@painting/shared';
import { toast } from 'sonner';
import { z } from 'zod';

import { ErrorState } from '@/components/paintings/error-state';
import { FieldError } from '@/components/paintings/field-error';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { api, apiErrorMessage } from '@/lib/api';
import { format, strings } from '@/strings';

/**
 * Telegram @username: strip an optional leading @, trim, then 5–32 chars of
 * latin letters, digits or underscore (spawn directive — the server resolves
 * the same username from the recorded-users table).
 */
const usernameSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/^@/, ''))
  .pipe(
    z
      .string()
      .min(1, strings.owner.usernameRequired)
      .regex(/^[a-zA-Z0-9_]{5,32}$/, strings.owner.usernameInvalid),
  );

export interface TransferDialogProps {
  onClose: () => void;
}

export function TransferDialog({ onClose }: TransferDialogProps) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);

  const confirmMutation = useMutation({
    mutationFn: (target: string) =>
      api.post<TransferResultDto>(
        API_PATHS.transfer,
        { target_username: target } satisfies TransferRequestDto,
      ),
    onSuccess: () => {
      toast.success(strings.owner.transferStarted);
      // The ex-owner loses access immediately — the refresh 403s and the
      // AuthGate switches to the calm «Доступ запрещён» screen.
      queryClient.invalidateQueries({ queryKey: ['ownership'] });
      onClose();
    },
    onError: (error) => {
      // 422 → the contract's Russian guidance («новый владелец должен открыть
      // приложение…») shown inline; the dialog stays open, data preserved.
      setConfirmTarget(null);
      setSubmitError(apiErrorMessage(error));
    },
  });

  const handleSubmit = () => {
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? strings.common.generic);
      return;
    }
    setFieldError(null);
    setSubmitError(null);
    setConfirmTarget(parsed.data);
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{strings.owner.transfer}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {submitError && <ErrorState message={submitError} variant="banner" />}

            <div className="space-y-2">
              <Label htmlFor="transfer-username" className="text-base font-semibold">
                {strings.owner.usernameLabel}
              </Label>
              <Input
                id="transfer-username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setFieldError(null);
                  setSubmitError(null);
                }}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={strings.owner.usernamePlaceholder}
                className="h-13 text-lg"
                aria-invalid={!!fieldError}
                aria-describedby={fieldError ? 'transfer-username-error' : undefined}
              />
              <FieldError id="transfer-username-error" message={fieldError ?? undefined} />
              <p className="text-base leading-relaxed text-muted-foreground">
                {strings.owner.usernameHint}
              </p>
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
              onClick={handleSubmit}
            >
              {strings.owner.transfer}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation — cancel-first, destructive (ux-design §314) */}
      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => { if (!open) setConfirmTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <ArrowLeftRightIcon aria-hidden="true" className="size-5 text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {format.ownerConfirmTitle(confirmTarget ?? '')}
            </AlertDialogTitle>
            <AlertDialogDescription>{strings.owner.confirmBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="h-13 text-base font-semibold"
              onClick={() => setConfirmTarget(null)}
            >
              {strings.common.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="h-13 text-base font-semibold"
              disabled={confirmMutation.isPending}
              onClick={() => {
                if (confirmTarget) confirmMutation.mutate(confirmTarget);
              }}
            >
              {confirmMutation.isPending ? strings.common.saving : strings.owner.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
