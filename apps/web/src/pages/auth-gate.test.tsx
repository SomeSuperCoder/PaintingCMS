/**
 * AuthGate tests — the two calm public screens (ux-design §2.6/§2.7) and the
 * route-level 401/403 interceptor (Flow G/H): a 401 ApiError routes to
 * «/expired», a 403 to «/denied», other errors never route.
 */
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { AuthGate } from '@/lib/auth-gate';
import { ApiError } from '@/lib/api';
import { DeniedPage } from '@/pages/denied';
import { ExpiredPage } from '@/pages/expired';

const { reinitTMA } = vi.hoisted(() => ({ reinitTMA: vi.fn() }));
vi.mock('@/lib/tma', () => ({ reinitTMA, getInitData: () => '' }));

const reload = vi.fn();

beforeEach(() => {
  reinitTMA.mockReset();
  reload.mockReset();
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload },
    writable: true,
    configurable: true,
  });
});

describe('AuthGate screens', () => {
  it('expired screen shows the Russian message and reopens the app', async () => {
    const user = userEvent.setup();
    render(<ExpiredPage />);

    expect(screen.getByRole('heading', { name: 'Сессия истекла' })).toBeInTheDocument();
    expect(screen.getByText(/Данные безопасности устарели/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Открыть заново' }));
    expect(reinitTMA).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('denied screen shows the Russian access-denied message', () => {
    render(<DeniedPage />);
    expect(screen.getByRole('heading', { name: 'Доступ запрещён' })).toBeInTheDocument();
    expect(screen.getByText(/Это приложение принадлежит другому человеку/)).toBeInTheDocument();
  });
});

/** Mounts a query that fails with the given error inside the AuthGate. */
function FailingQuery({ error }: { error: unknown }) {
  useQuery({
    queryKey: ['boom'],
    queryFn: async () => {
      throw error;
    },
    retry: false,
  });
  return <div>trigger</div>;
}

function renderGate(error: unknown) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AuthGate />}>
            <Route path="/" element={<FailingQuery error={error} />} />
          </Route>
          <Route path="/expired" element={<div>expired screen</div>} />
          <Route path="/denied" element={<div>denied screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AuthGate 401/403 routing', () => {
  it('routes to /expired when a query fails with 401', async () => {
    renderGate(new ApiError(401, 'UNAUTHORIZED', 'msg'));
    await waitFor(() => expect(screen.getByText('expired screen')).toBeInTheDocument());
  });

  it('routes to /denied when a query fails with 403', async () => {
    renderGate(new ApiError(403, 'ACCESS_DENIED', 'msg'));
    await waitFor(() => expect(screen.getByText('denied screen')).toBeInTheDocument());
  });

  it('does not route on non-ApiError failures', async () => {
    renderGate(new Error('plain failure'));
    await waitFor(() => expect(screen.getByText('trigger')).toBeInTheDocument());
    expect(screen.queryByText('expired screen')).not.toBeInTheDocument();
    expect(screen.queryByText('denied screen')).not.toBeInTheDocument();
  });
});
