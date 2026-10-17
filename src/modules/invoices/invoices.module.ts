import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller.ts';
import { InvoicesRepository } from './invoices.repository.ts';
import { InvoicesService } from './invoices.service.ts';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicesRepository],
  exports: [InvoicesRepository],
})
export class InvoicesModule {}
