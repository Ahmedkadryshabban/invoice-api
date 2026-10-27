import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import type { Env } from '../../config/env.ts';

export const MAILER = Symbol('MAILER');

const EMAIL_FILES_DIR = 'emails';

export type OutgoingEmail = {
  id: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type Mailer = { send(email: OutgoingEmail): Promise<void> };

function createSmtpMailer(config: ConfigService<Env, true>): Mailer {
  const port = config.get('MAIL_SMTP_PORT', { infer: true });
  const transport = createTransport({
    host: config.get('MAIL_SMTP_HOST', { infer: true }),
    port,
    secure: port === 465,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    auth: {
      user: config.get('MAIL_SMTP_USER', { infer: true }),
      pass: config.get('MAIL_SMTP_PASSWORD', { infer: true }),
    },
  });
  return {
    async send({ from, to, subject, text, html }) {
      await transport.sendMail({ from, to, subject, text, html });
    },
  };
}

function createFileMailer(): Mailer {
  return {
    async send({ id, from, to, subject, text }) {
      await mkdir(EMAIL_FILES_DIR, { recursive: true });
      const content = [
        `To: ${to}`,
        `From: ${from}`,
        `Subject: ${subject}`,
        `Date: ${new Date().toISOString()}`,
        '',
        text,
        '',
      ].join('\n');
      await writeFile(join(EMAIL_FILES_DIR, `${id}.txt`), content);
    },
  };
}

function createMailer(config: ConfigService<Env, true>): Mailer {
  return config.get('MAIL_TRANSPORT', { infer: true }) === 'file'
    ? createFileMailer()
    : createSmtpMailer(config);
}

export const mailerProvider: Provider = {
  provide: MAILER,
  inject: [ConfigService],
  useFactory: createMailer,
};
