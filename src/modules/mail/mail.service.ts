import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.ts';
import type { Transaction } from '../../database/database.module.ts';
import type { EmailOutbox } from '../../database/schema/index.ts';
import { MailRepository } from './mail.repository.ts';
import { renderEmail, type EmailMessage } from './mail.templates.ts';
import { MAILER, type Mailer } from './mailer.provider.ts';

const BATCH_SIZE = 10;
const LEASE_SECONDS = 300;
const MAX_ATTEMPTS = 5;
const RETRY_BASE_SECONDS = 60;
const RATE_LIMIT_PAUSE_SECONDS = 10;

export type QueuedEmail = EmailMessage & { to: string; dedupeKey: string };

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailRepository: MailRepository,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly config: ConfigService<Env, true>,
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

  async sendDue(): Promise<void> {
    const emails = await this.mailRepository.claimDue(
      BATCH_SIZE,
      LEASE_SECONDS,
    );
    for (const [index, email] of emails.entries()) {
      const result = await this.send(email);
      if (result === 'throttled') {
        const waiting = emails.slice(index).map((queued) => queued.id);
        await this.mailRepository.releaseClaims(
          waiting,
          RATE_LIMIT_PAUSE_SECONDS,
        );
        this.logger.warn(
          `SMTP server is rate limiting, ${waiting.length} email(s) wait ${RATE_LIMIT_PAUSE_SECONDS}s`,
        );
        return;
      }
    }
  }

  private async send(
    email: EmailOutbox,
  ): Promise<'sent' | 'failed' | 'throttled'> {
    try {
      await this.mailer.sendMail({
        from: this.config.get('MAIL_FROM', { infer: true }),
        to: email.toEmail,
        subject: email.subject,
        text: email.bodyText,
        html: email.bodyHtml,
      });
    } catch (error) {
      if (isRateLimited(error)) return 'throttled';
      await this.handleFailure(email, error);
      return 'failed';
    }
    await this.mailRepository.markSent(email.id);
    this.logger.log(`Email ${email.id} (${email.template}) sent`);
    return 'sent';
  }

  private async handleFailure(email: EmailOutbox, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const code = errorCode(error);
    if (email.attempts >= MAX_ATTEMPTS) {
      await this.mailRepository.markFailed(email.id, message);
      this.logger.error(
        `Email ${email.id} (${email.template}) failed after ${email.attempts} attempts (${code})`,
      );
      return;
    }

    const delaySeconds = RETRY_BASE_SECONDS * 2 ** (email.attempts - 1);
    await this.mailRepository.scheduleRetry(email.id, delaySeconds, message);
    this.logger.warn(
      `Email ${email.id} (${email.template}) attempt ${email.attempts} failed (${code}), retrying in ${delaySeconds}s`,
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
