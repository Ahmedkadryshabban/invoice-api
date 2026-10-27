import type { RegisterQueueOptions } from '@nestjs/bullmq';

export const INVOICE_IMPORT_QUEUE = 'invoice-import';
export const PROCESS_IMPORT_JOB = 'process-import';

export const MAX_IMPORT_ATTEMPTS = 3;
const RETRY_BASE_MS = 10_000;

export type ImportJob = { importId: string };

export const invoiceImportQueue = {
  name: INVOICE_IMPORT_QUEUE,
  defaultJobOptions: {
    attempts: MAX_IMPORT_ATTEMPTS,
    backoff: { type: 'exponential', delay: RETRY_BASE_MS },
    removeOnComplete: true,
    removeOnFail: true,
  },
} satisfies RegisterQueueOptions;
