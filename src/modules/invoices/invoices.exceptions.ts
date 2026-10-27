import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

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

export class InvalidImportFileException extends BadRequestException {
  constructor(message: string) {
    super(message);
  }
}

export class DuplicateImportException extends ConflictException {
  constructor() {
    super('This file was already imported');
  }
}

export class ImportNotFoundException extends NotFoundException {
  constructor() {
    super('Import not found');
  }
}
