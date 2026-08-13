/**
 * Painting form page — routes «/paintings/new» (create) and
 * «/paintings/:id/edit» (edit). Edit loads the painting first and only then
 * mounts the form core with prefilled defaults; loading and error states live
 * here, the form itself lives in PaintingFormCore.
 */
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { API_PATHS, type PaintingDto } from '@painting/shared';

import { ErrorState } from '@/components/paintings/error-state';
import { PaintingFormCore } from '@/components/paintings/painting-form-core';
import { ScreenHeader } from '@/components/paintings/screen-header';
import { api } from '@/lib/api';
import { ROUTES } from '@/routes';
import { strings } from '@/strings';

export function PaintingFormPage() {
  const { id } = useParams();
  const isEdit = id !== undefined && id.length > 0;
  const paintingId = isEdit ? id : '';
  const navigate = useNavigate();

  const { data: painting, isPending, isError, refetch } = useQuery({
    queryKey: ['painting', paintingId],
    queryFn: () => api.get<PaintingDto>(API_PATHS.painting(paintingId)),
    enabled: isEdit,
    meta: { suppressErrorToast: true },
  });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <ScreenHeader
        title={isEdit ? strings.form.editTitle : strings.form.createTitle}
        onBack={() => navigate(ROUTES.home)}
      />

      {isPending && isEdit ? (
        <div className="space-y-4 px-5">
          <div className="h-13 rounded-lg bg-muted" />
          <div className="h-13 rounded-lg bg-muted" />
          <div className="h-24 rounded-xl bg-muted" />
          <div className="h-24 rounded-xl bg-muted" />
        </div>
      ) : isError || (isEdit && !painting) ? (
        <div className="px-5">
          <ErrorState message={strings.common.loadFailed} onRetry={() => void refetch()} />
        </div>
      ) : (
        <PaintingFormCore mode={isEdit ? 'edit' : 'create'} painting={isEdit ? painting : undefined} />
      )}
    </div>
  );
}
