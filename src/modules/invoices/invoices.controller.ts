import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.ts';
import type { JwtPayload } from '../auth/jwt-auth.guard.ts';
import {
  MAX_IMPORT_FILE_BYTES,
  type ImportFile,
} from './invoice-import.parser.ts';
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

  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  importFile(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: ImportFile | undefined,
  ) {
    return this.invoicesService.importFromFile(user.sub, file);
  }
}
