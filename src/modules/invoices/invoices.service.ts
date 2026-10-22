import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.ts';
import { DB, type Database } from '../../database/database.module.ts';
import { MailService } from '../mail/mail.service.ts';
import { UsersRepository } from '../users/users.repository.ts';
import {
  parseImportFile,
  type ImportFile,
  type ImportRow,
} from './invoice-import.parser.ts';
import {
  importInvoiceRowSchema,
  type CreateInvoiceDto,
  type ImportInvoiceRow,
  type ListInvoicesDto,
} from './invoices.dto.ts';
import {
  DuplicateImportException,
  InvalidImportFileException,
  InvalidImportRowsException,
  type ImportRowError,
} from './invoices.exceptions.ts';
import { InvoicesRepository } from './invoices.repository.ts';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly mailService: MailService,
    private readonly usersRepository: UsersRepository,
    private readonly config: ConfigService<Env, true>,
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
    const rows = validateRows(await parseImportFile(file));
    const fileSha256 = createHash('sha256').update(file.buffer).digest('hex');
    const importedAt = new Date();
    const uploader = await this.usersRepository.findById(userId);

    const { importId, invoices } = await this.db.transaction(async (tx) => {
      const invoiceImport = await this.invoicesRepository.createImport(
        { userId, fileSha256, rowCount: rows.length },
        tx,
      );
      if (!invoiceImport) throw new DuplicateImportException();

      const created = await this.invoicesRepository.createMany(
        rows.map((row) => ({
          userId,
          importId: invoiceImport.id,
          customerEmail: row.customerEmail,
          description: row.description,
          amountCents: row.amountCents,
          currency: row.currency,
          status: 'paid' as const,
          paidAt: row.paidAt ?? importedAt,
        })),
        tx,
      );
      if (uploader) {
        const totals: { currency: string; amountCents: number }[] = [];
        for (const invoice of created) {
          const total = totals.find(
            (entry) => entry.currency === invoice.currency,
          );
          if (total) {
            total.amountCents += invoice.amountCents;
          } else {
            totals.push({
              currency: invoice.currency,
              amountCents: invoice.amountCents,
            });
          }
        }
        await this.mailService.enqueue(
          [
            {
              to: uploader.email,
              dedupeKey: `import-completed:${invoiceImport.id}`,
              template: 'import_completed' as const,
              data: {
                fileName: file.originalname,
                importedCount: created.length,
                totals,
                invoices: created.map((invoice) => ({
                  customerEmail: invoice.customerEmail,
                  description: invoice.description,
                  amountCents: invoice.amountCents,
                  currency: invoice.currency,
                })),
              },
            },
          ],
          tx,
        );
      } else {
        this.logger.warn(
          `Import ${invoiceImport.id} has no uploader, skipping summary email`,
        );
      }
      return { importId: invoiceImport.id, invoices: created };
    });

    this.logger.log(
      `Import ${importId} created ${invoices.length} paid invoices for user ${userId}`,
    );
    return { importId, importedCount: invoices.length };
  }
}

function validateRows(rows: ImportRow[]): ImportInvoiceRow[] {
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
  if (errors.length > 0) throw new InvalidImportRowsException(errors);
  return valid;
}
