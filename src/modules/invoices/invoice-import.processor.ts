import { Processor, WorkerHost } from '@nestjs/bullmq';
import {
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { Job } from 'bullmq';
import { InvoicesService } from './invoices.service.ts';
import {
  INVOICE_IMPORT_QUEUE,
  MAX_IMPORT_ATTEMPTS,
  type ImportJob,
} from './invoices.queues.ts';

@Processor(INVOICE_IMPORT_QUEUE)
export class InvoiceImportProcessor
  extends WorkerHost
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(InvoiceImportProcessor.name);

  constructor(private readonly invoicesService: InvoicesService) {
    super();
  }

  async onApplicationBootstrap() {
    await this.invoicesService.requeueUnfinishedImports();
  }

  async onModuleDestroy() {
    await this.worker.close(true);
  }

  async process(job: Job<ImportJob>): Promise<void> {
    const { importId } = job.data;
    const attempt = job.attemptsMade + 1;
    try {
      await this.invoicesService.processImport(importId);
    } catch (error) {
      const isLastAttempt = attempt >= MAX_IMPORT_ATTEMPTS;
      this.logger.error(
        `Import ${importId} attempt ${attempt} crashed${isLastAttempt ? ', giving up' : ', it will be retried'}`,
        error instanceof Error ? error.stack : String(error),
      );
      if (isLastAttempt) {
        await this.invoicesService.failImport(
          importId,
          'The import could not be processed, upload the file again',
        );
      }
      throw error;
    }
  }
}
