import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.ts';
import type { JwtPayload } from '../auth/jwt-auth.guard.ts';
import { CreateInvoiceDto, ListInvoicesDto } from './invoices.dto.ts';
import { InvoicesService } from './invoices.service.ts';

@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(user.sub, dto);
  }

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query() query: ListInvoicesDto) {
    return this.invoicesService.list(user.sub, query);
  }
}
