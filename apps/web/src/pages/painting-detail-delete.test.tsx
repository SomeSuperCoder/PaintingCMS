/**
 * PaintingDetailPage delete-confirm tests (ui-design §2.4): the destructive
 * action requires an explicit confirm, the dialog title includes the painting
 * name, cancel does NOT call the delete API, confirm does — with the success
 * toast and home navigation.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS, type PaintingDto } from '@painting/shared';
import { toast } from 'sonner';

import { PaintingDetailPage } from '@/pages/painting-detail';
import { ROUTES } from '@/routes';
import { strings } from '@/strings';

const { apiGet, apiDelete } = vi.hoisted(() => ({ apiGet: vi.fn(), apiDelete: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get: apiGet, delete: apiDelete } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { useParams, useNavigate } = vi.hoisted(() => ({ useParams: vi.fn(), useNavigate: vi.fn() }));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useParams, useNavigate };
});

const painting: PaintingDto = {
  id: '7',
  name: 'Закат над рекой',
  price_minor: 120000,
  currency: 'rub',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  location: { id: '1', kind: 'offline', value: 'Галерея «Солнце»' },
  photos: [],
};

const navigate = vi.fn();

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PaintingDetailPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useParams.mockReturnValue({ id: '7' });
  useNavigate.mockReturnValue(navigate);
  apiGet.mockReset();
  apiDelete.mockReset();
  navigate.mockReset();
  vi.mocked(toast.success).mockClear();
  apiGet.mockResolvedValue(painting);
});

describe('PaintingDetailPage delete flow', () => {
  it('renders the painting with the ru-RU formatted price', async () => {
    renderPage();
    expect(await screen.findByText('Закат над рекой')).toBeInTheDocument();
    // 120000 minor units = 1 200 ₽ — separators normalized by Testing Library.
    expect(screen.getByText('1 200 ₽')).toBeInTheDocument();
  });

  it('cancel does not call the delete API and closes the dialog', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Закат над рекой');

    await user.click(screen.getByRole('button', { name: strings.painting.delete }));
    // The dialog title carries the painting name; the body warns it is irreversible.
    expect(screen.getByText('Удалить картину «Закат над рекой»?')).toBeInTheDocument();
    expect(screen.getByText(strings.painting.deleteBody)).toBeInTheDocument();

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: strings.common.cancel }));

    expect(apiDelete).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText('Удалить картину «Закат над рекой»?')).not.toBeInTheDocument(),
    );
  });

  it('confirming deletes via the API, toasts success and navigates home', async () => {
    apiDelete.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Закат над рекой');

    await user.click(screen.getByRole('button', { name: strings.painting.delete }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: strings.painting.delete }));

    await waitFor(() => expect(apiDelete).toHaveBeenCalledWith(API_PATHS.painting('7')));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(strings.painting.deleted));
    expect(navigate).toHaveBeenCalledWith(ROUTES.home);
  });
});
