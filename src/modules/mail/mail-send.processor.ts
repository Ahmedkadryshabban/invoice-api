import { Processor, WorkerHost } from '@nestjs/bullmq';
import {
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimitError, type Job } from 'bullmq';
import type { Env } from '../../config/env.ts';
import { MAIL_SEND_QUEUE, type SendEmailJob } from './mail.queues.ts';
import { MailService } from './mail.service.ts';

const SMTP_CONCURRENCY = 1;
const FILE_CONCURRENCY = 20;
const RATE_LIMIT_PAUSE_MS = 10_000;

@Processor(MAIL_SEND_QUEUE)
export class MailSendProcessor
  extends WorkerHost
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(MailSendProcessor.name);

  constructor(
    private readonly mailService: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  onApplicationBootstrap() {
    this.worker.concurrency =
      this.config.get('MAIL_TRANSPORT', { infer: true }) === 'file'
        ? FILE_CONCURRENCY
        : SMTP_CONCURRENCY;
  }

  async onModuleDestroy() {
    await this.worker.close();
  }

  async process(job: Job<SendEmailJob>): Promise<void> {
    const result = await this.mailService.send(
      job.data.emailId,
      job.attemptsMade + 1,
    );
    if (result === 'throttled') {
      this.logger.warn(
        `SMTP server is rate limiting, sending pauses for ${RATE_LIMIT_PAUSE_MS / 1000}s`,
      );
      await this.worker.rateLimit(RATE_LIMIT_PAUSE_MS);
      throw new RateLimitError();
    }
  }
}
