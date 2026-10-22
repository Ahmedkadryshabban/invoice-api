import { integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './columns.ts';
import { users } from './users.table.ts';

export const invoiceImports = pgTable(
  'invoice_imports',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    fileSha256: text().notNull(),
    rowCount: integer().notNull(),
    ...timestamps,
  },
  (t) => [
    unique('invoice_imports_user_id_file_sha256_unique').on(
      t.userId,
      t.fileSha256,
    ),
  ],
);

export type InvoiceImport = typeof invoiceImports.$inferSelect;
export type NewInvoiceImport = typeof invoiceImports.$inferInsert;
