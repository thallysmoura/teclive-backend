import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ContractsService } from './contracts.service.js';

@UseGuards(JwtAuthGuard)
@Controller('contracts')
export class ContractsController {
  constructor(private readonly service: ContractsService, private readonly prisma: PrismaService) {}

  private async userName(req: Request) {
    const u = await this.prisma.user.findUnique({ where: { id: (req.user as { id: string }).id }, select: { name: true } });
    return u?.name ?? 'Usuário';
  }

  @Get('lookups') lookups() { return this.service.lookups(); }

  @Get()
  list(@Query('q') q?: string, @Query('status') status?: string, @Query('page') page?: string, @Query('orderBy') orderBy?: string, @Query('desc') desc?: string) {
    return this.service.list({ q, status: status ? status.split(',').map(Number).filter((x) => !Number.isNaN(x)) : undefined, page: Number(page) || 1, orderBy, desc: desc !== 'false' });
  }

  @Get(':id') detail(@Param('id') id: string) { return this.service.detail(id); }
  @Post() async create(@Req() req: Request, @Body() body: Record<string, unknown>) { return this.service.create(body, await this.userName(req)); }
  @Put(':id') async update(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.service.update(id, body, await this.userName(req)); }
  @Delete(':id') async remove(@Param('id') id: string) { await this.service.remove(id); return { ok: true }; }

  @Post(':id/invoices') async addInvoice(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.service.addInvoice(id, body, await this.userName(req)); }
  @Put(':id/invoices/:invoiceId') async updateInvoice(@Req() req: Request, @Param('id') id: string, @Param('invoiceId') invoiceId: string, @Body() body: Record<string, unknown>) { return this.service.updateInvoice(id, invoiceId, body, await this.userName(req)); }
  @Delete(':id/invoices/:invoiceId') async removeInvoice(@Req() req: Request, @Param('id') id: string, @Param('invoiceId') invoiceId: string) { await this.service.removeInvoice(id, invoiceId, await this.userName(req)); return { ok: true }; }

  @Post(':id/invoices/:invoiceId/products') async addProduct(@Req() req: Request, @Param('id') id: string, @Param('invoiceId') invoiceId: string, @Body() body: Record<string, unknown>) { return this.service.addProduct(id, invoiceId, body, await this.userName(req)); }
  @Delete(':id/invoices/:invoiceId/products/:productId') async removeProduct(@Req() req: Request, @Param('id') id: string, @Param('invoiceId') invoiceId: string, @Param('productId') productId: string) { await this.service.removeProduct(id, invoiceId, productId, await this.userName(req)); return { ok: true }; }
}
