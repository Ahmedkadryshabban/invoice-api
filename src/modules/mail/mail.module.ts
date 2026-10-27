import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MailDispatchProcessor } from './mail-dispatch.processor.ts';
import { MailSendProcessor } from './mail-send.processor.ts';
import { mailQueues } from './mail.queues.ts';
import { MailRepository } from './mail.repository.ts';
import { MailService } from './mail.service.ts';
import { mailerProvider } from './mailer.provider.ts';

@Module({
  imports: [BullModule.registerQueue(...mailQueues)],
  providers: [
    MailService,
    MailRepository,
    MailDispatchProcessor,
    MailSendProcessor,
    mailerProvider,
  ],
  exports: [MailService],
})
export class MailModule {}
