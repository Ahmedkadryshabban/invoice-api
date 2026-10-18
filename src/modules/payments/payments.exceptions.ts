import { BadRequestException, ConflictException } from '@nestjs/common';

export class InvalidWebhookSignatureException extends BadRequestException {
  constructor() {
    super('Invalid Stripe signature');
  }
}

export class CheckoutInProgressException extends ConflictException {
  constructor() {
    super('A payment for this invoice is already in progress');
  }
}
