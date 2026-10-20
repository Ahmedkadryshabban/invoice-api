import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module.ts';
import { MailModule } from '../mail/mail.module.ts';
import { PaymentsController } from './payments.controller.ts';
import { PaymentsService } from './payments.service.ts';
import { stripeProvider } from './stripe.provider.ts';

@Module({
  imports: [InvoicesModule, MailModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, stripeProvider],
})
export class PaymentsModule {}
