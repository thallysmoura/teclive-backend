import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LOOKUP_KINDS, LookupsService, type LookupKind } from './lookups.service.js';
import { ServiceOrdersService, type OsInput } from './service-orders.service.js';

const kindOf = (kind: string): LookupKind => {
  if (!LOOKUP_KINDS.includes(kind as LookupKind)) throw new BadRequestException('Cadastro inválido.');
  return kind as LookupKind;
};

@UseGuards(JwtAuthGuard)
@Controller('op')
export class LookupsController {
  constructor(private readonly service: LookupsService) {}
  @Get('options') options() { return this.service.options(); }
  @Get(':kind') list(@Param('kind') kind: string, @Query('q') q?: string, @Query('exibirInativos') i?: string, @Query('page') p?: string, @Query('orderBy') o?: string, @Query('desc') d?: string) {
    return this.service.list(kindOf(kind), { q: q?.trim() || undefined, exibirInativos: i === 'true', page: Number(p) || 1, orderBy: o, desc: d === 'true' });
  }
  @Get(':kind/:id') get(@Param('kind') kind: string, @Param('id') id: string) { return this.service.get(kindOf(kind), id); }
  @Post(':kind') create(@Param('kind') kind: string, @Body() b: Record<string, never>) { return this.service.create(kindOf(kind), b); }
  @Put(':kind/:id') update(@Param('kind') kind: string, @Param('id') id: string, @Body() b: Record<string, never>) { return this.service.update(kindOf(kind), id, b); }
  @Post(':kind/:id/activate') activate(@Param('kind') kind: string, @Param('id') id: string) { return this.service.setActive(kindOf(kind), id, true); }
  @Post(':kind/:id/inactivate') inactivate(@Param('kind') kind: string, @Param('id') id: string) { return this.service.setActive(kindOf(kind), id, false); }
  @Delete(':kind/:id') remove(@Param('kind') kind: string, @Param('id') id: string) { return this.service.remove(kindOf(kind), id); }
}

@UseGuards(JwtAuthGuard)
@Controller('service-orders')
export class ServiceOrdersController {
  constructor(private readonly service: ServiceOrdersService, private readonly prisma: PrismaService) {}

  private async user(req: Request) {
    const u = await this.prisma.user.findUnique({ where: { id: (req.user as { id: string }).id }, select: { name: true } });
    return u?.name ?? 'Usuário';
  }

  private async me(req: Request) {
    const id = (req.user as { id: string }).id;
    const u = await this.prisma.user.findUnique({ where: { id }, select: { name: true, role: true } });
    return { id, name: u?.name ?? 'Usuário', role: u?.role ?? 'USER' };
  }

  @Get() list(
    @Query('q') q?: string, @Query('from') from?: string, @Query('until') until?: string, @Query('status') status?: string, @Query('type') type?: string, @Query('technician') technician?: string,
    @Query('seller') seller?: string, @Query('defect') defect?: string, @Query('cause') cause?: string, @Query('solution') solution?: string, @Query('hideCancelled') hide?: string,
    @Query('page') page?: string, @Query('orderBy') orderBy?: string, @Query('desc') desc?: string,
  ) {
    return this.service.list({ q: q?.trim() || undefined, from, until, status, type, technician, seller, defect, cause, solution, hideCancelled: hide === 'true', page: Number(page) || 1, orderBy, desc: desc === undefined ? true : desc === 'true' });
  }
  @Get('stats') stats() { return this.service.stats(); }
  @Get('filters') filters() { return this.service.filters(); }
  @Get('board') board() { return this.service.board(); }
  @Get('schedule') schedule(@Query('from') from?: string, @Query('until') until?: string) { return this.service.schedule(from, until); }
  @Get('works') works() { return this.service.works(); }
  @Get('management') management() { return this.service.management(); }
  @Post('from-quote/:quoteId') async fromQuote(@Req() req: Request, @Param('quoteId') quoteId: string) { return this.service.createFromQuote(await this.user(req), quoteId); }
  @Get('operations') operations() { return this.service.operations(); }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Post() async create(@Req() req: Request, @Body() b: OsInput) { return this.service.create(await this.user(req), b); }
  @Put(':id') async update(@Req() req: Request, @Param('id') id: string, @Body() b: OsInput) { return this.service.update(await this.user(req), id, b); }
  @Get(':id/comments') comments(@Param('id') id: string) { return this.service.comments(id); }
  @Post(':id/comments') async comment(@Req() req: Request, @Param('id') id: string, @Body() b: { text?: string; fileIds?: string[] }) { return this.service.comment(await this.me(req), id, b ?? {}); }
  @Put(':id/comments/:eventId') async editComment(@Req() req: Request, @Param('id') id: string, @Param('eventId') eventId: string, @Body() b: { text?: string }) { return this.service.editComment(await this.me(req), id, eventId, b?.text); }
  @Delete(':id/comments/:eventId') async deleteComment(@Req() req: Request, @Param('id') id: string, @Param('eventId') eventId: string) { return this.service.deleteComment(await this.me(req), id, eventId); }
  @Post(':id/files') async upload(@Req() req: Request, @Param('id') id: string, @Body() b: { fileName?: string; mimeType?: string; fileBase64?: string }) { return this.service.uploadFile(await this.me(req), id, b ?? {}); }
  @Post(':id/videos') async uploadVideo(@Req() req: Request, @Param('id') id: string) {
    const body = req.body as unknown;
    if (!Buffer.isBuffer(body)) throw new BadRequestException('Envie um vídeo MP4, WEBM ou MOV.');
    return this.service.uploadVideo(await this.me(req), id, { fileName: decodeURIComponent(String(req.headers['x-file-name'] ?? 'video')), mimeType: req.headers['content-type'], data: body });
  }
  @Get(':id/files/:fileId') async file(@Param('id') id: string, @Param('fileId') fileId: string, @Res() res: Response) {
    const { fileName, mimeType, data } = await this.service.file(id, fileId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.send(data);
  }
  @Post(':id/items') async addItem(@Req() req: Request, @Param('id') id: string, @Body() b: Parameters<ServiceOrdersService['addItem']>[2]) { return this.service.addItem(await this.user(req), id, b); }
  @Delete(':id/items/:itemId') async removeItem(@Req() req: Request, @Param('id') id: string, @Param('itemId', ParseIntPipe) itemId: number) { return this.service.removeItem(await this.user(req), id, itemId); }
  @Post(':id/items/:itemId/deliver') async deliver(@Req() req: Request, @Param('id') id: string, @Param('itemId', ParseIntPipe) itemId: number, @Body() b: { quantity?: number }) { return this.service.deliver(await this.user(req), id, itemId, b?.quantity); }
  @Post(':id/close') async close(@Req() req: Request, @Param('id') id: string, @Body() b: { cause?: string; solution?: string }) { return this.service.close(await this.user(req), id, b ?? {}); }
  @Post(':id/cancel') async cancel(@Req() req: Request, @Param('id') id: string) { return this.service.cancel(await this.user(req), id); }
  @Post(':id/reopen') async reopen(@Req() req: Request, @Param('id') id: string) { return this.service.reopen(await this.user(req), id); }
  @Post(':id/interrupt') async interrupt(@Req() req: Request, @Param('id') id: string) { return this.service.interrupt(await this.user(req), id); }
}
