import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const createInvoiceSchema = z.object({
  customerEmail: z.email().toLowerCase(),
  description: z.string().trim().min(1),
  amountCents: z.number().int().positive(),
  currency: z
    .string()
    .regex(/^[a-zA-Z]{3}$/)
    .toLowerCase(),
});

const listInvoicesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export class CreateInvoiceDto extends createZodDto(createInvoiceSchema) {}
export class ListInvoicesDto extends createZodDto(listInvoicesSchema) {}
