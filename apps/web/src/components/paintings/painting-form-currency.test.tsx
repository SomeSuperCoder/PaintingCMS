/**
 * Currency toggle tests — the ₽/$/€ segment control in PaintingFormCore
 * (ui-design §3.2): three radio options, selection updates the form value,
 * and the submitted payload carries the chosen currency.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { API_PATHS } from '@painting/shared';

import { PaintingFormCore } from '@/components/paintings/painting-form-core';

const { apiGet, apiPost, apiPatch, apiDelete } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ api: { get: apiGet, post: apiPost, patch: apiPatch, delete: apiDelete } }));
// Photo upload is out of scope for the currency tests — mock at the boundary.
vi.mock('@/components/paintings/photo-uploader', () => ({ PhotoUploader: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderForm() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/paintings/new']}>
        <PaintingFormCore mode="create" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  apiPatch.mockReset();
  apiDelete.mockReset();
});

describe('currency toggles', () => {
  it('renders the three currency options ₽/$/€ with radio semantics', () => {
    renderForm();
    expect(screen.getByRole('radio', { name: '₽ Рубли' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '$ Доллары' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '€ Евро' })).toBeInTheDocument();
  });

  it('defaults to rub and toggles the selection to EUR then USD', async () => {
    const user = userEvent.setup();
    renderForm();

    const rub = screen.getByRole('radio', { name: '₽ Рубли' });
    const eur = screen.getByRole('radio', { name: '€ Евро' });
    const usd = screen.getByRole('radio', { name: '$ Доллары' });

    expect(rub).toHaveAttribute('aria-checked', 'true');
    expect(eur).toHaveAttribute('aria-checked', 'false');
    expect(usd).toHaveAttribute('aria-checked', 'false');

    await user.click(eur);
    expect(eur).toHaveAttribute('aria-checked', 'true');
    expect(rub).toHaveAttribute('aria-checked', 'false');

    await user.click(usd);
    expect(usd).toHaveAttribute('aria-checked', 'true');
    expect(eur).toHaveAttribute('aria-checked', 'false');
  });

  it('submits the selected currency in the payload', async () => {
    apiPost.mockResolvedValue({
      id: '1',
      name: 'Закат над рекой',
      price_minor: 125000,
      currency: 'eur',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      location: { id: '1', kind: 'offline', value: 'Галерея «Солнце»' },
      photos: [],
    });
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Название'), 'Закат над рекой');
    await user.type(screen.getByLabelText('Цена'), '1250');
    await user.click(screen.getByRole('radio', { name: '€ Евро' }));
    await user.click(screen.getByRole('button', { name: 'Добавить новое место' }));
    await user.type(screen.getByLabelText('Адрес'), 'Галерея «Солнце»');
    await user.click(screen.getByRole('button', { name: 'Готово' }));

    await user.click(screen.getByRole('button', { name: '+ Добавить картину' }));

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    const [path, body] = apiPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe(API_PATHS.paintings);
    expect(body).toEqual({
      name: 'Закат над рекой',
      price_minor: 125000,
      currency: 'eur',
      newLocation: { kind: 'offline', value: 'Галерея «Солнце»' },
    });
  });
});
