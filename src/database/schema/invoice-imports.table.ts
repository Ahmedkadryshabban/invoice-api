import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { bytea, timestamps } from './columns.ts';
import { users } from './users.table.ts';

export const invoiceImports = pgTable(
  'invoice_imports',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    fileName: text(),
    fileSha256: text().notNull(),
    file: bytea(),
    status: text({ enum: ['pending', 'processing', 'completed', 'failed'] })
      .notNull()
      .default('pending'),
    rowCount: integer(),
    error: text(),
    errors: jsonb().$type<{ row: number; field: string; message: string }[]>(),
    completedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('invoice_imports_user_id_file_sha256_active_unique')
      .on(t.userId, t.fileSha256)
      .where(sql`${t.status} <> 'failed'`),
    check(
      'invoice_imports_status_check',
      sql`${t.status} in ('pending', 'processing', 'completed', 'failed')`,
    ),
  ],
);

export type InvoiceImport = typeof invoiceImports.$inferSelect;
export type NewInvoiceImport = typeof invoiceImports.$inferInsert;
