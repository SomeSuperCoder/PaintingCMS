/**
 * Entry point — PaintingCMS Telegram Mini App.
 *
 * Order matters:
 * 1. initTMA() captures the Telegram initData BEFORE React renders
 *    (the api wrapper attaches it as X-Telegram-Init-Data).
 * 2. QueryClientProvider wires react-query defaults (staleTime, retry policy)
 *    and a Russian error toast for any unhandled query/mutation error.
 * 3. BrowserRouter + App render the route table; Toaster renders sonner toasts.
 */
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { toast } from 'sonner';

import { Toaster } from '@/components/ui/sonner';
import { apiErrorMessage, ApiError } from '@/lib/api';
import { initTMA } from '@/lib/tma';

import App from './App';
import './index.css';

// Capture Telegram initData before the first render — the api wrapper needs it.
initTMA();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale after 60s; retry transient failures once (GETs).
      staleTime: 60_000,
      retry: 1,
    },
    mutations: {
      // Never auto-retry a mutation — a retried save could double-write.
      retry: 0,
    },
  },
  queryCache: new QueryCache({
    // Russian error toast for unhandled errors. Screens that render their own
    // error UI (list/detail/form/denied/expired gates) suppress this per-query
    // via meta.suppressErrorToast. 401/403 are ALWAYS silent here: the
    // AuthGate routes them to the calm «Сессия истекла» / «Доступ запрещён»
    // screens — an error toast would flash an error the user must not see
    // (a11y calm-state rule for the ex-owner).
    onError: (error, query) => {
      const suppress = (query.meta as { suppressErrorToast?: boolean } | undefined)
        ?.suppressErrorToast;
      if (suppress) return;
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return;
      toast.error(apiErrorMessage(error));
    },
  }),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
