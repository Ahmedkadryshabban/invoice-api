import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { UsersRepository } from '../users/users.repository.ts';
import type { LoginDto, RegisterDto } from './auth.dto.ts';
import {
  EmailTakenException,
  InvalidCredentialsException,
} from './auth.exceptions.ts';
import type { JwtPayload } from './jwt-auth.guard.ts';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const passwordHash = await argon2.hash(dto.password);
    const user = await this.usersRepository.create({
      email: dto.email,
      passwordHash,
    });
    if (!user) throw new EmailTakenException();
    return { id: user.id, email: user.email };
  }

  async login(dto: LoginDto) {
    const user = await this.usersRepository.findByEmail(dto.email);
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new InvalidCredentialsException();
    }
    const payload: JwtPayload = { sub: user.id };
    return { accessToken: await this.jwtService.signAsync(payload) };
  }
}
