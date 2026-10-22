type InvoiceDetails = {
  description: string;
  amountCents: number;
  currency: string;
};

export type EmailMessage =
  | { template: 'invoice_paid'; data: InvoiceDetails & { paidAt: Date } }
  | {
      template: 'payment_failed';
      data: InvoiceDetails & { paymentUrl: string; reason: string };
    }
  | {
      template: 'checkout_expired';
      data: InvoiceDetails & { paymentUrl: string };
    }
  | {
      template: 'import_completed';
      data: {
        fileName: string;
        importedCount: number;
        totals: { currency: string; amountCents: number }[];
        invoices: (InvoiceDetails & { customerEmail: string })[];
      };
    };

export type RenderedEmail = { subject: string; text: string; html: string };

export function renderEmail(message: EmailMessage): RenderedEmail {
  switch (message.template) {
    case 'invoice_paid': {
      const { data } = message;
      return build(`Payment received: ${data.description}`, [
        `We received your payment of ${formatMoney(data)} for "${data.description}" on ${formatDate(data.paidAt)}.`,
        'Thank you!',
      ]);
    }
    case 'payment_failed': {
      const { data } = message;
      return build(
        `Your payment did not go through: ${data.description}`,
        [
          `Your payment of ${formatMoney(data)} for "${data.description}" failed: ${data.reason}`,
          'You can try again with this link:',
        ],
        data.paymentUrl,
      );
    }
    case 'checkout_expired': {
      const { data } = message;
      return build(
        `Your payment link expired: ${data.description}`,
        [
          `Your checkout for "${data.description}" (${formatMoney(data)}) expired before it was paid. The invoice is still open.`,
          'You can pay it with this link:',
        ],
        data.paymentUrl,
      );
    }
    case 'import_completed': {
      const { data } = message;
      const paragraphs = [
        `Your file "${data.fileName}" was imported. ${data.importedCount} invoices were recorded as paid.`,
        `Total: ${data.totals.map(formatMoney).join(', ')}`,
        ...data.invoices
          .slice(0, 10)
          .map(
            (invoice) =>
              `${invoice.customerEmail}: ${invoice.description} (${formatMoney(invoice)})`,
          ),
      ];
      if (data.invoices.length > 10) {
        paragraphs.push(`...and ${data.invoices.length - 10} more.`);
      }
      return build(
        `Import completed: ${data.importedCount} invoices recorded as paid`,
        paragraphs,
      );
    }
  }
}

function build(
  subject: string,
  paragraphs: string[],
  link?: string,
): RenderedEmail {
  const lines = link ? [...paragraphs, link] : paragraphs;
  const htmlParagraphs = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`);
  if (link) {
    const href = escapeHtml(link);
    htmlParagraphs.push(`<p><a href="${href}">${href}</a></p>`);
  }
  return {
    subject,
    text: lines.join('\n\n'),
    html: htmlParagraphs.join('\n'),
  };
}

function formatMoney({
  amountCents,
  currency,
}: Pick<InvoiceDetails, 'amountCents' | 'currency'>): string {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
