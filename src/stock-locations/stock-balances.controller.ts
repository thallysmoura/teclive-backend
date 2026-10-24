import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { StockBalancesService } from './stock-balances.service.js';

@UseGuards(JwtAuthGuard)
@Controller('stock-balances')
export class StockBalancesController {
  constructor(private readonly service: StockBalancesService) {}

  @Get()
  list(@Query('from') from?: string, @Query('until') until?: string) {
    return this.service.list({ from, until });
  }

  @Post()
  create(@Req() req: Request, @Body() body: { locationId?: string; filterType?: string; filterIds?: string[] }) {
    const { id } = req.user as { id: string };
    return this.service.create(id, body);
  }
}
