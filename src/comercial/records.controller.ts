import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CalendarEventsService, QuoteModelsService, QuoteTemplatesService, RefusalReasonsService, SalesActionsService } from './records.service.js';

const uid = (req: Request) => (req.user as { id: string }).id;
const list = (q?: string, inactive?: string, page?: string, orderBy?: string, desc?: string, from?: string, until?: string) => ({
  q: q?.trim() || undefined, exibirInativos: inactive === 'true', page: Number(page) || 1, orderBy, desc: desc === 'true', from, until,
});

@UseGuards(JwtAuthGuard)
@Controller('refusal-reasons')
export class RefusalReasonsController {
  constructor(private readonly service: RefusalReasonsService) {}
  @Get() list(@Query('q') q?: string, @Query('exibirInativos') i?: string, @Query('page') p?: string, @Query('orderBy') o?: string, @Query('desc') d?: string) { return this.service.list(list(q, i, p, o, d)); }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Post() create(@Body() b: { description?: string; usedWhen?: string }) { return this.service.create(b); }
  @Put(':id') update(@Param('id') id: string, @Body() b: { description?: string; usedWhen?: string }) { return this.service.update(id, b); }
  @Post(':id/activate') activate(@Param('id') id: string) { return this.service.setActive(id, true); }
  @Post(':id/inactivate') inactivate(@Param('id') id: string) { return this.service.setActive(id, false); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}

@UseGuards(JwtAuthGuard)
@Controller('sales-actions')
export class SalesActionsController {
  constructor(private readonly service: SalesActionsService, private readonly prisma: PrismaService) {}
  @Get() list(@Query('q') q?: string, @Query('exibirInativos') i?: string, @Query('page') p?: string, @Query('orderBy') o?: string, @Query('desc') d?: string, @Query('from') f?: string, @Query('until') u?: string) { return this.service.list(list(q, i, p, o, d, f, u)); }
  @Get('stats') stats() { return this.service.stats(); }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Post() async create(@Req() req: Request, @Body() b: Parameters<SalesActionsService['create']>[1]) {
    const user = await this.prisma.user.findUnique({ where: { id: uid(req) }, select: { name: true } });
    return this.service.create(user?.name ?? 'Usuário', b);
  }
  @Put(':id') update(@Param('id') id: string, @Body() b: Parameters<SalesActionsService['update']>[1]) { return this.service.update(id, b); }
  @Post(':id/activate') activate(@Param('id') id: string) { return this.service.setActive(id, true); }
  @Post(':id/inactivate') inactivate(@Param('id') id: string) { return this.service.setActive(id, false); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}

@UseGuards(JwtAuthGuard)
@Controller('quote-models')
export class QuoteModelsController {
  constructor(private readonly service: QuoteModelsService) {}
  @Get() list(@Query('q') q?: string, @Query('page') p?: string, @Query('desc') d?: string) { return this.service.list(list(q, undefined, p, undefined, d)); }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Post() create(@Body() b: { description?: string }) { return this.service.create(b.description); }
  @Patch(':id') update(@Param('id') id: string, @Body() b: { description?: string }) { return this.service.update(id, b.description); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}

@UseGuards(JwtAuthGuard)
@Controller('quote-templates')
export class QuoteTemplatesController {
  constructor(private readonly service: QuoteTemplatesService) {}
  @Get() list(@Query('q') q?: string, @Query('exibirInativos') i?: string, @Query('page') p?: string, @Query('orderBy') o?: string, @Query('desc') d?: string) { return this.service.list(list(q, i, p, o, d)); }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Get(':id/file') async file(@Param('id') id: string, @Res() res: Response) {
    const { fileName, data } = await this.service.file(id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.send(data);
  }
  @Post() create(@Body() b: { description?: string; fileName?: string; fileBase64?: string }) { return this.service.create(b); }
  @Patch(':id') update(@Param('id') id: string, @Body() b: { description?: string }) { return this.service.update(id, b.description); }
  @Post(':id/activate') activate(@Param('id') id: string) { return this.service.setActive(id, true); }
  @Post(':id/inactivate') inactivate(@Param('id') id: string) { return this.service.setActive(id, false); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}

@UseGuards(JwtAuthGuard)
@Controller('calendar-events')
export class CalendarEventsController {
  constructor(private readonly service: CalendarEventsService, private readonly prisma: PrismaService) {}
  @Get() list(@Query('from') from?: string, @Query('until') until?: string, @Query('owners') owners?: string) { return this.service.list(from, until, owners ? owners.split(',') : undefined); }
  @Get('owners') owners() { return this.service.owners(); }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Post() async create(@Req() req: Request, @Body() b: Parameters<CalendarEventsService['create']>[1]) {
    const user = await this.prisma.user.findUnique({ where: { id: uid(req) }, select: { id: true, name: true } });
    return this.service.create({ id: user?.id ?? uid(req), name: user?.name ?? 'Usuário' }, b);
  }
  @Put(':id') update(@Param('id') id: string, @Body() b: Parameters<CalendarEventsService['update']>[1]) { return this.service.update(id, b); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}
