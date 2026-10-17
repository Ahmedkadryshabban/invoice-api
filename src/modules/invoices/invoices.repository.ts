import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DB, type Database } from '../../database/database.module.ts';
import {
  invoices,
  type Invoice,
  type NewInvoice,
} from '../../database/schema/index.ts';

@Injectable()
export class InvoicesRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(data: NewInvoice): Promise<Invoice> {
    const [invoice] = await this.db.insert(invoices).values(data).returning();
    return invoice;
  }

  async listByUser(
    userId: string,
    { page, limit }: { page: number; limit: number },
  ): Promise<{ items: Invoice[]; total: number }> {
    const where = eq(invoices.userId, userId);
    const [items, total] = await Promise.all([
      this.db
        .select()
        .from(invoices)
        .where(where)
        .orderBy(desc(invoices.createdAt), desc(invoices.id))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db.$count(invoices, where),
    ]);
    return { items, total };
  }

  async findById(id: string): Promise<Invoice | null> {
    const [invoice] = await this.db
      .select()
      .from(invoices)
      .where(eq(invoices.id, id))
      .limit(1);
    return invoice ?? null;
  }

  async setStripeSession(
    id: string,
    stripeSessionId: string,
  ): Promise<Invoice | null> {
    const [invoice] = await this.db
      .update(invoices)
      .set({ stripeSessionId })
      .where(and(eq(invoices.id, id), eq(invoices.status, 'pending')))
      .returning();
    return invoice ?? null;
  }

  async markPaid(id: string, stripeSessionId: string): Promise<Invoice | null> {
    const [invoice] = await this.db
      .update(invoices)
      .set({ status: 'paid', paidAt: new Date(), stripeSessionId })
      .where(and(eq(invoices.id, id), eq(invoices.status, 'pending')))
      .returning();
    return invoice ?? null;
  }
}
