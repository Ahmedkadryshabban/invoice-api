import { createHash } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { Env } from '../../config/env.ts';
import { DB, type Database } from '../../database/database.module.ts';
import { MailService } from '../mail/mail.service.ts';
import {
  checkImportFileType,
  parseImportFile,
  type ImportFile,
  type ImportRow,
} from './invoice-import.parser.ts';
import {
  importInvoiceRowSchema,
  type CreateInvoiceDto,
  type ImportInvoiceRow,
  type ImportRowError,
  type ListInvoicesDto,
} from './invoices.dto.ts';
import {
  DuplicateImportException,
  ImportNotFoundException,
  InvalidImportFileException,
} from './invoices.exceptions.ts';
import {
  INVOICE_IMPORT_QUEUE,
  PROCESS_IMPORT_JOB,
  type ImportJob,
} from './invoices.queues.ts';
import { InvoicesRepository } from './invoices.repository.ts';

const MAX_REPORTED_ROW_ERRORS = 100;
const IMPORT_CHUNK_SIZE = 1000;

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly mailService: MailService,
    private readonly config: ConfigService<Env, true>,
    @InjectQueue(INVOICE_IMPORT_QUEUE)
    private readonly importQueue: Queue<ImportJob>,
  ) {}

  async create(userId: string, dto: CreateInvoiceDto) {
    const invoice = await this.invoicesRepository.create({
      userId,
      customerEmail: dto.customerEmail,
      description: dto.description,
      amountCents: dto.amountCents,
      currency: dto.currency,
    });
    const publicUrl = this.config.get('PUBLIC_URL', { infer: true });
    return {
      ...invoice,
      paymentUrl: `${publicUrl}/v1/invoices/${invoice.id}/checkout`,
    };
  }

  async list(userId: string, { page, limit }: ListInvoicesDto) {
    const { items, total } = await this.invoicesRepository.listByUser(userId, {
      page,
      limit,
    });
    return { items, page, limit, total };
  }

  async importFromFile(userId: string, file: ImportFile | undefined) {
    if (!file) {
      throw new InvalidImportFileException(
        'Attach the file in a form field named "file"',
      );
    }
    checkImportFileType(file.originalname);
    const fileSha256 = createHash('sha256').update(file.buffer).digest('hex');

    const invoiceImport = await this.invoicesRepository.createImport({
      userId,
      fileName: file.originalname,
      fileSha256,
      file: file.buffer,
    });
    if (!invoiceImport) throw new DuplicateImportException();

    try {
      await this.importQueue.add(
        PROCESS_IMPORT_JOB,
        { importId: invoiceImport.id },
        { jobId: invoiceImport.id },
      );
    } catch (error) {
      await this.invoicesRepository.failImport(
        invoiceImport.id,
        'The import could not be queued, upload the file again',
      );
      throw error;
    }

    this.logger.log(`Import ${invoiceImport.id} queued for user ${userId}`);
    return { importId: invoiceImport.id, status: invoiceImport.status };
  }

  async findImport(userId: string, importId: string) {
    const invoiceImport = await this.invoicesRepository.findImport(
      importId,
      userId,
    );
    if (!invoiceImport) throw new ImportNotFoundException();
    return {
      importId: invoiceImport.id,
      fileName: invoiceImport.fileName,
      status: invoiceImport.status,
      rowCount: invoiceImport.rowCount,
      importedCount:
        invoiceImport.status === 'completed'
          ? (invoiceImport.rowCount ?? 0)
          : 0,
      error: invoiceImport.error,
      errors: invoiceImport.errors ?? [],
      createdAt: invoiceImport.createdAt,
      completedAt: invoiceImport.completedAt,
    };
  }

  async processImport(importId: string): Promise<void> {
    const invoiceImport = await this.invoicesRepository.startImport(importId);
    if (!invoiceImport?.file || !invoiceImport.fileName) return;

    let rows: ImportRow[];
    try {
      rows = await parseImportFile({
        originalname: invoiceImport.fileName,
        buffer: invoiceImport.file,
      });
    } catch (error) {
      if (!(error instanceof InvalidImportFileException)) throw error;
      await this.invoicesRepository.failImport(importId, error.message);
      this.logger.warn(`Import ${importId} failed: ${error.message}`);
      return;
    }

    const { valid, errors } = validateRows(rows);
    if (errors.length > 0) {
      const invalidRows = new Set(errors.map((error) => error.row)).size;
      await this.invoicesRepository.failImport(
        importId,
        `${invalidRows} row(s) have invalid values, nothing was imported`,
        errors.slice(0, MAX_REPORTED_ROW_ERRORS),
        rows.length,
      );
      this.logger.warn(
        `Import ${importId} failed: ${invalidRows} invalid rows`,
      );
      return;
    }

    const { userId, createdAt: uploadedAt } = invoiceImport;
    await this.db.transaction(async (tx) => {
      for (let start = 0; start < valid.length; start += IMPORT_CHUNK_SIZE) {
        const created = await this.invoicesRepository.createMany(
          valid.slice(start, start + IMPORT_CHUNK_SIZE).map((row) => ({
            userId,
            importId,
            customerEmail: row.customerEmail,
            description: row.description,
            amountCents: row.amountCents,
            currency: row.currency,
            status: 'paid' as const,
            paidAt: row.paidAt ?? uploadedAt,
          })),
          tx,
        );
        await this.mailService.enqueue(
          created.map((invoice) => ({
            to: invoice.customerEmail,
            dedupeKey: `invoice-paid:${invoice.id}`,
            template: 'invoice_paid' as const,
            data: {
              description: invoice.description,
              amountCents: invoice.amountCents,
              currency: invoice.currency,
              paidAt: invoice.paidAt ?? uploadedAt,
            },
          })),
          tx,
        );
      }
      await this.invoicesRepository.completeImport(importId, valid.length, tx);
    });

    this.logger.log(
      `Import ${importId} created ${valid.length} paid invoices for user ${userId} and queued ${valid.length} customer emails`,
    );
  }

  async failImport(importId: string, error: string): Promise<void> {
    await this.invoicesRepository.failImport(importId, error);
  }

  async requeueUnfinishedImports(): Promise<void> {
    const importIds = await this.invoicesRepository.findUnfinishedImportIds();
    if (importIds.length === 0) return;
    await this.importQueue.addBulk(
      importIds.map((importId) => ({
        name: PROCESS_IMPORT_JOB,
        data: { importId },
        opts: { jobId: importId },
      })),
    );
    this.logger.log(`${importIds.length} unfinished import(s) queued again`);
  }
}

function validateRows(rows: ImportRow[]): {
  valid: ImportInvoiceRow[];
  errors: ImportRowError[];
} {
  const valid: ImportInvoiceRow[] = [];
  const errors: ImportRowError[] = [];
  for (const { row, values } of rows) {
    const result = importInvoiceRowSchema.safeParse(values);
    if (result.success) {
      valid.push(result.data);
      continue;
    }
    for (const issue of result.error.issues) {
      errors.push({
        row,
        field: String(issue.path[0] ?? ''),
        message: issue.message,
      });
    }
  }
  return { valid, errors };
}
