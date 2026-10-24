import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { StockProductsService } from './stock-products.service.js';

@UseGuards(JwtAuthGuard)
@Controller('stock-products')
export class StockProductsController {
  constructor(private readonly service: StockProductsService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('orderBy') orderBy?: string,
    @Query('desc') desc?: string,
    @Query('brand') brand?: string,
    @Query('group') group?: string,
  ) {
    return this.service.list({ search, page: Number(page) || 1, orderBy, desc: desc === 'true', brand, group });
  }

  @Get('options')
  options() {
    return this.service.options();
  }

  @Get('filters')
  filters() {
    return this.service.filters();
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }
}
