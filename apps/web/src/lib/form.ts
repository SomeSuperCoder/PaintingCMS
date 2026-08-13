/**
 * React Hook Form + zod helpers for the painting/location/owner forms.
 * Validation messages are Russian: zod schemas carry strings module messages,
 * and server-side field errors (ApiErrorBody.fieldErrors) reuse the same text.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import {
  useForm,
  type FieldError,
  type FieldErrors,
  type FieldValues,
  type Path,
  type UseFormProps,
} from 'react-hook-form';

/**
 * Structural shape of a zod v4 schema that zodResolver accepts — mirrors the
 * resolver's own `Zod4Type` interface (`_zod.output` / `_zod.input`).
 * Constrains the schema to flat, non-transforming forms (input === output),
 * which is all our forms are.
 */
interface ZodFormSchema<TFieldValues extends FieldValues> {
  _zod: {
    output: TFieldValues;
    input: TFieldValues;
  };
}

export type CreateZodFormOptions<TFieldValues extends FieldValues> = Omit<
  UseFormProps<TFieldValues>,
  'resolver'
>;

/**
 * A configured useForm instance bound to a zod schema via zodResolver.
 * Call at the top level of a component (it IS a hook call).
 *
 *   const form = useCreateZodForm(paintingSchema, { defaultValues });
 */
export function useCreateZodForm<TFieldValues extends FieldValues>(
  schema: ZodFormSchema<TFieldValues>,
  options?: CreateZodFormOptions<TFieldValues>,
) {
  return useForm<TFieldValues>({
    ...options,
    resolver: zodResolver(schema),
  });
}

/**
 * Russian message for one field from RHF errors (the zod message).
 * Flat schemas only — our forms are flat (no nested objects).
 */
export function fieldErrorMessage<TFieldValues extends FieldValues>(
  errors: FieldErrors<TFieldValues>,
  field: Path<TFieldValues>,
): string | undefined {
  const error = (errors as Record<string, FieldError | undefined>)[field];
  return error?.message;
}

/** Russian message for one field from the API error envelope (fieldErrors map). */
export function apiFieldErrorMessage(
  fieldErrors: Record<string, string[]> | undefined,
  field: string,
): string | undefined {
  const messages = fieldErrors?.[field];
  return messages && messages.length > 0 ? messages[0] : undefined;
}
