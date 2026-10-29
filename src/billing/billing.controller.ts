import { BadRequestException, Body, Controller, Get, Header, NotFoundException, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { flagItems, pendingBillingRows, unflagInvoice, itemsOf } from './billing-rows.js';

const num = (v: unknown) => Number(v ?? 0);
const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const PAGE = 20;
const compOf = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCFullYear()).slice(2)}`;
const day = (s?: string, end = false) => { if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined; return new Date(`${s}T${end ? '23:59:59' : '00:00:00'}Z`); };
const range = (from?: string, to?: string) => ({ ...(day(from) ? { gte: day(from) } : {}), ...(day(to, true) ? { lte: day(to, true) } : {}) });
const xml = (s: unknown) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
const addressOf = (a: unknown) => {
  const x = (a ?? {}) as Record<string, string>;
  return [[x.logradouro, x.numero].filter(Boolean).join(', '), x.bairro, [x.cidade, x.uf].filter(Boolean).join(' - ')].filter(Boolean).join(' · ');
};

/** Faturamento: Central (faturas, NFS-e, NF-e, processamentos), faturamento de contratos/OS/produtos, notas de compra e devoluções. */
@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly prisma: PrismaService) {}

  private async me(req: Request) {
    const u = await this.prisma.user.findUnique({ where: { id: (req.user as { id: string }).id }, select: { id: true, name: true, role: true } });
    if (!u) throw new BadRequestException('Sessão inválida.');
    return u;
  }

  private async nextNumber() {
    const last = await this.prisma.invoice.aggregate({ _max: { number: true } });
    return (last._max.number ?? 0) + 1;
  }

  // ---------- Central: faturas ----------
  @Get('invoices')
  async invoices(@Query() q: { kind?: string; q?: string; from?: string; to?: string; sort?: string; desc?: string; page?: string; status?: string; origin?: string }) {
    const term = q.q?.trim();
    const where: Prisma.InvoiceWhereInput = {
      kind: q.kind === 'P' ? 'P' : 'S',
      ...(q.status ? { status: q.status } : {}), ...(q.origin ? { origin: q.origin } : {}),
      ...(q.from || q.to ? { registeredAt: range(q.from, q.to) } : {}),
      ...(term ? { OR: [{ personName: { contains: term, mode: 'insensitive' } }, { competence: { contains: term } }, ...(/^\d+$/.test(term) ? [{ number: Number(term) }] : [])] } : {}),
    };
    const dir = q.desc === 'false' ? 'asc' : 'desc';
    const orderBy: Prisma.InvoiceOrderByWithRelationInput = q.sort === 'total' ? { total: dir } : q.sort === 'client' ? { personName: dir } : q.sort === 'date' ? { registeredAt: dir } : { number: dir };
    const page = Math.max(1, num(q.page) || 1);
    const [rows, total] = await Promise.all([this.prisma.invoice.findMany({ where, orderBy, take: PAGE * page }), this.prisma.invoice.count({ where })]);
    return { lista: rows.map((r) => ({ ...r, total: num(r.total) })), total, hasMore: rows.length < total };
  }

  @Get('invoices/:id')
  async invoice(@Param('id') id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Fatura não encontrada.');
    const [person, nfse, nfe] = await Promise.all([
      inv.personId ? this.prisma.person.findUnique({ where: { id: inv.personId }, select: { id: true, name: true, document: true, type: true, email: true, phone: true, address: true, sellerName: true } }) : null,
      this.prisma.nfseRecord.findMany({ where: { invoiceNumber: inv.number }, orderBy: { rps: 'asc' } }),
      this.prisma.nfeRecord.findMany({ where: { invoiceNumber: inv.number }, orderBy: { number: 'asc' } }),
    ]);
    let order = null, contract = null;
    if (inv.origin === 'OS' && inv.originRef) {
      const o = await this.prisma.serviceOrder.findFirst({ where: { number: Number(inv.originRef) }, select: { id: true, number: true, closedAt: true, totalServices: true, totalProducts: true, sellers: true, defectName: true, address: true } });
      if (o) order = { id: o.id, number: o.number, closedAt: o.closedAt, services: num(o.totalServices), products: num(o.totalProducts), seller: o.sellers[0] ?? null, defect: o.defectName, address: addressOf(o.address) };
    }
    if (inv.origin === 'CONTRATO' && inv.originRef) {
      const c = await this.prisma.contract.findFirst({ where: { number: inv.originRef }, select: { id: true, number: true, billingDay: true, totalNet: true, sellerName: true } });
      if (c) contract = { ...c, totalNet: num(c.totalNet) };
    }
    return {
      ...inv, total: num(inv.total), person, order, contract, seller: order?.seller ?? contract?.sellerName ?? person?.sellerName ?? null,
      operation: inv.origin === 'OS' ? (inv.kind === 'P' ? 'Faturamento de Produtos da OS' : 'Faturamento de Serviços da OS') : inv.origin === 'CONTRATO' ? 'Faturamento de Contratos' : inv.kind === 'P' ? 'Faturamento de Produtos' : 'Faturamento de Serviços',
      nfse: nfse.map((n) => ({ ...n, total: num(n.total) })), nfe: nfe.map((n) => ({ ...n, total: n.total === null ? null : num(n.total) })),
    };
  }

  @Put('invoices/:id')
  async editInvoice(@Param('id') id: string, @Body() b: { description?: string; competence?: string }) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Fatura não encontrada.');
    if (inv.status === 'CANCELADA') throw new BadRequestException('Fatura cancelada não pode ser editada.');
    const data: Prisma.InvoiceUpdateInput = {};
    if (b.description !== undefined) data.description = str(b.description, 500) || null;
    if (b.competence !== undefined) { if (!/^\d{2}\/\d{2}$/.test(b.competence)) throw new BadRequestException('Competência no formato MM/AA.'); data.competence = b.competence; }
    await this.prisma.invoice.update({ where: { id }, data });
    return { ok: true };
  }

  @Post('invoices/:id/cancel')
  async cancelInvoice(@Param('id') id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Fatura não encontrada.');
    if (inv.status === 'CANCELADA') throw new BadRequestException('A fatura já está cancelada.');
    if (inv.nfseNumber || inv.nfeNumber) throw new BadRequestException('Esta fatura tem nota fiscal emitida. Cancele a nota antes de cancelar a fatura.');
    await this.prisma.invoice.update({ where: { id }, data: { status: 'CANCELADA', titleGenerated: false } });
    if (inv.origin === 'OS' && inv.originRef) {
      const o = await this.prisma.serviceOrder.findFirst({ where: { number: Number(inv.originRef) }, select: { id: true, detail: true } });
      if (o) { unflagInvoice(o.detail, inv.number); await this.prisma.serviceOrder.update({ where: { id: o.id }, data: { detail: o.detail as object } }); }
      await this.syncOrderStatus(Number(inv.originRef));
    }
    return { ok: true };
  }

  /** Mantém a situação da OS coerente com os itens faturados (Fechada, Faturada parcialmente ou Faturada). */
  private async syncOrderStatus(number: number) {
    const o = await this.prisma.serviceOrder.findFirst({ where: { number }, select: { id: true, status: true, detail: true } });
    if (!o || ![4, 5, 6].includes(o.status)) return;
    const billable = [...itemsOf(o.detail, 'S').filter((i) => !i.motivoNaoCobrar), ...itemsOf(o.detail, 'P').filter((i) => !i.motivoNaoCobrar)].filter((i) => num(i.valores?.total) > 0);
    const done = billable.filter((i) => i.faturado).length;
    const status = billable.length === 0 || done === billable.length ? 5 : done > 0 ? 6 : 4;
    if (status !== o.status) await this.prisma.serviceOrder.update({ where: { id: o.id }, data: { status } });
  }

  /** Fatura avulsa (serviços ou produtos), com itens digitados. */
  @Post('invoices')
  async createInvoice(@Req() req: Request, @Body() b: { kind?: string; personId?: string; competence?: string; description?: string; items?: { description?: string; quantity?: number; unitValue?: number; discount?: number }[] }) {
    const u = await this.me(req);
    const person = await this.prisma.person.findUnique({ where: { id: String(b.personId ?? '') }, select: { id: true, name: true } });
    if (!person) throw new BadRequestException('Selecione o cliente.');
    const items = (b.items ?? []).filter((i) => str(i.description, 200) && num(i.quantity) > 0);
    if (!items.length) throw new BadRequestException('Adicione ao menos um item.');
    const total = items.reduce((s, i) => s + Math.max(0, num(i.quantity) * num(i.unitValue) - num(i.discount)), 0);
    if (!(total > 0)) throw new BadRequestException('O total da fatura deve ser maior que zero.');
    const now = new Date();
    const inv = await this.prisma.invoice.create({ data: {
      number: await this.nextNumber(), kind: b.kind === 'P' ? 'P' : 'S', origin: 'AVULSA', personId: person.id, personName: person.name,
      competence: /^\d{2}\/\d{2}$/.test(b.competence ?? '') ? b.competence! : compOf(now), registeredAt: now, createdBy: u.name, total: Math.round(total * 100) / 100, titleGenerated: true,
      description: str(b.description, 500) || items.map((i) => str(i.description, 60)).join(', ').slice(0, 500),
    } });
    return { id: inv.id, number: inv.number };
  }

  // ---------- Central: notas ----------
  @Get('nfse')
  async nfse(@Query() q: { q?: string; from?: string; to?: string; sort?: string; desc?: string; page?: string }) {
    const term = q.q?.trim();
    const where: Prisma.NfseRecordWhereInput = { ...(q.from || q.to ? { issuedAt: range(q.from, q.to) } : {}), ...(term ? { OR: [{ personName: { contains: term, mode: 'insensitive' } }, ...(/^\d+$/.test(term) ? [{ rps: Number(term) }, { nfseNumber: Number(term) }, { invoiceNumber: Number(term) }] : [])] } : {}) };
    const dir = q.desc === 'false' ? 'asc' : 'desc';
    const orderBy: Prisma.NfseRecordOrderByWithRelationInput = q.sort === 'total' ? { total: dir } : q.sort === 'client' ? { personName: dir } : { issuedAt: dir };
    const page = Math.max(1, num(q.page) || 1);
    const [rows, total] = await Promise.all([this.prisma.nfseRecord.findMany({ where, orderBy: [orderBy, { rps: 'desc' }], take: PAGE * page }), this.prisma.nfseRecord.count({ where })]);
    const ids = await this.prisma.invoice.findMany({ where: { number: { in: rows.map((r) => r.invoiceNumber) } }, select: { id: true, number: true } });
    const idOf = new Map(ids.map((i) => [i.number, i.id]));
    return { lista: rows.map((r) => ({ ...r, total: num(r.total), invoiceId: idOf.get(r.invoiceNumber) ?? null })), total, hasMore: rows.length < total };
  }

  @Get('nfe')
  async nfe(@Query() q: { q?: string; from?: string; to?: string; sort?: string; desc?: string; page?: string }) {
    const term = q.q?.trim();
    const where: Prisma.NfeRecordWhereInput = { ...(q.from || q.to ? { issuedAt: range(q.from, q.to) } : {}), ...(term ? { OR: [{ personName: { contains: term, mode: 'insensitive' } }, { accessKey: { contains: term } }, ...(/^\d+$/.test(term) ? [{ number: Number(term) }, { invoiceNumber: Number(term) }] : [])] } : {}) };
    const dir = q.desc === 'false' ? 'asc' : 'desc';
    const orderBy: Prisma.NfeRecordOrderByWithRelationInput = q.sort === 'client' ? { personName: dir } : { issuedAt: dir };
    const page = Math.max(1, num(q.page) || 1);
    const [rows, total] = await Promise.all([this.prisma.nfeRecord.findMany({ where, orderBy: [orderBy, { number: 'desc' }], take: PAGE * page }), this.prisma.nfeRecord.count({ where })]);
    const ids = await this.prisma.invoice.findMany({ where: { number: { in: rows.map((r) => r.invoiceNumber).filter((x): x is number => x !== null) } }, select: { id: true, number: true } });
    const idOf = new Map(ids.map((i) => [i.number, i.id]));
    return { lista: rows.map((r) => ({ ...r, total: r.total === null ? null : num(r.total), invoiceId: r.invoiceNumber ? idOf.get(r.invoiceNumber) ?? null : null })), total, hasMore: rows.length < total };
  }

  /** Processamentos: lotes de NFS-e enviados. */
  @Get('processing')
  async processing() {
    const rows = await this.prisma.nfseRecord.findMany({ orderBy: { issuedAt: 'desc' } });
    const lots = new Map<string, { lote: string; count: number; total: number; issuedAt: Date; cancelled: number }>();
    for (const r of rows) {
      const l = lots.get(r.lote) ?? { lote: r.lote, count: 0, total: 0, issuedAt: r.issuedAt, cancelled: 0 };
      l.count++; l.total += num(r.total); if (r.status === 'C') l.cancelled++; if (r.issuedAt > l.issuedAt) l.issuedAt = r.issuedAt; lots.set(r.lote, l);
    }
    return [...lots.values()].sort((a, b) => Number(b.lote) - Number(a.lote));
  }

  @Get('export-xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  async exportXml(@Query() q: { type?: string; from?: string; to?: string }) {
    if (q.type === 'nfe') {
      const rows = await this.prisma.nfeRecord.findMany({ where: { status: 'A', ...(q.from || q.to ? { issuedAt: range(q.from, q.to) } : {}) }, orderBy: { number: 'asc' } });
      return `<?xml version="1.0" encoding="UTF-8"?>\n<nfes>\n${rows.map((r) => `  <nfe numero="${r.number}" chaveAcesso="${xml(r.accessKey)}" emissao="${r.issuedAt.toISOString().slice(0, 10)}" valor="${r.total === null ? '' : num(r.total).toFixed(2)}"><destinatario>${xml(r.personName)}</destinatario></nfe>`).join('\n')}\n</nfes>\n`;
    }
    const rows = await this.prisma.nfseRecord.findMany({ where: { status: 'G', ...(q.from || q.to ? { issuedAt: range(q.from, q.to) } : {}) }, orderBy: { rps: 'asc' } });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<nfses>\n${rows.map((r) => `  <nfse numero="${r.nfseNumber}" rps="${r.rps}" lote="${xml(r.lote)}" fatura="${r.invoiceNumber}" emissao="${r.issuedAt.toISOString().slice(0, 10)}" valor="${num(r.total).toFixed(2)}"><tomador>${xml(r.personName)}</tomador></nfse>`).join('\n')}\n</nfses>\n`;
  }

  // ---------- Faturamento de contratos ----------
  private async contractsFor(month: string, groupId?: string, dayFrom = 1, dayTo = 31) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('Selecione o mês de competência.');
    const [y, m] = month.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1)), end = new Date(Date.UTC(y, m, 0, 23, 59, 59));
    const list = await this.prisma.contract.findMany({
      where: { status: 0, startDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: start } }], billingDay: { gte: dayFrom, lte: dayTo }, ...(groupId ? { billingGroupId: groupId } : {}) },
      orderBy: { number: 'asc' }, select: { id: true, number: true, personId: true, personName: true, billingDay: true, totalNet: true, billingGroup: { select: { description: true } } },
    });
    const comp = `${String(m).padStart(2, '0')}/${String(y).slice(2)}`;
    const done = await this.prisma.invoice.findMany({ where: { origin: 'CONTRATO', competence: comp, status: 'FATURADA', originRef: { in: list.map((c) => c.number) } }, select: { originRef: true, number: true } });
    const billed = new Map(done.map((d) => [d.originRef, d.number]));
    return { comp, list: list.map((c) => ({ id: c.id, number: c.number, personId: c.personId, personName: c.personName, billingDay: c.billingDay, total: num(c.totalNet), group: c.billingGroup?.description ?? null, billedInvoice: billed.get(c.number) ?? null })) };
  }

  @Get('contracts/search')
  async searchContracts(@Query() q: { month?: string; groupId?: string; dayFrom?: string; dayTo?: string }) {
    return (await this.contractsFor(q.month ?? '', q.groupId || undefined, num(q.dayFrom) || 1, num(q.dayTo) || 31)).list;
  }

  @Post('contracts/invoice')
  async invoiceContracts(@Req() req: Request, @Body() b: { month?: string; contractIds?: string[] }) {
    const u = await this.me(req);
    const { comp, list } = await this.contractsFor(b.month ?? '');
    const ids = new Set(b.contractIds ?? []);
    const todo = list.filter((c) => ids.has(c.id) && !c.billedInvoice && c.total > 0);
    if (!todo.length) throw new BadRequestException('Nenhum contrato selecionado está disponível para faturar.');
    const created: number[] = [];
    for (const c of todo) {
      const inv = await this.prisma.invoice.create({ data: { number: await this.nextNumber(), kind: 'S', origin: 'CONTRATO', originRef: c.number, personId: c.personId, personName: c.personName, competence: comp, registeredAt: new Date(), createdBy: u.name, total: c.total, titleGenerated: true } });
      await this.prisma.contractHistory.create({ data: { contractId: c.id, description: `Fatura ${String(inv.number).padStart(6, '0')} (competência ${comp}) gerada por '${u.name}'.`, userName: u.name } });
      created.push(inv.number);
    }
    return { created };
  }

  // ---------- Faturamento de ordens de serviço ----------
  @Get('os')
  async orders(@Query() q: { tab?: string; person?: string; from?: string; to?: string; osType?: string; billType?: string }) {
    if (q.tab === 'done') {
      const rows = await this.prisma.invoice.findMany({ where: { origin: 'OS', status: 'FATURADA', ...(q.person ? { personName: { contains: q.person, mode: 'insensitive' } } : {}), ...(q.billType === 'P' ? { kind: 'P' } : q.billType === 'S' ? { kind: 'S' } : {}) }, orderBy: { number: 'desc' }, take: 200 });
      return rows.map((r) => ({ key: r.id, invoiceId: r.id, invoiceNumber: r.number, number: Number(r.originRef ?? 0), personName: r.personName, kind: r.kind, value: num(r.total), address: '' }));
    }
    const rows = await pendingBillingRows(this.prisma, { from: day(q.from), to: day(q.to, true), person: q.person, osType: q.osType ? num(q.osType) : undefined });
    return rows.filter((r) => !q.billType || r.kind === q.billType).map((r) => ({ ...r, address: addressOf(r.address) }));
  }

  @Post('os/invoice')
  async invoiceOrder(@Req() req: Request, @Body() b: { orderId?: string; kind?: string; motivo?: number }) {
    const u = await this.me(req);
    const o = await this.prisma.serviceOrder.findUnique({ where: { id: String(b.orderId ?? '') }, select: { id: true, number: true, status: true, personId: true, personName: true, closedAt: true, detail: true, defectName: true } });
    if (!o) throw new NotFoundException('OS não encontrada.');
    if (![4, 5, 6].includes(o.status)) throw new BadRequestException('Somente OS fechadas podem ser faturadas.');
    const kind = b.kind === 'P' ? 'P' : 'S', motivo = kind === 'P' ? num(b.motivo) : 0;
    const row = (await pendingBillingRows(this.prisma)).find((r) => r.orderId === o.id && r.kind === kind && r.motivo === motivo);
    if (!row) throw new BadRequestException('Não há itens a faturar nesta OS para este tipo (ou já foram faturados).');
    const now = new Date();
    const number = await this.nextNumber();
    const detail = o.detail as object;
    flagItems(detail, kind, motivo, number);
    const inv = await this.prisma.invoice.create({ data: { number, kind, origin: 'OS', originRef: String(o.number), personId: o.personId, personName: o.personName, competence: compOf(o.closedAt ?? now), registeredAt: now, createdBy: u.name, total: row.value, titleGenerated: motivo === 0, description: o.defectName } });
    await this.prisma.serviceOrder.update({ where: { id: o.id }, data: { detail } });
    await this.syncOrderStatus(o.number);
    return { id: inv.id, number: inv.number };
  }

  // ---------- Notas fiscais de compra ----------
  @Get('purchases')
  async purchases(@Query() q: { supplier?: string; dateType?: string; from?: string; to?: string; operation?: string; status?: string; number?: string }) {
    const field = q.dateType === 'issue' ? 'issueDate' : 'entryDate';
    const rows = await this.prisma.purchaseNote.findMany({
      where: { ...(q.supplier ? { supplierName: { contains: q.supplier, mode: 'insensitive' } } : {}), ...(q.from || q.to ? { [field]: range(q.from, q.to) } : {}), ...(q.operation ? { operation: q.operation } : {}), ...(q.status ? { status: q.status } : {}), ...(q.number ? { number: { contains: q.number } } : {}) },
      orderBy: { entryDate: 'desc' }, take: 300,
    });
    return rows.map((r) => ({ ...r, total: num(r.total) }));
  }

  private purchaseData(b: { number?: string; supplierName?: string; entryDate?: string; issueDate?: string; operation?: string; total?: number; status?: string }) {
    const entry = day(b.entryDate), issue = day(b.issueDate);
    if (!str(b.number, 20)) throw new BadRequestException('Informe o número da nota fiscal.');
    if (!str(b.supplierName, 250)) throw new BadRequestException('Informe o fornecedor.');
    if (!entry || !issue) throw new BadRequestException('Informe as datas de entrada e de emissão.');
    if (!(num(b.total) > 0)) throw new BadRequestException('Informe o valor total da nota.');
    return { number: str(b.number, 20), supplierName: str(b.supplierName, 250), entryDate: entry, issueDate: issue, operation: str(b.operation, 80) || 'Compra de Equipamentos Revenda (Notas Fiscais de Entrada)', total: num(b.total), status: ['Salva', 'Lançada', 'Cancelada'].includes(String(b.status)) ? String(b.status) : 'Salva' };
  }

  @Post('purchases') createPurchase(@Body() b: Parameters<BillingController['purchaseData']>[0]) { return this.prisma.purchaseNote.create({ data: this.purchaseData(b) }); }
  @Put('purchases/:id') updatePurchase(@Param('id') id: string, @Body() b: Parameters<BillingController['purchaseData']>[0]) { return this.prisma.purchaseNote.update({ where: { id }, data: this.purchaseData(b) }); }

  // ---------- Devolução de notas ----------
  @Get('returns')
  async returns(@Query() q: { q?: string; status?: string; from?: string; to?: string }) {
    const term = q.q?.trim();
    return this.prisma.returnNote.findMany({
      where: { ...(q.status ? { status: q.status } : {}), ...(q.from || q.to ? { date: range(q.from, q.to) } : {}), ...(term ? { OR: [{ personName: { contains: term, mode: 'insensitive' } }, { originNf: { contains: term } }] } : {}) },
      orderBy: { date: 'desc' }, take: 300,
    });
  }

  private returnData(b: { number?: number | null; date?: string; personName?: string; kindLabel?: string; originNf?: string; status?: string }) {
    const date = day(b.date);
    if (!date) throw new BadRequestException('Informe a data.');
    if (!str(b.personName, 250)) throw new BadRequestException('Informe o cliente/fornecedor.');
    if (!str(b.originNf, 20)) throw new BadRequestException('Informe a nota fiscal de origem.');
    return { number: b.number ? num(b.number) : null, date, personName: str(b.personName, 250), kindLabel: ['Devolução de Compra', 'Devolução de Venda'].includes(String(b.kindLabel)) ? String(b.kindLabel) : 'Devolução de Compra', originNf: str(b.originNf, 20), status: ['Autorizada', 'Recusada', 'Cancelada', 'Não Emitida'].includes(String(b.status)) ? String(b.status) : 'Não Emitida' };
  }

  @Post('returns') createReturn(@Body() b: Parameters<BillingController['returnData']>[0]) { return this.prisma.returnNote.create({ data: this.returnData(b) }); }
  @Put('returns/:id') updateReturn(@Param('id') id: string, @Body() b: Parameters<BillingController['returnData']>[0]) { return this.prisma.returnNote.update({ where: { id }, data: this.returnData(b) }); }
}
