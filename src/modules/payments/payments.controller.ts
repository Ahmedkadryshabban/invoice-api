import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Redirect,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator.ts';
import { PaymentsService } from './payments.service.ts';

@Public()
@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('invoices/:id/checkout')
  @Redirect('', HttpStatus.SEE_OTHER)
  async checkout(@Param('id', ParseUUIDPipe) id: string) {
    return { url: await this.paymentsService.createCheckoutUrl(id) };
  }

  @Get('checkout/success')
  success() {
    return { message: 'Payment received. Thank you!' };
  }

  @Get('checkout/cancel')
  cancel() {
    return { message: 'Payment cancelled. You can open the link again.' };
  }

  @Post('webhooks/stripe')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    return this.paymentsService.handleWebhook(req.rawBody, signature);
  }
}
