import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.ts';
import type { CreateInvoiceDto, ListInvoicesDto } from './invoices.dto.ts';
import { InvoicesRepository } from './invoices.repository.ts';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly invoicesRepository: InvoicesRepository,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async create(userId: string, dto: CreateInvoiceDto) {
    const invoice = await this.invoicesRepository.create({
      userId,
      customerEmail: dto.customerEmail,
      description: dto.description,
      amountCents: dto.amountCents,
      currency: dto.currency,
    });
    const publicUrl = this.config.get('PUBLIC_URL', { infer: true });
    return {
      ...invoice,
      paymentUrl: `${publicUrl}/v1/invoices/${invoice.id}/checkout`,
    };
  }

  async list(userId: string, { page, limit }: ListInvoicesDto) {
    const { items, total } = await this.invoicesRepository.listByUser(userId, {
      page,
      limit,
    });
    return { items, page, limit, total };
  }
}
