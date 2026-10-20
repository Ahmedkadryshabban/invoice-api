import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { Env } from '../../config/env.ts';
import { DB, type Database } from '../../database/database.module.ts';
import type { Invoice } from '../../database/schema/index.ts';
import {
  InvoiceAlreadyPaidException,
  InvoiceNotFoundException,
} from '../invoices/invoices.exceptions.ts';
import { InvoicesRepository } from '../invoices/invoices.repository.ts';
import { MailService } from '../mail/mail.service.ts';
import {
  CheckoutInProgressException,
  InvalidWebhookSignatureException,
} from './payments.exceptions.ts';
import { STRIPE } from './stripe.provider.ts';

const EXPIRY_CLOCK_SKEW_MS = 5 * 60_000;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(STRIPE) private readonly stripe: Stripe,
    @Inject(DB) private readonly db: Database,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly mailService: MailService,
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
      payment_intent_data: { metadata: { invoiceId: invoice.id } },
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

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object);
        break;
      case 'checkout.session.expired':
        await this.handleCheckoutExpired(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentFailed(event.id, event.data.object);
        break;
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

    const invoice = await this.db.transaction(async (tx) => {
      const paid = await this.invoicesRepository.markPaid(
        invoiceId,
        session.id,
        tx,
      );
      if (paid) {
        await this.mailService.enqueue(
          [
            {
              to: paid.customerEmail,
              dedupeKey: `invoice-paid:${paid.id}`,
              template: 'invoice_paid',
              data: {
                ...invoiceDetails(paid),
                paidAt: paid.paidAt ?? new Date(),
              },
            },
          ],
          tx,
        );
      }
      return paid;
    });
    if (invoice) {
      this.logger.log(`Invoice ${invoiceId} paid by session ${session.id}`);
    } else {
      this.logger.warn(
        `Invoice ${invoiceId} is not pending, session ${session.id} ignored (possible duplicate payment)`,
      );
    }
  }

  private async handleCheckoutExpired(session: Stripe.Checkout.Session) {
    const invoiceId = session.metadata?.invoiceId;
    if (!invoiceId) return;

    if (session.expires_at * 1000 > Date.now() + EXPIRY_CLOCK_SKEW_MS) {
      this.logger.log(
        `Session ${session.id} was closed before its expiry (replaced by a newer link), no email`,
      );
      return;
    }

    const invoice = await this.invoicesRepository.findById(invoiceId);
    if (
      !invoice ||
      invoice.status === 'paid' ||
      invoice.stripeSessionId !== session.id
    ) {
      this.logger.log(
        `Session ${session.id} expired but invoice ${invoiceId} needs no email`,
      );
      return;
    }

    await this.mailService.enqueue([
      {
        to: invoice.customerEmail,
        dedupeKey: `checkout-expired:${session.id}`,
        template: 'checkout_expired',
        data: {
          ...invoiceDetails(invoice),
          paymentUrl: this.paymentUrl(invoice.id),
        },
      },
    ]);
    this.logger.log(`Invoice ${invoiceId} checkout expired, email queued`);
  }

  private async handlePaymentFailed(
    eventId: string,
    paymentIntent: Stripe.PaymentIntent,
  ) {
    const invoiceId = paymentIntent.metadata?.invoiceId;
    if (!invoiceId) return;

    const invoice = await this.invoicesRepository.findById(invoiceId);
    if (!invoice || invoice.status === 'paid') {
      this.logger.log(
        `Payment ${paymentIntent.id} failed but invoice ${invoiceId} needs no email`,
      );
      return;
    }

    await this.mailService.enqueue([
      {
        to: invoice.customerEmail,
        dedupeKey: `payment-failed:${eventId}`,
        template: 'payment_failed',
        data: {
          ...invoiceDetails(invoice),
          paymentUrl: this.paymentUrl(invoice.id),
          reason:
            paymentIntent.last_payment_error?.message ??
            'The payment was declined.',
        },
      },
    ]);
    this.logger.log(`Invoice ${invoiceId} payment failed, email queued`);
  }

  private paymentUrl(invoiceId: string): string {
    const publicUrl = this.config.get('PUBLIC_URL', { infer: true });
    return `${publicUrl}/v1/invoices/${invoiceId}/checkout`;
  }
}

function invoiceDetails(invoice: Invoice) {
  return {
    description: invoice.description,
    amountCents: invoice.amountCents,
    currency: invoice.currency,
  };
}
