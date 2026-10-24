import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { QuotesService, type QuoteInput, type QuoteItemInput } from './quotes.service.js';

const uid = (req: Request) => (req.user as { id: string }).id;

@UseGuards(JwtAuthGuard)
@Controller('quotes')
export class QuotesController {
  constructor(private readonly service: QuotesService) {}

  @Get()
  list(
    @Query('q') q?: string, @Query('from') from?: string, @Query('until') until?: string, @Query('status') status?: string, @Query('modality') modality?: string,
    @Query('personType') personType?: string, @Query('seller') seller?: string, @Query('reason') reason?: string, @Query('hideCancelled') hideCancelled?: string,
    @Query('page') page?: string, @Query('orderBy') orderBy?: string, @Query('desc') desc?: string,
  ) {
    return this.service.list({ q, from, until, status, modality, personType, seller, reason, hideCancelled: hideCancelled === 'true', page: Number(page) || 1, orderBy, desc: desc === undefined ? true : desc === 'true' });
  }

  @Get('indicators')
  indicators(@Query('month') month?: string) { return this.service.indicators(month); }

  @Get('stats')
  stats() { return this.service.stats(); }

  @Get('filters')
  filters() { return this.service.filters(); }

  @Get(':id')
  get(@Param('id') id: string) { return this.service.get(id); }

  @Post()
  create(@Req() req: Request, @Body() body: QuoteInput) { return this.service.create(uid(req), body); }

  @Put(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() body: QuoteInput) { return this.service.update(uid(req), id, body); }

  @Post(':id/items')
  addItem(@Param('id') id: string, @Body() body: QuoteItemInput) { return this.service.addItem(id, body); }

  @Put(':id/items/:itemId')
  updateItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() body: QuoteItemInput) { return this.service.updateItem(id, itemId, body); }

  @Post(':id/attachments')
  addAttachment(@Req() req: Request, @Param('id') id: string, @Body() body: { fileName?: string; caption?: string; mimeType?: string; fileBase64?: string }) { return this.service.addAttachment(uid(req), id, body); }

  @Get(':id/attachments/:attachmentId/file')
  async attachmentFile(@Param('id') id: string, @Param('attachmentId') attachmentId: string, @Res() res: Response) {
    const { fileName, mimeType, data } = await this.service.attachmentFile(id, attachmentId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.send(data);
  }

  @Delete(':id/attachments/:attachmentId')
  removeAttachment(@Req() req: Request, @Param('id') id: string, @Param('attachmentId') attachmentId: string) { return this.service.removeAttachment(uid(req), id, attachmentId); }

  @Delete(':id/items/:itemId')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string) { return this.service.removeItem(id, itemId); }

  @Post(':id/payments')
  addPayment(@Param('id') id: string, @Body() body: { method?: string; installments?: number }) { return this.service.addPayment(id, body); }

  @Delete(':id/payments/:paymentId')
  removePayment(@Param('id') id: string, @Param('paymentId') paymentId: string) { return this.service.removePayment(id, paymentId); }

  @Post(':id/win')
  win(@Req() req: Request, @Param('id') id: string, @Body() body: { paymentId?: string }) { return this.service.win(uid(req), id, body.paymentId); }

  @Post(':id/refuse')
  refuse(@Req() req: Request, @Param('id') id: string, @Body() body: { reason?: string }) { return this.service.refuse(uid(req), id, body.reason); }

  @Post(':id/open-work-order')
  openWorkOrder(@Req() req: Request, @Param('id') id: string) { return this.service.openWorkOrder(uid(req), id); }

  @Post(':id/cancel')
  cancel(@Req() req: Request, @Param('id') id: string) { return this.service.cancel(uid(req), id); }

  @Post(':id/duplicate')
  duplicate(@Req() req: Request, @Param('id') id: string) { return this.service.duplicate(uid(req), id); }

  @Post(':id/modality')
  modality(@Req() req: Request, @Param('id') id: string, @Body() body: { modality?: number }) { return this.service.switchModality(uid(req), id, Number(body.modality)); }
}
