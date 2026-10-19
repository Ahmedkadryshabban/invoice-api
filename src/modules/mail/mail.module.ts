import { Module } from '@nestjs/common';
import { MailRepository } from './mail.repository.ts';
import { MailService } from './mail.service.ts';
import { MailWorker } from './mail.worker.ts';
import { mailerProvider } from './mailer.provider.ts';

@Module({
  providers: [MailService, MailRepository, MailWorker, mailerProvider],
  exports: [MailService],
})
export class MailModule {}
