/**
 * AuthGate — route-level 401/403 interceptor (ux-design Flow G/H, ui-design
 * §3.1/§3.2). Watches the react-query caches; on any ApiError with status 401
 * it navigates to «/expired», with 403 to «/denied». Renders <Outlet/> for the
 * protected routes below it.
 *
 * The denied/expired screens are PUBLIC (outside this layout) so the gate never
 * re-triggers on them, and the global QueryCache toast (main.tsx) suppresses
 * 401/403 — the calm screens are the entire response, no error flash for the
 * ex-owner (a11y calm-state rule).
 */
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';

import { ApiError } from '@/lib/api';
import { ROUTES } from '@/routes';

export function AuthGate() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    const routeAuthError = (error: unknown) => {
      if (!(error instanceof ApiError)) return;
      if (error.status === 401) navigate(ROUTES.expired, { replace: true });
      else if (error.status === 403) navigate(ROUTES.denied, { replace: true });
    };

    // Queries: any active query failing with 401/403 routes the user out.
    const unsubscribeQuery = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.query.state.status === 'error') {
        routeAuthError(event.query.state.error);
      }
    });
    // Mutations too (e.g. the transfer POST) — they live in the MutationCache.
    const unsubscribeMutation = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.mutation.state.status === 'error') {
        routeAuthError(event.mutation.state.error);
      }
    });

    return () => {
      unsubscribeQuery();
      unsubscribeMutation();
    };
  }, [navigate, queryClient]);

  return <Outlet />;
}
