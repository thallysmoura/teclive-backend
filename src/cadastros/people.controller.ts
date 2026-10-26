import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PeopleService, type PersonInput } from './people.service.js';

@UseGuards(JwtAuthGuard)
@Controller('people')
export class PeopleController {
  constructor(private readonly service: PeopleService, private readonly prisma: PrismaService) {}

  /** Relatório de Cadastro de Pessoas (declarado antes de ':id'). */
  @Get('report')
  async report(@Req() req: Request, @Query('personType') personType?: string, @Query('taxpayer') taxpayer?: string, @Query('registerType') registerType?: string, @Query('inactive') inactive?: string) {
    const me = await this.prisma.user.findUnique({ where: { id: (req.user as { id: string }).id }, select: { name: true } });
    return this.service.report({ personType, taxpayer, registerType, inactive: inactive === 'true' }, me?.name ?? '');
  }

  @Get()
  list(@Query('q') q?: string, @Query('exibirInativos') inactive?: string, @Query('role') role?: string, @Query('type') type?: string, @Query('page') page?: string, @Query('orderBy') orderBy?: string, @Query('desc') desc?: string) {
    return this.service.list({ q, exibirInativos: inactive === 'true', role, type, page: Number(page) || 1, orderBy, desc: desc === 'true' });
  }

  @Get('sellers')
  sellers() {
    return this.service.sellers();
  }

  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body() body: PersonInput) {
    return this.service.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: PersonInput) {
    return this.service.update(id, body);
  }

  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.service.setActive(id, true);
  }

  @Post(':id/inactivate')
  inactivate(@Param('id') id: string) {
    return this.service.setActive(id, false);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
