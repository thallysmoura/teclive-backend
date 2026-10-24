import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PeopleService, type PersonInput } from './people.service.js';

/** Prospects: pessoas ainda não convertidas em cliente (isLead = true). */
@UseGuards(JwtAuthGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly service: PeopleService) {}

  @Get()
  list(@Query('q') q?: string, @Query('exibirInativos') inactive?: string, @Query('type') type?: string, @Query('page') page?: string, @Query('orderBy') orderBy?: string, @Query('desc') desc?: string) {
    return this.service.list({ q, exibirInativos: inactive === 'true', lead: true, type, page: Number(page) || 1, orderBy, desc: desc === 'true' });
  }

  @Get('stats')
  stats() { return this.service.leadStats(); }

  @Get('options')
  options(@Query('q') q?: string) {
    return this.service.clientOptions(q);
  }

  @Get(':id')
  get(@Param('id') id: string) { return this.service.get(id); }

  @Post()
  create(@Body() body: PersonInput) { return this.service.create(body, true); }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: PersonInput) { return this.service.update(id, body); }

  @Post(':id/convert')
  convert(@Param('id') id: string) { return this.service.convertLead(id); }

  @Post(':id/activate')
  activate(@Param('id') id: string) { return this.service.setActive(id, true); }

  @Post(':id/inactivate')
  inactivate(@Param('id') id: string) { return this.service.setActive(id, false); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
