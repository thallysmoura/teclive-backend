import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ServicesService, type ServiceInput } from './services.service.js';

@UseGuards(JwtAuthGuard)
@Controller('services')
export class ServicesController {
  constructor(private readonly service: ServicesService) {}

  @Get()
  list(@Query('q') q?: string, @Query('exibirInativos') inactive?: string, @Query('type') type?: string, @Query('role') category?: string, @Query('page') page?: string, @Query('orderBy') orderBy?: string, @Query('desc') desc?: string) {
    return this.service.list({ q, exibirInativos: inactive === 'true', type, category, page: Number(page) || 1, orderBy, desc: desc === 'true' });
  }

  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @Get('categories')
  categories() {
    return this.service.categories();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body() body: ServiceInput) {
    return this.service.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: ServiceInput) {
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
