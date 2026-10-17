import { ConflictException, NotFoundException } from '@nestjs/common';

export class InvoiceNotFoundException extends NotFoundException {
  constructor() {
    super('Invoice not found');
  }
}

export class InvoiceAlreadyPaidException extends ConflictException {
  constructor() {
    super('Invoice is already paid');
  }
}
