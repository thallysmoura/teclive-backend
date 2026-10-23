import { Controller, Get, Header, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AccessLogsPermissionGuard } from './access-logs-permission.guard.js';
import { AccessLogsService } from './access-logs.service.js';
import { AccessLogsQueryDto } from './access-logs-query.dto.js';

@Controller('access-logs')
@UseGuards(JwtAuthGuard, AccessLogsPermissionGuard)
export class AccessLogsController {
  constructor(private readonly logs: AccessLogsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: AccessLogsQueryDto) {
    if (query.from && query.until && new Date(query.from) >= new Date(query.until)) throw new BadRequestException('Período inválido.');
    return this.logs.list(query.page, query);
  }
}
