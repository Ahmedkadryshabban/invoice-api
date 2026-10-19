import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import {
  DB,
  type Database,
  type Transaction,
} from '../../database/database.module.ts';
import {
  emailOutbox,
  type EmailOutbox,
  type NewEmailOutbox,
} from '../../database/schema/index.ts';

@Injectable()
export class MailRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async insertMany(
    rows: NewEmailOutbox[],
    tx: Database | Transaction = this.db,
  ): Promise<void> {
    if (rows.length === 0) return;
    await tx
      .insert(emailOutbox)
      .values(rows)
      .onConflictDoNothing({ target: emailOutbox.dedupeKey });
  }

  async claimDue(limit: number, leaseSeconds: number): Promise<EmailOutbox[]> {
    const due = this.db
      .select({ id: emailOutbox.id })
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.status, 'pending'),
          lte(emailOutbox.nextAttemptAt, sql`now()`),
        ),
      )
      .orderBy(asc(emailOutbox.nextAttemptAt))
      .limit(limit)
      .for('update', { skipLocked: true });

    return this.db
      .update(emailOutbox)
      .set({
        attempts: sql`${emailOutbox.attempts} + 1`,
        nextAttemptAt: sql`now() + make_interval(secs => ${leaseSeconds})`,
      })
      .where(inArray(emailOutbox.id, due))
      .returning();
  }

  async markSent(id: string): Promise<void> {
    await this.db
      .update(emailOutbox)
      .set({ status: 'sent', sentAt: new Date(), lastError: null })
      .where(eq(emailOutbox.id, id));
  }

  async scheduleRetry(
    id: string,
    delaySeconds: number,
    error: string,
  ): Promise<void> {
    await this.db
      .update(emailOutbox)
      .set({
        nextAttemptAt: sql`now() + make_interval(secs => ${delaySeconds})`,
        lastError: error,
      })
      .where(eq(emailOutbox.id, id));
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.db
      .update(emailOutbox)
      .set({ status: 'failed', lastError: error })
      .where(eq(emailOutbox.id, id));
  }
}
