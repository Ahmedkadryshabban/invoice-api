import { ConflictException, UnauthorizedException } from '@nestjs/common';

export class EmailTakenException extends ConflictException {
  constructor() {
    super('Email is already registered');
  }
}

export class InvalidCredentialsException extends UnauthorizedException {
  constructor() {
    super('Invalid email or password');
  }
}
