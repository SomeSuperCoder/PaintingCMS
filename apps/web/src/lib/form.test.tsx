/**
 * form.ts tests — useCreateZodForm hook (RHF + zod resolver wiring) and the
 * field-error helpers. The hook is exercised through renderHook; validation
 * messages asserted are the Russian zod messages.
 */
import { act, renderHook } from '@testing-library/react';
import type { FieldErrors } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { apiFieldErrorMessage, fieldErrorMessage, useCreateZodForm } from '@/lib/form';

const schema = z.object({
  name: z.string().trim().min(1, 'Введите название'),
  price: z.string().refine((v) => v !== '' && !Number.isNaN(Number(v)), 'Введите цену числом'),
});

type Values = z.infer<typeof schema>;

describe('useCreateZodForm', () => {
  it('builds a form initialized with the default values', () => {
    const { result } = renderHook(() =>
      useCreateZodForm<Values>(schema, { defaultValues: { name: 'Закат', price: '1200' } }),
    );
    expect(result.current.getValues('name')).toBe('Закат');
    expect(result.current.getValues('price')).toBe('1200');
  });

  it('wires zod validation with the Russian messages', async () => {
    const { result } = renderHook(() =>
      useCreateZodForm<Values>(schema, { defaultValues: { name: '', price: '' } }),
    );
    act(() => {
      result.current.setValue('name', '');
      result.current.setValue('price', '');
    });
    await act(async () => {
      await result.current.trigger();
    });
    // RHF 7.85 `formState` is a reactive proxy whose errors only surface through
    // a subscribed render; reads from an unsubscribed renderHook result are
    // stale. `getFieldState` is the non-reactive field-state API — it returns
    // the actual validation result the real form renders from.
    expect(result.current.getFieldState('name').error?.message).toBe('Введите название');
    expect(result.current.getFieldState('price').error?.message).toBe('Введите цену числом');
  });

  it('passes a valid form through the resolver', async () => {
    const { result } = renderHook(() =>
      useCreateZodForm<Values>(schema, { defaultValues: { name: '', price: '' } }),
    );
    act(() => {
      result.current.setValue('name', 'Закат');
      // The fixture schema validates with Number(); ru-RU commas ('1250,50')
      // are not valid JS numbers, so use a dot decimal for the valid case.
      result.current.setValue('price', '1250.50');
    });
    await act(async () => {
      await expect(result.current.trigger()).resolves.toBe(true);
    });
  });
});

describe('fieldErrorMessage', () => {
  it('returns the Russian message for a field', () => {
    const errors: FieldErrors<Values> = {
      name: { type: 'too_small', message: 'Введите название' },
    };
    expect(fieldErrorMessage(errors, 'name')).toBe('Введите название');
  });

  it('returns undefined for a missing field', () => {
    expect(fieldErrorMessage({}, 'name')).toBeUndefined();
  });
});

describe('apiFieldErrorMessage', () => {
  it('returns the first server message for a field', () => {
    expect(apiFieldErrorMessage({ value: ['Ошибка 1', 'Ошибка 2'] }, 'value')).toBe('Ошибка 1');
  });

  it('returns undefined when the field is absent or empty', () => {
    expect(apiFieldErrorMessage({ value: [] }, 'value')).toBeUndefined();
    expect(apiFieldErrorMessage(undefined, 'value')).toBeUndefined();
    expect(apiFieldErrorMessage({ other: ['x'] }, 'value')).toBeUndefined();
  });
});
