import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { Env } from '../../config/env.ts';
import {
  InvoiceAlreadyPaidException,
  InvoiceNotFoundException,
} from '../invoices/invoices.exceptions.ts';
import { InvoicesRepository } from '../invoices/invoices.repository.ts';
import {
  CheckoutInProgressException,
  InvalidWebhookSignatureException,
} from './payments.exceptions.ts';
import { STRIPE } from './stripe.provider.ts';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(STRIPE) private readonly stripe: Stripe,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async createCheckoutUrl(invoiceId: string): Promise<string> {
    const invoice = await this.invoicesRepository.findById(invoiceId);
    if (!invoice) throw new InvoiceNotFoundException();
    if (invoice.status === 'paid') throw new InvoiceAlreadyPaidException();
    if (invoice.stripeSessionId) {
      await this.closeSession(invoice.stripeSessionId);
    }

    const publicUrl = this.config.get('PUBLIC_URL', { infer: true });
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: invoice.customerEmail,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: invoice.currency,
            unit_amount: invoice.amountCents,
            product_data: { name: invoice.description },
          },
        },
      ],
      metadata: { invoiceId: invoice.id },
      success_url: `${publicUrl}/v1/checkout/success`,
      cancel_url: `${publicUrl}/v1/checkout/cancel`,
    });
    if (!session.url) {
      throw new Error(`Checkout session ${session.id} has no url`);
    }

    const updated = await this.invoicesRepository.replaceStripeSession(
      invoice.id,
      invoice.stripeSessionId,
      session.id,
    );
    if (!updated) {
      await this.stripe.checkout.sessions.expire(session.id);
      throw new CheckoutInProgressException();
    }
    return session.url;
  }

  private async closeSession(sessionId: string) {
    try {
      await this.stripe.checkout.sessions.expire(sessionId);
    } catch (error) {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      if (session.status === 'complete') {
        throw new CheckoutInProgressException();
      }
      if (session.status !== 'expired') throw error;
    }
  }

  async handleWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<{ received: true }> {
    if (!rawBody || !signature) throw new InvalidWebhookSignatureException();

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.config.get('STRIPE_WEBHOOK_SECRET', { infer: true }),
      );
    } catch {
      throw new InvalidWebhookSignatureException();
    }

    if (event.type === 'checkout.session.completed') {
      await this.handleCheckoutCompleted(event.data.object);
    }
    return { received: true };
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const invoiceId = session.metadata?.invoiceId;
    if (!invoiceId || session.payment_status !== 'paid') {
      this.logger.warn(
        `Ignoring session ${session.id} (invoiceId=${invoiceId}, payment_status=${session.payment_status})`,
      );
      return;
    }

    const invoice = await this.invoicesRepository.markPaid(
      invoiceId,
      session.id,
    );
    if (invoice) {
      this.logger.log(`Invoice ${invoiceId} paid by session ${session.id}`);
    } else {
      this.logger.warn(
        `Invoice ${invoiceId} is not pending, session ${session.id} ignored (possible duplicate payment)`,
      );
    }
  }
}
