import type { RegisterQueueOptions } from '@nestjs/bullmq';

export const MAIL_DISPATCH_QUEUE = 'mail-dispatch';
export const MAIL_SEND_QUEUE = 'mail-send';

export const DISPATCH_OUTBOX_JOB = 'dispatch-outbox';
export const SEND_EMAIL_JOB = 'send-email';

export const MAX_SEND_ATTEMPTS = 5;
const RETRY_BASE_MS = 60_000;

export type SendEmailJob = { emailId: string };

export const mailQueues = [
  {
    name: MAIL_DISPATCH_QUEUE,
    defaultJobOptions: { removeOnComplete: true, removeOnFail: 100 },
  },
  {
    name: MAIL_SEND_QUEUE,
    defaultJobOptions: {
      attempts: MAX_SEND_ATTEMPTS,
      backoff: { type: 'exponential', delay: RETRY_BASE_MS },
      removeOnComplete: true,
      removeOnFail: true,
    },
  },
] satisfies RegisterQueueOptions[];
