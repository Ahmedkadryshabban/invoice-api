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

const INSERT_CHUNK_SIZE = 1000;

@Injectable()
export class MailRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async insertMany(
    rows: NewEmailOutbox[],
    tx: Database | Transaction = this.db,
  ): Promise<void> {
    for (let start = 0; start < rows.length; start += INSERT_CHUNK_SIZE) {
      await tx
        .insert(emailOutbox)
        .values(rows.slice(start, start + INSERT_CHUNK_SIZE))
        .onConflictDoNothing({ target: emailOutbox.dedupeKey });
    }
  }

  async claimForDispatch(
    limit: number,
    leaseSeconds: number,
  ): Promise<string[]> {
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

    const claimed = await this.db
      .update(emailOutbox)
      .set({
        nextAttemptAt: sql`now() + make_interval(secs => ${leaseSeconds})`,
      })
      .where(inArray(emailOutbox.id, due))
      .returning({ id: emailOutbox.id });
    return claimed.map(({ id }) => id);
  }

  async findPendingById(id: string): Promise<EmailOutbox | null> {
    const [email] = await this.db
      .select()
      .from(emailOutbox)
      .where(and(eq(emailOutbox.id, id), eq(emailOutbox.status, 'pending')))
      .limit(1);
    return email ?? null;
  }

  async markSent(id: string, attempts: number): Promise<void> {
    await this.db
      .update(emailOutbox)
      .set({ status: 'sent', sentAt: new Date(), attempts, lastError: null })
      .where(eq(emailOutbox.id, id));
  }

  async recordFailure(
    id: string,
    attempts: number,
    error: string,
  ): Promise<void> {
    await this.db
      .update(emailOutbox)
      .set({ attempts, lastError: error })
      .where(eq(emailOutbox.id, id));
  }

  async markFailed(id: string, attempts: number, error: string): Promise<void> {
    await this.db
      .update(emailOutbox)
      .set({ status: 'failed', attempts, lastError: error })
      .where(eq(emailOutbox.id, id));
  }
}
