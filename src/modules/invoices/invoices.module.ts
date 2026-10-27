import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module.ts';
import { InvoiceImportProcessor } from './invoice-import.processor.ts';
import { InvoicesController } from './invoices.controller.ts';
import { invoiceImportQueue } from './invoices.queues.ts';
import { InvoicesRepository } from './invoices.repository.ts';
import { InvoicesService } from './invoices.service.ts';

@Module({
  imports: [MailModule, BullModule.registerQueue(invoiceImportQueue)],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicesRepository, InvoiceImportProcessor],
  exports: [InvoicesRepository],
})
export class InvoicesModule {}
