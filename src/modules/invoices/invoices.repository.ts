import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import {
  DB,
  type Database,
  type Transaction,
} from '../../database/database.module.ts';
import {
  invoiceImports,
  invoices,
  type Invoice,
  type InvoiceImport,
  type NewInvoice,
  type NewInvoiceImport,
} from '../../database/schema/index.ts';

const INSERT_CHUNK_SIZE = 1000;

@Injectable()
export class InvoicesRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(data: NewInvoice): Promise<Invoice> {
    const [invoice] = await this.db.insert(invoices).values(data).returning();
    return invoice;
  }

  async createMany(
    data: NewInvoice[],
    tx: Database | Transaction = this.db,
  ): Promise<Invoice[]> {
    const created: Invoice[] = [];
    for (let start = 0; start < data.length; start += INSERT_CHUNK_SIZE) {
      const chunk = await tx
        .insert(invoices)
        .values(data.slice(start, start + INSERT_CHUNK_SIZE))
        .returning();
      created.push(...chunk);
    }
    return created;
  }

  async createImport(
    data: NewInvoiceImport,
  ): Promise<Pick<InvoiceImport, 'id' | 'status'> | null> {
    const [invoiceImport] = await this.db
      .insert(invoiceImports)
      .values(data)
      .onConflictDoNothing({
        target: [invoiceImports.userId, invoiceImports.fileSha256],
        where: sql`${invoiceImports.status} <> 'failed'`,
      })
      .returning({ id: invoiceImports.id, status: invoiceImports.status });
    return invoiceImport ?? null;
  }

  async startImport(
    id: string,
  ): Promise<Pick<
    InvoiceImport,
    'userId' | 'fileName' | 'file' | 'createdAt'
  > | null> {
    const [invoiceImport] = await this.db
      .update(invoiceImports)
      .set({ status: 'processing' })
      .where(
        and(
          eq(invoiceImports.id, id),
          inArray(invoiceImports.status, ['pending', 'processing']),
        ),
      )
      .returning({
        userId: invoiceImports.userId,
        fileName: invoiceImports.fileName,
        file: invoiceImports.file,
        createdAt: invoiceImports.createdAt,
      });
    return invoiceImport ?? null;
  }

  async completeImport(
    id: string,
    rowCount: number,
    tx: Database | Transaction = this.db,
  ): Promise<void> {
    await tx
      .update(invoiceImports)
      .set({
        status: 'completed',
        rowCount,
        file: null,
        error: null,
        errors: null,
        completedAt: new Date(),
      })
      .where(eq(invoiceImports.id, id));
  }

  async failImport(
    id: string,
    error: string,
    errors: InvoiceImport['errors'] = null,
    rowCount: number | null = null,
  ): Promise<void> {
    await this.db
      .update(invoiceImports)
      .set({
        status: 'failed',
        rowCount,
        file: null,
        error,
        errors,
        completedAt: new Date(),
      })
      .where(
        and(eq(invoiceImports.id, id), ne(invoiceImports.status, 'completed')),
      );
  }

  async findImport(
    id: string,
    userId: string,
  ): Promise<Omit<
    InvoiceImport,
    'userId' | 'fileSha256' | 'file' | 'updatedAt'
  > | null> {
    const [invoiceImport] = await this.db
      .select({
        id: invoiceImports.id,
        fileName: invoiceImports.fileName,
        status: invoiceImports.status,
        rowCount: invoiceImports.rowCount,
        error: invoiceImports.error,
        errors: invoiceImports.errors,
        createdAt: invoiceImports.createdAt,
        completedAt: invoiceImports.completedAt,
      })
      .from(invoiceImports)
      .where(and(eq(invoiceImports.id, id), eq(invoiceImports.userId, userId)))
      .limit(1);
    return invoiceImport ?? null;
  }

  async findUnfinishedImportIds(): Promise<string[]> {
    const unfinished = await this.db
      .select({ id: invoiceImports.id })
      .from(invoiceImports)
      .where(inArray(invoiceImports.status, ['pending', 'processing']));
    return unfinished.map(({ id }) => id);
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

  async replaceStripeSession(
    id: string,
    previousSessionId: string | null,
    nextSessionId: string,
  ): Promise<Invoice | null> {
    const [invoice] = await this.db
      .update(invoices)
      .set({ stripeSessionId: nextSessionId })
      .where(
        and(
          eq(invoices.id, id),
          eq(invoices.status, 'pending'),
          previousSessionId === null
            ? isNull(invoices.stripeSessionId)
            : eq(invoices.stripeSessionId, previousSessionId),
        ),
      )
      .returning();
    return invoice ?? null;
  }

  async markPaid(
    id: string,
    stripeSessionId: string,
    tx: Database | Transaction = this.db,
  ): Promise<Invoice | null> {
    const [invoice] = await tx
      .update(invoices)
      .set({ status: 'paid', paidAt: new Date(), stripeSessionId })
      .where(and(eq(invoices.id, id), eq(invoices.status, 'pending')))
      .returning();
    return invoice ?? null;
  }
}
