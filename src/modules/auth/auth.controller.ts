import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { LoginDto, RegisterDto } from './auth.dto.ts';
import { AuthService } from './auth.service.ts';
import { Public } from './public.decorator.ts';

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
