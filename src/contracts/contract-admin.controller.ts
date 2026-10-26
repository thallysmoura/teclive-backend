import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

const num = (v: unknown) => Number(v ?? 0);
const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const STAGES = 7;

/** Contrato > Grupos de Faturamento, Modelos, Reajuste, Bonificações/Despesas, Cancelamentos e Bloqueio por Inadimplência. */
@Controller('contract-admin')
@UseGuards(JwtAuthGuard)
export class ContractAdminController {
  constructor(private readonly prisma: PrismaService) {}

  private async me(req: Request) {
    const u = await this.prisma.user.findUnique({ where: { id: (req.user as { id: string }).id }, select: { name: true } });
    return u?.name ?? 'Usuário';
  }

  // ---- Grupos de faturamento
  @Get('groups') groups(@Query('q') q?: string, @Query('inactive') inactive?: string) {
    return this.prisma.billingGroup.findMany({ where: { ...(inactive === 'true' ? {} : { isActive: true }), ...(q ? { description: { contains: q, mode: 'insensitive' } } : {}) }, orderBy: { description: 'asc' }, select: { id: true, description: true, isActive: true } });
  }
  @Post('groups') async createGroup(@Body() b: { description?: string }) {
    const description = str(b.description, 120);
    if (!description) throw new BadRequestException('Informe a descrição do grupo.');
    return this.prisma.billingGroup.create({ data: { description }, select: { id: true, description: true, isActive: true } });
  }
  @Put('groups/:id') updateGroup(@Param('id') id: string, @Body() b: { description?: string; isActive?: boolean }) {
    const data: Prisma.BillingGroupUpdateInput = {};
    if (b.description !== undefined) { const d = str(b.description, 120); if (!d) throw new BadRequestException('Informe a descrição do grupo.'); data.description = d; }
    if (typeof b.isActive === 'boolean') data.isActive = b.isActive;
    return this.prisma.billingGroup.update({ where: { id }, data, select: { id: true, description: true, isActive: true } });
  }

  // ---- Modelos de contrato
  @Get('templates') templates(@Query('q') q?: string, @Query('inactive') inactive?: string) {
    return this.prisma.contractTemplate.findMany({ where: { ...(inactive === 'true' ? {} : { isActive: true }), ...(q ? { description: { contains: q, mode: 'insensitive' } } : {}) }, orderBy: { description: 'asc' } });
  }
  @Post('templates') createTemplate(@Body() b: { description?: string; type?: number }) {
    const description = str(b.description, 200);
    if (!description) throw new BadRequestException('Informe a descrição do modelo.');
    if (![0, 1, 2, 3].includes(num(b.type))) throw new BadRequestException('Selecione o tipo do modelo.');
    return this.prisma.contractTemplate.create({ data: { description, type: num(b.type) } });
  }
  @Put('templates/:id') updateTemplate(@Param('id') id: string, @Body() b: { description?: string; type?: number; isActive?: boolean }) {
    const data: Prisma.ContractTemplateUpdateInput = {};
    if (b.description !== undefined) data.description = str(b.description, 200);
    if (b.type !== undefined && [0, 1, 2, 3].includes(num(b.type))) data.type = num(b.type);
    if (typeof b.isActive === 'boolean') data.isActive = b.isActive;
    return this.prisma.contractTemplate.update({ where: { id }, data });
  }
  @Delete('templates/:id') async removeTemplate(@Param('id') id: string) { await this.prisma.contractTemplate.delete({ where: { id } }); return { ok: true }; }

  // ---- Reajuste de contratos
  @Get('adjustments') adjustments(@Query('q') q?: string) {
    return this.prisma.contractAdjustment.findMany({ where: q ? { userName: { contains: q, mode: 'insensitive' } } : {}, orderBy: { at: 'desc' }, take: 200 })
      .then((rows) => rows.map((r) => ({ ...r, percent: num(r.percent), valueBefore: num(r.valueBefore), valueAfter: num(r.valueAfter) })));
  }
  private async eligible(b: { months?: number; groupId?: string; index?: number; skipAdjusted?: boolean }) {
    const limit = new Date(); limit.setMonth(limit.getMonth() - Math.max(0, num(b.months)));
    const where: Prisma.ContractWhereInput = { status: 0, allowAdjust: true, startDate: { lte: limit }, ...(b.groupId ? { billingGroupId: b.groupId } : {}), ...(b.index ? { adjustIndex: num(b.index) } : {}) };
    if (b.skipAdjusted) { const year = new Date(); year.setFullYear(year.getFullYear() - 1); where.history = { none: { description: { startsWith: 'Reajuste' }, at: { gte: year } } }; }
    return this.prisma.contract.findMany({ where, orderBy: { number: 'asc' }, select: { id: true, number: true, personName: true, totalNet: true, adjustIndex: true, startDate: true } });
  }
  @Post('adjustments/search') async searchAdjust(@Body() b: { months?: number; groupId?: string; index?: number; skipAdjusted?: boolean }) {
    return (await this.eligible(b)).map((c) => ({ ...c, totalNet: num(c.totalNet) }));
  }
  @Post('adjustments') async applyAdjust(@Req() req: Request, @Body() b: { months?: number; groupId?: string; index?: number; skipAdjusted?: boolean; percent?: number; round?: boolean; contractIds?: string[] }) {
    const percent = num(b.percent);
    if (!(percent > 0) || percent > 100) throw new BadRequestException('Informe um percentual de reajuste entre 0 e 100.');
    const ids = new Set(b.contractIds ?? []);
    const list = (await this.eligible(b)).filter((c) => ids.has(c.id));
    if (!list.length) throw new BadRequestException('Selecione ao menos um contrato.');
    const user = await this.me(req);
    let before = 0, after = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const c of list) {
        const invoices = await tx.contractInvoice.findMany({ where: { contractId: c.id, canceled: false } });
        for (const inv of invoices) {
          let v = num(inv.netValue) * (1 + percent / 100);
          v = b.round ? Math.round(v) : Math.round(v * 100) / 100;
          await tx.contractInvoice.update({ where: { id: inv.id }, data: { netValue: v } });
        }
        const total = (await tx.contractInvoice.aggregate({ where: { contractId: c.id, canceled: false }, _sum: { netValue: true } }))._sum.netValue ?? 0;
        before += num(c.totalNet); after += num(total);
        await tx.contract.update({ where: { id: c.id }, data: { totalNet: total, totalGross: total } });
        await tx.contractHistory.create({ data: { contractId: c.id, description: `Reajuste de ${percent}% aplicado por '${user}'.`, userName: user } });
      }
    });
    const group = b.groupId ? (await this.prisma.billingGroup.findUnique({ where: { id: b.groupId }, select: { description: true } }))?.description ?? null : null;
    return this.prisma.contractAdjustment.create({ data: { userName: user, filterType: 'Contratos iniciados a mais de', months: num(b.months), indexId: b.index ? num(b.index) : null, groupName: group, percent, rounded: !!b.round, contractCount: list.length, valueBefore: before, valueAfter: after } });
  }

  // ---- Bonificações / despesas
  @Get('charges') charges(@Query('q') q?: string, @Query('canceled') canceled?: string, @Query('competence') competence?: string) {
    return this.prisma.contractCharge.findMany({ where: { ...(canceled === 'true' ? {} : { canceledAt: null }), ...(competence ? { competence } : {}), ...(q ? { OR: [{ personName: { contains: q, mode: 'insensitive' } }, { contractNo: { contains: q } }, { description: { contains: q, mode: 'insensitive' } }] } : {}) }, orderBy: { createdAt: 'desc' }, take: 300 })
      .then((rows) => rows.map((r) => ({ ...r, value: num(r.value) })));
  }
  @Post('charges') async createCharge(@Req() req: Request, @Body() b: { contractId?: string; kind?: number; competence?: string; description?: string; value?: number }) {
    const c = await this.prisma.contract.findUnique({ where: { id: String(b.contractId ?? '') }, select: { id: true, number: true, personName: true } });
    if (!c) throw new BadRequestException('Selecione o contrato.');
    if (!/^\d{4}-\d{2}$/.test(b.competence ?? '')) throw new BadRequestException('Informe a competência.');
    const description = str(b.description, 200), value = num(b.value);
    if (!description) throw new BadRequestException('Informe a descrição.');
    if (!(value > 0)) throw new BadRequestException('Informe um valor maior que zero.');
    return this.prisma.contractCharge.create({ data: { contractId: c.id, contractNo: c.number, personName: c.personName, kind: b.kind === 1 ? 1 : 0, competence: b.competence!, description, value, createdBy: await this.me(req) } });
  }
  @Post('charges/:id/cancel') cancelCharge(@Param('id') id: string) { return this.prisma.contractCharge.update({ where: { id }, data: { canceledAt: new Date() } }); }

  // ---- Central de cancelamento
  @Get('cancellations') async cancellations(@Query('q') q?: string) {
    const rows = await this.prisma.contractCancellation.findMany({ where: q ? { OR: [{ personName: { contains: q, mode: 'insensitive' } }, { contractNo: { contains: q } }] } : {}, orderBy: { createdAt: 'desc' }, take: 300 });
    return rows.map((r) => ({ ...r, fine: num(r.fine) }));
  }
  @Post('cancellations') async createCancellation(@Req() req: Request, @Body() b: { contractId?: string; reason?: string; effectiveDate?: string; fine?: number }) {
    const c = await this.prisma.contract.findUnique({ where: { id: String(b.contractId ?? '') }, select: { id: true, number: true, personName: true } });
    if (!c) throw new BadRequestException('Selecione o contrato.');
    const date = new Date(`${b.effectiveDate ?? ''}T12:00:00`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Informe a data do cancelamento.');
    const open = await this.prisma.contractCancellation.findFirst({ where: { contractId: c.id, stage: { lt: 5 } } });
    if (open) throw new BadRequestException('Este contrato já possui um cancelamento em andamento.');
    return this.prisma.contractCancellation.create({ data: { contractId: c.id, contractNo: c.number, personName: c.personName, stage: num(b.fine) > 0 ? 0 : 1, reason: str(b.reason, 1000) || null, effectiveDate: date, fine: num(b.fine), createdBy: await this.me(req) } });
  }
  @Put('cancellations/:id/stage') async moveCancellation(@Req() req: Request, @Param('id') id: string, @Body() b: { stage?: number }) {
    const stage = num(b.stage);
    if (!Number.isInteger(stage) || stage < 0 || stage >= STAGES) throw new BadRequestException('Etapa inválida.');
    const cur = await this.prisma.contractCancellation.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Cancelamento não encontrado.');
    const user = await this.me(req);
    if (stage === 6 && cur.stage !== 6) { // Finalizado: encerra o contrato
      await this.prisma.contract.update({ where: { id: cur.contractId }, data: { status: 1 } });
      await this.prisma.contractHistory.create({ data: { contractId: cur.contractId, description: `Contrato cancelado pela central de cancelamento, por '${user}'.`, userName: user } });
    }
    return this.prisma.contractCancellation.update({ where: { id }, data: { stage } });
  }

  // ---- Bloqueio por inadimplência (o sistema ainda não tem contas a receber: a busca devolve vazio)
  @Post('delinquency/search') delinquencySearch() { return []; }
  @Get('delinquency/blocks') delinquencyBlocks() { return this.prisma.delinquencyBlock.findMany({ orderBy: { at: 'desc' }, take: 200 }); }
}
