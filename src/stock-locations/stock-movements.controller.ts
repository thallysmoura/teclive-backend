import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { StockMovementsService, type MovementItemInput } from './stock-movements.service.js';

@UseGuards(JwtAuthGuard)
@Controller('stock-movements')
export class StockMovementsController {
  constructor(private readonly service: StockMovementsService) {}

  @Get()
  list(
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('until') until?: string,
    @Query('hideCancelled') hideCancelled?: string,
    @Query('page') page?: string,
    @Query('orderBy') orderBy?: string,
    @Query('desc') desc?: string,
  ) {
    return this.service.list({ q, from, until, hideCancelled: hideCancelled === 'true', page: Number(page) || 1, orderBy, desc: desc === undefined ? true : desc === 'true' });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Req() req: Request, @Body() body: { description?: string; movementDate?: string; items?: MovementItemInput[] }) {
    const { id } = req.user as { id: string };
    return this.service.create(id, body);
  }
}
