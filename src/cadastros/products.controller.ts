import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ProductsService, type ProductInput } from './products.service.js';

@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  list(@Query('q') q?: string, @Query('exibirInativos') inactive?: string, @Query('type') brand?: string, @Query('role') group?: string, @Query('page') page?: string, @Query('orderBy') orderBy?: string, @Query('desc') desc?: string) {
    return this.service.list({ q, exibirInativos: inactive === 'true', brand, group, page: Number(page) || 1, orderBy, desc: desc === 'true' });
  }

  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @Get('units')
  units() {
    return this.service.units();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body() body: ProductInput) {
    return this.service.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: ProductInput) {
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
