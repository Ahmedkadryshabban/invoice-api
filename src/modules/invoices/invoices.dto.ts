import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const SUPPORTED_CURRENCIES = ['usd', 'eur', 'gbp'] as const;

const createInvoiceSchema = z.object({
  customerEmail: z.email().toLowerCase(),
  description: z.string().trim().min(1),
  amountCents: z.number().int().min(50).max(99_999_999),
  currency: z.string().toLowerCase().pipe(z.enum(SUPPORTED_CURRENCIES)),
});

const listInvoicesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export class CreateInvoiceDto extends createZodDto(createInvoiceSchema) {}
export class ListInvoicesDto extends createZodDto(listInvoicesSchema) {}
