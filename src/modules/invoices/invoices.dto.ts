import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const SUPPORTED_CURRENCIES = ['usd', 'eur', 'gbp'] as const;

const amountCentsSchema = z.number().int().min(50).max(99_999_999);
const currencySchema = z
  .string()
  .toLowerCase()
  .pipe(z.enum(SUPPORTED_CURRENCIES));

const createInvoiceSchema = z.object({
  customerEmail: z.email().toLowerCase(),
  description: z.string().trim().min(1),
  amountCents: amountCentsSchema,
  currency: currencySchema,
});

const listInvoicesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const paidAtSchema = z
  .union([z.iso.date(), z.iso.datetime({ offset: true })])
  .transform((value) => new Date(value))
  .refine((date) => date.getTime() <= Date.now(), {
    message: 'Cannot be in the future',
  });

export const IMPORT_COLUMNS = [
  'customerEmail',
  'description',
  'amountCents',
  'currency',
  'paidAt',
] as const;

export const importInvoiceRowSchema = createInvoiceSchema.extend({
  amountCents: z.coerce.number().pipe(amountCentsSchema),
  paidAt: z.preprocess(
    (value) => (value === '' ? undefined : value),
    paidAtSchema.optional(),
  ),
});

export type ImportInvoiceRow = z.infer<typeof importInvoiceRowSchema>;
export type ImportRowError = { row: number; field: string; message: string };

export class CreateInvoiceDto extends createZodDto(createInvoiceSchema) {}
export class ListInvoicesDto extends createZodDto(listInvoicesSchema) {}
