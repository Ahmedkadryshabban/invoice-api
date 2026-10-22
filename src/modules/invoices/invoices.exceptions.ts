import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

const MAX_REPORTED_ROW_ERRORS = 100;

export type ImportRowError = { row: number; field: string; message: string };

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

export class InvalidImportRowsException extends BadRequestException {
  constructor(errors: ImportRowError[]) {
    const invalidRows = new Set(errors.map((error) => error.row)).size;
    super({
      statusCode: 400,
      error: 'Bad Request',
      message: `${invalidRows} row(s) have invalid values, nothing was imported`,
      errors: errors.slice(0, MAX_REPORTED_ROW_ERRORS),
    });
  }
}

export class DuplicateImportException extends ConflictException {
  constructor() {
    super('This file was already imported');
  }
}
