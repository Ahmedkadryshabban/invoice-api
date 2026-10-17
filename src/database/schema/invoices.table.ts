import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './columns.ts';
import { users } from './users.table.ts';

export const invoiceStatus = pgEnum('invoice_status', ['pending', 'paid']);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    customerEmail: text().notNull(),
    description: text().notNull(),
    amountCents: integer().notNull(),
    currency: text().notNull(),
    status: invoiceStatus().notNull().default('pending'),
    stripeSessionId: text(),
    paidAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('invoices_user_id_idx').on(t.userId)],
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
