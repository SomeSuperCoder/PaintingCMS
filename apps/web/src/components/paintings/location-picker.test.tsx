/**
 * LocationPicker tests — the «Где продаётся» form section (ui-design §3.2):
 * two equal option cards, toggling to the inline add sub-form or the
 * locations bank dialog, and rendering the chosen value.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocationDto } from '@painting/shared';

import { LocationPicker, type LocationSelection } from '@/components/paintings/location-picker';

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get: apiGet } }));

const gallery: LocationDto = {
  id: '1',
  kind: 'offline',
  value: 'Галерея «Солнце»',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

let queryClient: QueryClient;

function renderPicker(value: LocationSelection | null = null) {
  const onChange = vi.fn();
  const onInteract = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <LocationPicker value={value} onChange={onChange} onInteract={onInteract} />
    </QueryClientProvider>,
  );
  return { onChange, onInteract };
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  apiGet.mockReset();
});

describe('LocationPicker', () => {
  it('renders the two equal options «Выбрать место» and «Добавить новое место»', () => {
    renderPicker();
    expect(screen.getByRole('group', { name: 'Где продаётся' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выбрать место' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить новое место' })).toBeInTheDocument();
  });

  it('«Добавить новое место» reveals the inline sub-form and commits the new location', async () => {
    const user = userEvent.setup();
    const { onChange, onInteract } = renderPicker();

    await user.click(screen.getByRole('button', { name: 'Добавить новое место' }));
    expect(onInteract).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('radio', { name: 'Офлайн (адрес)' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Онлайн (сайт)' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Адрес'), 'Галерея «Солнце»');
    await user.click(screen.getByRole('button', { name: 'Готово' }));

    expect(onChange).toHaveBeenCalledWith({ type: 'new', kind: 'offline', value: 'Галерея «Солнце»' });
    expect(onInteract).toHaveBeenCalledTimes(1);
  });

  it('«Выбрать место» opens the bank dialog and selecting a row commits the existing location', async () => {
    apiGet.mockResolvedValue([gallery]);
    const user = userEvent.setup();
    const { onChange } = renderPicker();

    await user.click(screen.getByRole('button', { name: 'Выбрать место' }));
    const row = await screen.findByRole('button', { name: /Галерея «Солнце»/ });
    await user.click(row);

    expect(onChange).toHaveBeenCalledWith({ type: 'existing', location: gallery });
  });

  it('shows the chosen value as a card and «Изменить» returns to the options', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({ type: 'existing', location: gallery });

    expect(screen.getByText('Галерея «Солнце»')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Изменить' }));

    expect(screen.getByRole('button', { name: 'Выбрать место' })).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders the Russian root field error when provided', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <LocationPicker value={null} onChange={vi.fn()} error="Выберите место продажи" />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Выберите место продажи')).toBeInTheDocument();
  });

  it('waits for the bank dialog fetch before selection (deterministic, no sleeps)', async () => {
    apiGet.mockResolvedValue([gallery]);
    const user = userEvent.setup();
    const { onChange } = renderPicker();

    await user.click(screen.getByRole('button', { name: 'Выбрать место' }));
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(1));
    const row = await screen.findByRole('button', { name: /Галерея «Солнце»/ });
    await user.click(row);
    expect(onChange).toHaveBeenCalled();
  });
});
