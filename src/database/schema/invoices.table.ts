import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './columns.ts';
import { users } from './users.table.ts';

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
    status: text({ enum: ['pending', 'paid'] })
      .notNull()
      .default('pending'),
    stripeSessionId: text(),
    paidAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('invoices_user_id_idx').on(t.userId),
    check('invoices_status_check', sql`${t.status} in ('pending', 'paid')`),
  ],
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
