import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
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
}
