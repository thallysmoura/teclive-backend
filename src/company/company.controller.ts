import { Body, Controller, Get, Header, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { CompanyService } from './company.service.js';
import { CompanyDto } from './company.dto.js';
import { CompanyPermissionGuard } from './company-permission.guard.js';

@Controller('company')
@UseGuards(JwtAuthGuard)
export class CompanyController {
  constructor(private readonly company: CompanyService) {}
  @Get()
  @UseGuards(CompanyPermissionGuard)
  @Header('Cache-Control', 'no-store')
  get() { return this.company.get(); }
  @Put()
  @UseGuards(AdminGuard)
  @Header('Cache-Control', 'no-store')
  save(@Body() dto: CompanyDto) { return this.company.save(dto); }
}
