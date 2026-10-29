import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

const num = (v: unknown) => Number(v ?? 0);
const r2 = (n: number) => Math.round(n * 100) / 100;
const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const PAGE = 25;
const day = (s?: string, end = false) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T${end ? '23:59:59' : '00:00:00'}Z`) : undefined);
const range = (from?: string, to?: string) => ({ ...(day(from) ? { gte: day(from) } : {}), ...(day(to, true) ? { lte: day(to, true) } : {}) });
const noon = (s?: string) => { const d = s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00Z`) : null; if (!d) throw new BadRequestException('Data inválida.'); return d; };
const addMonths = (d: Date, n: number) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + n); return x; };
const pad = (n: number) => String(n).padStart(6, '0');

@Controller('finance')
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(private readonly prisma: PrismaService) {}

  private async me(req: Request) {
    const u = await this.prisma.user.findUnique({ where: { id: (req.user as { id: string }).id }, select: { id: true, name: true, role: true } });
    if (!u) throw new BadRequestException('Sessão inválida.');
    return u;
  }
  private async nextNumber() {
    const last = await this.prisma.finAccount.findFirst({ where: { number: { not: null } }, orderBy: { number: 'desc' }, select: { number: true } });
    return pad(Number(last?.number ?? 0) + 1);
  }
  private view(a: { value: Prisma.Decimal; paidValue: Prisma.Decimal | null } & Record<string, unknown>) { return { ...a, value: num(a.value), paidValue: a.paidValue === null ? null : num(a.paidValue) }; }

  // ---------- Contas a receber / a pagar ----------
  @Get('accounts')
  async accounts(@Query() q: { kind?: string; from?: string; to?: string; q?: string; status?: string; method?: string; dateType?: string; sort?: string; desc?: string; page?: string; person?: string; overdue?: string }) {
    const field = q.dateType === 'issued' ? 'createdAt' : 'dueDate';
    const term = q.q?.trim();
    const where: Prisma.FinAccountWhereInput = {
      kind: q.kind === 'P' ? 'P' : 'R', ...(q.from || q.to ? { [field]: range(q.from, q.to) } : {}), ...(q.status ? { status: q.status } : {}), ...(q.method ? { paymentMethod: { contains: q.method, mode: 'insensitive' } } : {}),
      ...(q.person ? { personName: { contains: q.person, mode: 'insensitive' } } : {}), ...(q.overdue ? { status: 'ABERTA', dueDate: { lt: new Date() } } : {}),
      ...(term ? { OR: [{ personName: { contains: term, mode: 'insensitive' } }, { description: { contains: term, mode: 'insensitive' } }, { number: { contains: term } }] } : {}),
    };
    const dir = q.desc === 'false' ? 'asc' : 'desc';
    const orderBy: Prisma.FinAccountOrderByWithRelationInput = q.sort === 'value' ? { value: dir } : q.sort === 'client' ? { personName: dir } : { dueDate: dir };
    const page = Math.max(1, num(q.page) || 1);
    const [rows, total, agg, paid] = await Promise.all([
      this.prisma.finAccount.findMany({ where, orderBy: [orderBy, { number: 'desc' }], take: PAGE * page }), this.prisma.finAccount.count({ where }),
      this.prisma.finAccount.aggregate({ where, _sum: { value: true } }), this.prisma.finAccount.aggregate({ where: { ...where, status: 'LIQUIDADA' }, _sum: { paidValue: true } }),
    ]);
    return { lista: rows.map((r) => this.view(r)), total, hasMore: rows.length < total, totals: { value: num(agg._sum.value), paid: num(paid._sum.paidValue), open: r2(num(agg._sum.value) - num((await this.prisma.finAccount.aggregate({ where: { ...where, status: 'LIQUIDADA' }, _sum: { value: true } }))._sum.value)) } };
  }

  @Post('accounts')
  async createAccount(@Body() b: { kind?: string; personName?: string; description?: string; value?: number; dueDate?: string; installments?: number; paymentMethod?: string; categoryId?: string; interval?: number }) {
    const personName = str(b.personName, 250), description = str(b.description, 300), value = num(b.value);
    if (!personName) throw new BadRequestException('Informe o cliente/fornecedor.');
    if (!description) throw new BadRequestException('Informe a descrição.');
    if (!(value > 0)) throw new BadRequestException('Informe um valor maior que zero.');
    const due = noon(b.dueDate), n = Math.min(60, Math.max(1, Math.floor(num(b.installments)) || 1));
    const created: string[] = [];
    for (let i = 0; i < n; i++) {
      const a = await this.prisma.finAccount.create({ data: { kind: b.kind === 'P' ? 'P' : 'R', number: await this.nextNumber(), dueDate: addMonths(due, i * (num(b.interval) || 1)), personName, installment: n > 1 ? `${i + 1}/${n}` : null, description, value: r2(value / n), paymentMethod: str(b.paymentMethod, 80) || null, categoryId: b.categoryId || null } });
      created.push(a.id);
    }
    return { created };
  }

  @Put('accounts/:id')
  async updateAccount(@Param('id') id: string, @Body() b: { description?: string; value?: number; dueDate?: string; paymentMethod?: string; categoryId?: string | null; personName?: string }) {
    const a = await this.prisma.finAccount.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Conta não encontrada.');
    if (a.status === 'LIQUIDADA') throw new BadRequestException('Estorne a baixa antes de editar a conta.');
    const data: Prisma.FinAccountUpdateInput = {};
    if (b.description !== undefined) data.description = str(b.description, 300);
    if (b.personName !== undefined && str(b.personName, 250)) data.personName = str(b.personName, 250);
    if (b.value !== undefined) { if (!(num(b.value) > 0)) throw new BadRequestException('Valor inválido.'); data.value = num(b.value); }
    if (b.dueDate) data.dueDate = noon(b.dueDate);
    if (b.paymentMethod !== undefined) data.paymentMethod = str(b.paymentMethod, 80) || null;
    if (b.categoryId !== undefined) data.categoryId = b.categoryId || null;
    await this.prisma.finAccount.update({ where: { id }, data });
    return { ok: true };
  }

  @Delete('accounts/:id')
  async deleteAccount(@Param('id') id: string) {
    const a = await this.prisma.finAccount.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Conta não encontrada.');
    if (a.status === 'LIQUIDADA') throw new BadRequestException('Estorne a baixa antes de excluir a conta.');
    await this.prisma.finAccount.delete({ where: { id } });
    return { ok: true };
  }

  /** Baixa (liquidação): marca a conta como paga/recebida e lança o movimento na conta de caixa escolhida. */
  @Post('accounts/:id/settle')
  async settle(@Req() req: Request, @Param('id') id: string, @Body() b: { cashAccountId?: string; date?: string; paidValue?: number; paymentMethod?: string }) {
    const u = await this.me(req);
    const a = await this.prisma.finAccount.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Conta não encontrada.');
    if (a.status === 'LIQUIDADA') throw new BadRequestException('A conta já foi liquidada.');
    const cash = await this.prisma.cashAccount.findUnique({ where: { id: String(b.cashAccountId ?? '') } });
    if (!cash) throw new BadRequestException('Selecione a conta de caixa.');
    const paid = num(b.paidValue) > 0 ? num(b.paidValue) : num(a.value), date = noon(b.date);
    await this.prisma.$transaction([
      this.prisma.finAccount.update({ where: { id }, data: { status: 'LIQUIDADA', paidValue: paid, settledAt: date, cashAccountId: cash.id, paymentMethod: str(b.paymentMethod, 80) || a.paymentMethod } }),
      this.prisma.cashMovement.create({ data: { cashAccountId: cash.id, date, personName: a.personName, description: `#${a.number ?? ''}${a.installment ? `/${a.installment.split('/')[0]}` : ''} ${a.description}`.trim(), value: a.kind === 'R' ? paid : -paid, accountId: id, createdBy: u.name } }),
    ]);
    return { ok: true };
  }

  @Post('accounts/:id/reverse')
  async reverse(@Param('id') id: string) {
    const a = await this.prisma.finAccount.findUnique({ where: { id } });
    if (!a || a.status !== 'LIQUIDADA') throw new BadRequestException('Só é possível estornar contas liquidadas.');
    await this.prisma.$transaction([this.prisma.cashMovement.deleteMany({ where: { accountId: id } }), this.prisma.finAccount.update({ where: { id }, data: { status: 'ABERTA', paidValue: null, settledAt: null, cashAccountId: null } })]);
    return { ok: true };
  }

  // ---------- Contas de caixa e movimentos ----------
  @Get('cash-accounts')
  async cashAccounts(@Query('inactive') inactive?: string) {
    const list = await this.prisma.cashAccount.findMany({ where: inactive === 'true' ? {} : { isActive: true }, orderBy: { createdAt: 'asc' } });
    const sums = await this.prisma.cashMovement.groupBy({ by: ['cashAccountId'], _sum: { value: true } });
    const by = new Map(sums.map((s) => [s.cashAccountId, num(s._sum.value)]));
    return list.map((c) => ({ id: c.id, name: c.name, type: c.type, isActive: c.isActive, balance: r2(num(c.opening) + (by.get(c.id) ?? 0)) }));
  }
  @Post('cash-accounts') createCash(@Body() b: { name?: string; type?: string; opening?: number }) { if (!str(b.name, 120)) throw new BadRequestException('Informe o nome da conta.'); return this.prisma.cashAccount.create({ data: { name: str(b.name, 120), type: str(b.type, 40) || 'Conta Corrente', opening: num(b.opening) } }); }
  @Put('cash-accounts/:id') updateCash(@Param('id') id: string, @Body() b: { name?: string; type?: string; isActive?: boolean }) { return this.prisma.cashAccount.update({ where: { id }, data: { ...(b.name ? { name: str(b.name, 120) } : {}), ...(b.type ? { type: str(b.type, 40) } : {}), ...(typeof b.isActive === 'boolean' ? { isActive: b.isActive } : {}) } }); }

  @Get('movements')
  async movements(@Query() q: { cashAccountId?: string; from?: string; to?: string; page?: string }) {
    const acc = await this.prisma.cashAccount.findUnique({ where: { id: String(q.cashAccountId ?? '') } });
    if (!acc) throw new BadRequestException('Selecione a conta de caixa.');
    const all = await this.prisma.cashMovement.findMany({ where: { cashAccountId: acc.id }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] });
    let bal = num(acc.opening);
    const withBal = all.map((m) => { bal = r2(bal + num(m.value)); return { id: m.id, date: m.date, personName: m.personName, description: m.description, value: num(m.value), balance: bal }; });
    const filtered = withBal.filter((m) => (!day(q.from) || m.date >= day(q.from)!) && (!day(q.to, true) || m.date <= day(q.to, true)!)).reverse();
    const page = Math.max(1, num(q.page) || 1);
    return { lista: filtered.slice((page - 1) * 11, page * 11), total: filtered.length, pageSize: 11, daily: withBal.slice(-60).map((m) => ({ date: m.date, balance: m.balance })) };
  }

  @Post('movements')
  async createMovement(@Req() req: Request, @Body() b: { cashAccountId?: string; toAccountId?: string; type?: string; value?: number; description?: string; date?: string; personName?: string }) {
    const u = await this.me(req);
    const from = await this.prisma.cashAccount.findUnique({ where: { id: String(b.cashAccountId ?? '') } });
    if (!from) throw new BadRequestException('Selecione a conta de caixa.');
    const value = num(b.value), date = noon(b.date), description = str(b.description, 400);
    if (!(value > 0)) throw new BadRequestException('Informe um valor maior que zero.');
    if (!description) throw new BadRequestException('Informe a descrição.');
    if (b.type === 'TRANSFER') {
      const to = await this.prisma.cashAccount.findUnique({ where: { id: String(b.toAccountId ?? '') } });
      if (!to || to.id === from.id) throw new BadRequestException('Escolha uma conta de destino diferente.');
      await this.prisma.cashMovement.createMany({ data: [{ cashAccountId: from.id, date, personName: 'Transferência de caixa', description: `Transf. ${from.name} para ${to.name} - ${description}`, value: -value, createdBy: u.name }, { cashAccountId: to.id, date, personName: 'Transferência de caixa', description: `Transf. ${from.name} para ${to.name} - ${description}`, value, createdBy: u.name }] });
    } else {
      await this.prisma.cashMovement.create({ data: { cashAccountId: from.id, date, personName: str(b.personName, 250) || (b.type === 'OUT' ? 'Saída avulsa' : 'Entrada avulsa'), description, value: b.type === 'OUT' ? -value : value, createdBy: u.name } });
    }
    return { ok: true };
  }

  @Get('statement')
  async statement(@Query() q: { type?: string; from?: string; to?: string; accounts?: string; user?: string }) {
    const ids = q.accounts ? q.accounts.split(',').filter(Boolean) : [];
    const rows = await this.prisma.cashMovement.findMany({ where: { ...(ids.length ? { cashAccountId: { in: ids } } : {}), ...(q.from || q.to ? { date: range(q.from, q.to) } : {}), ...(q.user ? { createdBy: q.user } : {}), ...(q.type === 'IN' ? { value: { gt: 0 } } : q.type === 'OUT' ? { value: { lt: 0 } } : {}) }, include: { cashAccount: { select: { name: true } } }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] });
    const lista = rows.map((m) => ({ id: m.id, date: m.date, account: m.cashAccount.name, personName: m.personName, description: m.description, value: num(m.value), user: m.createdBy }));
    return { lista, inflow: r2(lista.filter((m) => m.value > 0).reduce((s, m) => s + m.value, 0)), outflow: r2(lista.filter((m) => m.value < 0).reduce((s, m) => s + m.value, 0)) };
  }

  // ---------- Categorias ----------
  @Get('categories') categories() { return this.prisma.finCategory.findMany({ orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] }); }
  @Post('categories')
  async createCategory(@Body() b: { name?: string; parentId?: string }) {
    const parent = await this.prisma.finCategory.findUnique({ where: { id: String(b.parentId ?? '') } });
    if (!parent) throw new BadRequestException('Escolha a categoria superior.');
    if (!str(b.name, 160)) throw new BadRequestException('Informe o nome da categoria.');
    const last = await this.prisma.finCategory.aggregate({ _max: { sortOrder: true } });
    return this.prisma.finCategory.create({ data: { kind: parent.kind, name: str(b.name, 160), level: parent.level + 1, parentId: parent.id, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  }
  @Put('categories/:id') updateCategory(@Param('id') id: string, @Body() b: { name?: string; isActive?: boolean }) { return this.prisma.finCategory.update({ where: { id }, data: { ...(b.name ? { name: str(b.name, 160) } : {}), ...(typeof b.isActive === 'boolean' ? { isActive: b.isActive } : {}) } }); }
  @Delete('categories/:id')
  async deleteCategory(@Param('id') id: string) {
    if (await this.prisma.finCategory.count({ where: { parentId: id } })) throw new BadRequestException('Exclua primeiro as subcategorias.');
    if (await this.prisma.finAccount.count({ where: { categoryId: id } })) throw new BadRequestException('Há contas usando esta categoria.');
    await this.prisma.finCategory.delete({ where: { id } });
    return { ok: true };
  }

  // ---------- Formas de pagamento e centros de resultado ----------
  @Get('payment-methods') paymentMethods(@Query('inactive') inactive?: string) { return this.prisma.paymentMethod.findMany({ where: inactive === 'true' ? {} : { isActive: true }, orderBy: { legacyId: 'asc' }, select: { id: true, description: true, isActive: true } }); }
  @Post('payment-methods') createMethod(@Body() b: { description?: string }) { if (!str(b.description, 120)) throw new BadRequestException('Informe a descrição.'); return this.prisma.paymentMethod.create({ data: { description: str(b.description, 120) }, select: { id: true, description: true, isActive: true } }); }
  @Put('payment-methods/:id') updateMethod(@Param('id') id: string, @Body() b: { description?: string; isActive?: boolean }) { return this.prisma.paymentMethod.update({ where: { id }, data: { ...(b.description ? { description: str(b.description, 120) } : {}), ...(typeof b.isActive === 'boolean' ? { isActive: b.isActive } : {}) }, select: { id: true, description: true, isActive: true } }); }

  @Get('result-centers') resultCenters(@Query('inactive') inactive?: string) { return this.prisma.resultCenter.findMany({ where: inactive === 'true' ? {} : { isActive: true }, orderBy: { name: 'asc' } }); }
  @Post('result-centers') createCenter(@Body() b: { name?: string }) { if (!str(b.name, 160)) throw new BadRequestException('Informe a descrição.'); return this.prisma.resultCenter.create({ data: { name: str(b.name, 160) } }); }
  @Put('result-centers/:id') updateCenter(@Param('id') id: string, @Body() b: { name?: string; isActive?: boolean }) { return this.prisma.resultCenter.update({ where: { id }, data: { ...(b.name ? { name: str(b.name, 160) } : {}), ...(typeof b.isActive === 'boolean' ? { isActive: b.isActive } : {}) } }); }

  // ---------- Análises ----------
  /** Previsto (vencimento) x realizado (baixa) por mês e por grupo de categoria. */
  @Get('result-analysis')
  async analysis(@Query('year') year?: string) {
    const y = num(year) || new Date().getFullYear();
    const rows = await this.prisma.finAccount.findMany({ where: { OR: [{ dueDate: { gte: new Date(Date.UTC(y, 0, 1)), lt: new Date(Date.UTC(y + 1, 0, 1)) } }, { settledAt: { gte: new Date(Date.UTC(y, 0, 1)), lt: new Date(Date.UTC(y + 1, 0, 1)) } }] } });
    const cats = await this.prisma.finCategory.findMany();
    const byId = new Map(cats.map((c) => [c.id, c]));
    const group = (id: string | null, kind: string) => { let c = id ? byId.get(id) : undefined; while (c && c.level > 2) c = c.parentId ? byId.get(c.parentId) : undefined; return c?.name ?? 'Sem categoria'; };
    const sections: Record<string, Map<string, { planned: number[]; done: number[] }>> = { R: new Map(), P: new Map() };
    const slot = (k: string, g: string) => { const m = sections[k]; if (!m.has(g)) m.set(g, { planned: Array(12).fill(0), done: Array(12).fill(0) }); return m.get(g)!; };
    for (const a of rows) {
      const g = slot(a.kind, group(a.categoryId, a.kind));
      if (a.dueDate.getUTCFullYear() === y) g.planned[a.dueDate.getUTCMonth()] += num(a.value);
      if (a.settledAt && a.settledAt.getUTCFullYear() === y) g.done[a.settledAt.getUTCMonth()] += num(a.paidValue ?? a.value);
    }
    const out = (k: string) => [...sections[k].entries()].map(([name, v]) => ({ name, planned: v.planned.map(r2), done: v.done.map(r2) }));
    return { year: y, receipts: out('R'), payments: out('P') };
  }

  @Get('result-by-client')
  async byClient(@Query() q: { from?: string; to?: string; person?: string }) {
    const rows = await this.prisma.invoice.findMany({ where: { status: 'FATURADA', origin: 'CONTRATO', ...(q.from || q.to ? { registeredAt: range(q.from, q.to) } : {}), ...(q.person ? { personName: { contains: q.person, mode: 'insensitive' } } : {}) }, select: { personName: true, total: true } });
    const m = new Map<string, number>();
    for (const r of rows) { const n = r.personName.replace(/\s*\(.*\)\s*$/, ''); m.set(n, (m.get(n) ?? 0) + num(r.total)); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([client, recurrence]) => ({ client, recurrence: r2(recurrence), maintenance: 0, travel: 0, allocation: 0, bonus: 0, result: r2(recurrence) }));
  }

  // ---------- Cobrança ----------
  @Get('collections/search')
  async collectionSearch(@Query() q: { daysLate?: string; person?: string; daysWithout?: string; method?: string }) {
    const limit = new Date(); limit.setUTCDate(limit.getUTCDate() - num(q.daysLate));
    const rows = await this.prisma.finAccount.findMany({ where: { kind: 'R', status: 'ABERTA', dueDate: { lte: limit }, ...(q.person ? { personName: { contains: q.person, mode: 'insensitive' } } : {}), ...(q.method ? { paymentMethod: { contains: q.method, mode: 'insensitive' } } : {}) } });
    const logs = await this.prisma.collectionLog.findMany({ orderBy: { createdAt: 'desc' } });
    const last = new Map<string, Date>(); for (const l of logs) if (!last.has(l.personName)) last.set(l.personName, l.createdAt);
    const by = new Map<string, { personName: string; count: number; total: number; oldest: Date }>();
    for (const a of rows) { const x = by.get(a.personName) ?? { personName: a.personName, count: 0, total: 0, oldest: a.dueDate }; x.count++; x.total += num(a.value); if (a.dueDate < x.oldest) x.oldest = a.dueDate; by.set(a.personName, x); }
    const noCall = num(q.daysWithout);
    return [...by.values()].map((x) => ({ ...x, total: r2(x.total), lastCollection: last.get(x.personName) ?? null, daysLate: Math.max(0, Math.floor((Date.now() - x.oldest.getTime()) / 864e5)) }))
      .filter((x) => !noCall || !x.lastCollection || (Date.now() - x.lastCollection.getTime()) / 864e5 >= noCall).sort((a, b) => b.daysLate - a.daysLate);
  }
  @Get('collections') collections() { return this.prisma.collectionLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }).then((r) => r.map((x) => ({ ...x, total: num(x.total) }))); }
  @Post('collections')
  async collect(@Req() req: Request, @Body() b: { personName?: string; note?: string; total?: number }) {
    const u = await this.me(req);
    if (!str(b.personName, 250)) throw new BadRequestException('Informe o cliente.');
    return this.prisma.collectionLog.create({ data: { personName: str(b.personName, 250), note: str(b.note, 500) || 'Cobrança realizada', userName: u.name, total: num(b.total) } });
  }

  // ---------- Agrupamento, reparcelamento e renegociação ----------
  @Get('operations') operations() { return this.prisma.finOperation.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }).then((r) => r.map((x) => ({ ...x, total: num(x.total) }))); }

  /** Troca contas abertas de um mesmo cliente por novas parcelas (agrupar = 1 parcela; reparcelar/renegociar = várias). */
  @Post('operations')
  async operate(@Req() req: Request, @Body() b: { type?: string; accountIds?: string[]; parts?: { dueDate?: string; value?: number }[]; adjust?: number }) {
    const u = await this.me(req);
    const type = ['AGRUPAMENTO', 'REPARCELAMENTO', 'RENEGOCIACAO'].includes(String(b.type)) ? String(b.type) : '';
    if (!type) throw new BadRequestException('Operação inválida.');
    const olds = await this.prisma.finAccount.findMany({ where: { id: { in: b.accountIds ?? [] }, kind: 'R', status: 'ABERTA' } });
    if (!olds.length) throw new BadRequestException('Selecione contas a receber em aberto.');
    if (new Set(olds.map((o) => o.personName)).size > 1) throw new BadRequestException('As contas devem ser do mesmo cliente.');
    if (type === 'REPARCELAMENTO' && olds.length !== 1) throw new BadRequestException('O reparcelamento é feito sobre uma conta por vez.');
    const base = r2(olds.reduce((s, o) => s + num(o.value), 0)), adjust = num(b.adjust), total = r2(base + adjust);
    if (!(total > 0)) throw new BadRequestException('O total das novas contas deve ser maior que zero.');
    const parts = (b.parts ?? []).filter((p) => num(p.value) > 0).map((p) => ({ due: noon(p.dueDate), value: r2(num(p.value)) }));
    if (!parts.length) throw new BadRequestException('Informe as novas parcelas.');
    if (Math.abs(parts.reduce((s, p) => s + p.value, 0) - total) > 0.05) throw new BadRequestException(`A soma das parcelas deve ser ${total.toFixed(2).replace('.', ',')}.`);
    const label = type === 'AGRUPAMENTO' ? `Agrupamento de ${String(olds.length).padStart(2, '0')} contas` : type === 'RENEGOCIACAO' ? `Renegociação de ${String(olds.length).padStart(2, '0')} conta(s)` : 'Reparcelamento';
    await this.prisma.$transaction(async (tx) => {
      await tx.finAccount.updateMany({ where: { id: { in: olds.map((o) => o.id) } }, data: { status: 'CANCELADA', note: label } });
      for (let i = 0; i < parts.length; i++) {
        const last = await tx.finAccount.findFirst({ where: { number: { not: null } }, orderBy: { number: 'desc' }, select: { number: true } });
        await tx.finAccount.create({ data: { kind: 'R', number: pad(Number(last?.number ?? 0) + 1), dueDate: parts[i].due, personName: olds[0].personName, installment: parts.length > 1 ? `${i + 1}/${parts.length}` : null, description: label, value: parts[i].value, paymentMethod: olds[0].paymentMethod } });
      }
      await tx.finOperation.create({ data: { type, personName: olds[0].personName, description: `${label}: ${olds.map((o) => o.number).join(', ')} → ${parts.length} parcela(s)`, total, userName: u.name } });
    });
    return { ok: true };
  }
}
