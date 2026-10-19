import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './columns.ts';

export const emailOutbox = pgTable(
  'email_outbox',
  {
    id: uuid().primaryKey().defaultRandom(),
    dedupeKey: text().notNull(),
    toEmail: text().notNull(),
    template: text({
      enum: [
        'invoice_paid',
        'payment_failed',
        'checkout_expired',
        'invoice_imported',
      ],
    }).notNull(),
    subject: text().notNull(),
    bodyText: text().notNull(),
    bodyHtml: text().notNull(),
    status: text({ enum: ['pending', 'sent', 'failed'] })
      .notNull()
      .default('pending'),
    attempts: integer().notNull().default(0),
    nextAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastError: text(),
    sentAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('email_outbox_dedupe_key_unique').on(t.dedupeKey),
    index('email_outbox_pending_idx')
      .on(t.nextAttemptAt)
      .where(sql`${t.status} = 'pending'`),
    check(
      'email_outbox_template_check',
      sql`${t.template} in ('invoice_paid', 'payment_failed', 'checkout_expired', 'invoice_imported')`,
    ),
    check(
      'email_outbox_status_check',
      sql`${t.status} in ('pending', 'sent', 'failed')`,
    ),
  ],
);

export type EmailOutbox = typeof emailOutbox.$inferSelect;
export type NewEmailOutbox = typeof emailOutbox.$inferInsert;
