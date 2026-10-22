import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module.ts';
import { UsersModule } from '../users/users.module.ts';
import { InvoicesController } from './invoices.controller.ts';
import { InvoicesRepository } from './invoices.repository.ts';
import { InvoicesService } from './invoices.service.ts';

@Module({
  imports: [MailModule, UsersModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicesRepository],
  exports: [InvoicesRepository],
})
export class InvoicesModule {}
