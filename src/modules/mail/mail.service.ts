import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { Env } from '../../config/env.ts';
import type { Transaction } from '../../database/database.module.ts';
import type { EmailOutbox } from '../../database/schema/index.ts';
import {
  MAIL_SEND_QUEUE,
  MAX_SEND_ATTEMPTS,
  SEND_EMAIL_JOB,
  type SendEmailJob,
} from './mail.queues.ts';
import { MailRepository } from './mail.repository.ts';
import { renderEmail, type EmailMessage } from './mail.templates.ts';
import { MAILER, type Mailer } from './mailer.provider.ts';

const DISPATCH_BATCH_SIZE = 1000;
const DISPATCH_LEASE_SECONDS = 30 * 60;

export type QueuedEmail = EmailMessage & { to: string; dedupeKey: string };

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailRepository: MailRepository,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly config: ConfigService<Env, true>,
    @InjectQueue(MAIL_SEND_QUEUE)
    private readonly sendQueue: Queue<SendEmailJob>,
  ) {}

  async enqueue(emails: QueuedEmail[], tx?: Transaction): Promise<void> {
    const rows = emails.map((email) => {
      const { subject, text, html } = renderEmail(email);
      return {
        dedupeKey: email.dedupeKey,
        toEmail: email.to,
        template: email.template,
        subject,
        bodyText: text,
        bodyHtml: html,
      };
    });
    await this.mailRepository.insertMany(rows, tx);
  }

  async dispatchDue(): Promise<void> {
    let dispatched = 0;
    let claimed: string[];
    do {
      claimed = await this.mailRepository.claimForDispatch(
        DISPATCH_BATCH_SIZE,
        DISPATCH_LEASE_SECONDS,
      );
      if (claimed.length > 0) {
        await this.sendQueue.addBulk(
          claimed.map((emailId) => ({
            name: SEND_EMAIL_JOB,
            data: { emailId },
            opts: { jobId: emailId },
          })),
        );
      }
      dispatched += claimed.length;
    } while (claimed.length === DISPATCH_BATCH_SIZE);
    if (dispatched > 0) {
      this.logger.log(`${dispatched} email(s) moved to the send queue`);
    }
  }

  async send(
    emailId: string,
    attempt: number,
  ): Promise<'sent' | 'skipped' | 'throttled'> {
    const email = await this.mailRepository.findPendingById(emailId);
    if (!email) return 'skipped';
    try {
      await this.mailer.send({
        id: email.id,
        from: this.config.get('MAIL_FROM', { infer: true }),
        to: email.toEmail,
        subject: email.subject,
        text: email.bodyText,
        html: email.bodyHtml,
      });
    } catch (error) {
      if (isRateLimited(error)) return 'throttled';
      await this.handleFailure(email, attempt, error);
      throw error;
    }
    await this.mailRepository.markSent(email.id, attempt);
    this.logger.log(`Email ${email.id} (${email.template}) sent`);
    return 'sent';
  }

  private async handleFailure(
    email: EmailOutbox,
    attempt: number,
    error: unknown,
  ) {
    const message = error instanceof Error ? error.message : String(error);
    const code = errorCode(error);
    if (attempt >= MAX_SEND_ATTEMPTS) {
      await this.mailRepository.markFailed(email.id, attempt, message);
      this.logger.error(
        `Email ${email.id} (${email.template}) failed after ${attempt} attempts (${code})`,
      );
      return;
    }

    await this.mailRepository.recordFailure(email.id, attempt, message);
    this.logger.warn(
      `Email ${email.id} (${email.template}) attempt ${attempt} failed (${code}), it will be retried`,
    );
  }
}

function isRateLimited(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  const responseCode =
    typeof error === 'object' && error !== null && 'responseCode' in error
      ? Number(error.responseCode)
      : undefined;
  return responseCode === 421 || /too many/i.test(message);
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String(error.code);
  }
  return 'UNKNOWN';
}
