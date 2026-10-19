import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import type { Env } from '../../config/env.ts';

export const MAILER = Symbol('MAILER');

export type Mailer = ReturnType<typeof createMailer>;

function createMailer(config: ConfigService<Env, true>) {
  const port = config.get('MAIL_SMTP_PORT', { infer: true });
  return createTransport({
    host: config.get('MAIL_SMTP_HOST', { infer: true }),
    port,
    secure: port === 465,
    auth: {
      user: config.get('MAIL_SMTP_USER', { infer: true }),
      pass: config.get('MAIL_SMTP_PASSWORD', { infer: true }),
    },
  });
}

export const mailerProvider: Provider = {
  provide: MAILER,
  inject: [ConfigService],
  useFactory: createMailer,
};
