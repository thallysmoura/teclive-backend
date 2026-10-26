import { BadGatewayException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AiService } from '../ai/ai.service.js';
import { QuotesService } from '../comercial/quotes.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ServiceOrdersService } from '../operacional/service-orders.service.js';

/** Chave do item de menu que libera cada bloco do painel (a chave do item é a permissão). */
const KEYS = {
  comercial: 'item_bfdf24cd-79ea-4f78-9127-dc43732a6c71',
  operacional: 'item_155297fd-ffca-4f14-b809-c3edc613cdeb',
  obras: 'item_9afd38a1-893b-4107-a3ba-62012a229679',
  estoque: 'item_b2681b6f-1f50-4d5b-b28a-98b27905e6ad',
  cadastros: 'item_fbfee48c-aa73-4e12-ba11-17c0f42ec0ae',
} as const;

const AI_CACHE = new Map<string, { at: number; value: unknown }>();
const n = (v: unknown) => Number(v ?? 0);
const round = (v: number) => Math.round(v * 100) / 100;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService, private readonly quotes: QuotesService, private readonly orders: ServiceOrdersService, private readonly ai: AiService) {}

  /** Resumo executivo gerado por IA a partir dos números do painel (só administradores). */
  async aiSummary(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (user?.role !== 'ADMIN') throw new ForbiddenException('Apenas administradores usam o resumo com IA.');
    const data = (await this.overview(userId)) as Record<string, unknown>;
    delete data.generatedAt; delete data.access; // não ajudam a IA e mudariam o cache a cada chamada
    const facts = JSON.stringify(data, (_k, v) => (v === null || v === 0 || v === '' ? undefined : v)).slice(0, 7000); // compacto: menos tokens
    // Mesmos números nos últimos 30 min = mesma resposta, sem gastar de novo.
    const key = createHash('sha256').update(facts).digest('hex');
    const hit = AI_CACHE.get(key);
    if (hit && Date.now() - hit.at < 30 * 60_000) return hit.value;
    const system = [
      'Você é um consultor executivo sênior (COO) da Teclive, empresa brasileira de serviços e obras de tecnologia.',
      'Receberá os números do painel executivo da empresa e deve orientar o diretor. Responda SEMPRE em português do Brasil, em tom direto e profissional.',
      'A empresa JÁ usa este próprio sistema de gestão, que está em evolução. NUNCA sugira implantar, criar, contratar ou melhorar sistemas, softwares, ferramentas, dashboards, automações ou "monitoramento"; foque apenas em decisões de gestão: pessoas, priorização, prazos, cobrança, relacionamento com clientes, comercial, compras/estoque e rotina do time.',
      'Use somente os dados fornecidos. Nunca invente números; quando citar valores, use o formato R$ 1.234,56 ou "R$ 20,5 mil".',
      'Seja conciso: frases curtas, sem repetir números já citados. Máximo de 4 indicadores, 4 itens de atenção, 3 do time e 2 estratégias com até 3 passos cada.',
      'Devolva APENAS um JSON com esta estrutura:',
      '{"panorama": string (3 a 5 frases sobre como a empresa está),',
      ' "indicadores": [{"rotulo": string, "valor": string, "leitura": string}] (3 a 5 itens com os números que mais importam),',
      ' "atencao": [{"titulo": string, "detalhe": string, "prioridade": "alta"|"media"|"baixa"}] (o que exige atenção, do mais grave ao menos grave),',
      ' "time": [{"titulo": string, "detalhe": string}] (como agir com o time: cobranças, reconhecimentos, alinhamentos),',
      ' "estrategia": [{"titulo": string, "passos": string[], "impacto": string}] (ações estratégicas para sanar as dores, priorizadas)}',
    ].join('\n');
    const result = await this.ai.chat([{ role: 'system', content: system }, { role: 'user', content: `Dados do painel (JSON):\n${facts}` }], { json: true, temperature: 0.2, maxTokens: 1100, model: process.env.OPENAI_SUMMARY_MODEL || 'gpt-4o-mini', feature: 'resumo-executivo', userId });
    try {
      const parsed = JSON.parse(result.text) as Record<string, unknown>;
      const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, 8) : []);
      const value = {
        generatedAt: new Date().toISOString(),
        panorama: typeof parsed.panorama === 'string' ? parsed.panorama : '',
        indicadores: list(parsed.indicadores),
        atencao: list(parsed.atencao),
        time: list(parsed.time),
        estrategia: list(parsed.estrategia),
      };
      AI_CACHE.set(key, { at: Date.now(), value });
      return value;
    } catch {
      throw new BadGatewayException('A IA devolveu uma resposta inválida. Tente novamente.');
    }
  }

  async overview(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, permissions: true } });
    const admin = user?.role === 'ADMIN';
    const can = (key: string) => admin || !!user?.permissions.includes(key);
    const out: Record<string, unknown> = { generatedAt: new Date().toISOString(), access: { comercial: can(KEYS.comercial), operacional: can(KEYS.operacional), obras: can(KEYS.obras), estoque: can(KEYS.estoque), cadastros: can(KEYS.cadastros), governanca: admin } };

    const jobs: Promise<void>[] = [];
    if (can(KEYS.comercial)) jobs.push(this.comercial().then((v) => { out.comercial = v; }));
    if (can(KEYS.operacional) || can(KEYS.obras)) jobs.push(this.operacional().then((v) => { out.operacional = v; }));
    if (can(KEYS.estoque)) jobs.push(this.estoque().then((v) => { out.estoque = v; }));
    if (can(KEYS.cadastros)) jobs.push(this.cadastros().then((v) => { out.cadastros = v; }));
    if (admin) jobs.push(this.governanca().then((v) => { out.governanca = v; }));
    await Promise.all(jobs);
    return out;
  }

  private async comercial() {
    const [stats, recurring, leads, actions, recent] = await Promise.all([
      this.quotes.stats(),
      this.prisma.quoteItem.aggregate({ _sum: { total: true }, where: { kind: 'RECURRING', quote: { status: { in: [4, 7, 8] } } } }),
      this.prisma.person.count({ where: { isLead: true, isActive: true } }),
      this.prisma.salesAction.count({ where: { isActive: true } }),
      this.prisma.quote.findMany({ where: { status: 3 }, orderBy: { validUntil: 'asc' }, take: 5, select: { id: true, number: true, personName: true, validUntil: true, title: true } }),
    ]);
    const expiring = recent.filter((q) => q.validUntil.getTime() - Date.now() < 7 * 864e5).length;
    return { ...stats, recurringTotal: round(n(recurring._sum.total)), leads, actions, expiring, nextToExpire: recent };
  }

  private async operacional() {
    const [management, works] = await Promise.all([this.orders.management(), this.orders.works()]);
    const active = works.works.filter((w) => [0, 1, 3, 7, 8].includes(w.status));
    const qty = active.reduce((s, w) => s + w.qty, 0), delivered = active.reduce((s, w) => s + w.delivered, 0);
    const ready = works.works.filter((w) => [0, 1, 8].includes(w.status) && w.pendencies === 0).length;
    const done = works.works.filter((w) => [4, 5, 6].includes(w.status) && w.closedAt);
    const onTime = done.filter((w) => !w.scheduleEnd || new Date(w.closedAt as Date) <= new Date(w.scheduleEnd as Date)).length;
    const billed = works.works.filter((w) => w.status === 5 || w.status === 6);
    return {
      ...management, ready, active: active.length, materialsPercent: qty ? Math.round((delivered / qty) * 100) : 100, pendingUnits: qty - delivered,
      onTimePercent: done.length ? Math.round((onTime / done.length) * 100) : null, billedValue: round(billed.reduce((s, w) => s + w.total, 0)), billedCount: billed.length,
      pendingQuotes: works.pendingQuotes.length, pendingQuotesValue: round(works.pendingQuotes.reduce((s, q) => s + q.total, 0)),
    };
  }

  private async estoque() {
    const [locations, products, balances, withCost, movements30, lastMovement] = await Promise.all([
      this.prisma.stockLocation.count({ where: { isActive: true } }),
      this.prisma.stockProduct.count({ where: { isActive: true } }),
      this.prisma.stockProductBalance.groupBy({ by: ['productId'], _sum: { quantity: true } }),
      this.prisma.stockProduct.findMany({ where: { isActive: true }, select: { id: true, description: true, costPrice: true, salePrice: true } }),
      this.prisma.stockMovement.count({ where: { movementDate: { gte: new Date(Date.now() - 30 * 864e5) }, cancellationDate: null } }),
      this.prisma.stockMovement.findFirst({ orderBy: { movementDate: 'desc' }, select: { movementDate: true } }),
    ]);
    const qty = new Map(balances.map((b) => [b.productId, n(b._sum.quantity)]));
    let units = 0, cost = 0, sale = 0, zero = 0, negative = 0;
    const top: { label: string; value: number }[] = [];
    for (const p of withCost) {
      const q = qty.get(p.id) ?? 0;
      units += Math.max(q, 0); cost += Math.max(q, 0) * n(p.costPrice); sale += Math.max(q, 0) * n(p.salePrice);
      if (q === 0) zero++; if (q < 0) negative++;
      if (q > 0 && n(p.costPrice) > 0) top.push({ label: p.description, value: round(q * n(p.costPrice)) });
    }
    return { locations, products, units: round(units), costValue: round(cost), saleValue: round(sale), zero, negative, movements30, lastMovement: lastMovement?.movementDate ?? null, topProducts: top.sort((a, b) => b.value - a.value).slice(0, 6) };
  }

  private async cadastros() {
    const [clients, suppliers, technicians, sellers, services, products, brands] = await Promise.all([
      this.prisma.person.count({ where: { isClient: true, isLead: false, isActive: true } }),
      this.prisma.person.count({ where: { isSupplier: true, isActive: true } }),
      this.prisma.person.count({ where: { isTechnician: true, isActive: true } }),
      this.prisma.person.count({ where: { isSeller: true, isActive: true } }),
      this.prisma.serviceItem.count({ where: { isActive: true } }),
      this.prisma.stockProduct.count({ where: { isActive: true } }),
      this.prisma.catalogItem.count({ where: { kind: { contains: 'brand', mode: 'insensitive' }, isActive: true } }),
    ]);
    return { clients, suppliers, technicians, sellers, services, products, brands };
  }

  private async governanca() {
    const week = new Date(Date.now() - 7 * 864e5);
    const [users, active7, pending, logs7] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { lastLoginAt: { gte: week } } }),
      this.prisma.user.count({ where: { role: 'USER', permissions: { isEmpty: true } } }),
      this.prisma.accessLog.count({ where: { createdAt: { gte: week } } }).catch(() => 0),
    ]);
    return { users, active7, pending, logs7 };
  }

  /** Relatórios de dados estratégicos (mesmos números do painel executivo, em formato de documento). */
  async strategicReport(userId: string, kind: string) {
    const [data, user, company] = await Promise.all([
      this.overview(userId) as Promise<Record<string, any>>,
      this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      this.prisma.companyProfile.findFirst({ select: { legalName: true, tradeName: true } }),
    ]);
    const int = (v: unknown) => Number(v ?? 0).toLocaleString('pt-BR');
    const brl = (v: unknown) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const pct = (v: unknown) => `${Number(v ?? 0).toLocaleString('pt-BR')}%`;
    const day = (v: unknown) => (v ? new Date(v as string).toLocaleDateString('pt-BR') : '-');
    const monthLabel = (m: string) => { const [y, mo] = String(m).split('-'); return mo ? `${mo}/${y}` : String(m); };
    type Datum = { label: string; value: number };
    const list = (d: Datum[] | undefined, money: boolean) => (d ?? []).map((x) => [x.label, money ? brl(x.value) : int(x.value)]);
    const sections: Record<string, unknown>[] = [];
    const want = (k: string) => kind === 'geral' || kind === k;

    const c = data.comercial;
    if (c && want('comercial')) {
      sections.push({
        title: 'Comercial — orçamentos e vendas',
        summary: [['Orçamentos no total', int(c.total)], ['Em aberto', `${int(c.openCount)} (${brl(c.openValue)})`], ['Vendas ganhas', `${int(c.wonCount)} (${brl(c.wonValue)})`], ['Ticket médio', brl(c.averageTicket)], ['Taxa de conversão', pct(c.conversionRate)], ['Receita recorrente', brl(c.recurringTotal)], ['Leads ativos', int(c.leads)], ['Ações de venda', int(c.actions)], ['A vencer em 7 dias', int(c.expiring)]],
      });
      if (c.statuses?.length) sections.push({ title: 'Orçamentos por situação', columns: [{ label: 'Situação', width: 489 }, { label: 'Quantidade', width: 200, align: 'right' }], rows: list(c.statuses, false) });
      if (c.monthlyWon?.length) sections.push({ title: 'Vendas ganhas por mês', columns: [{ label: 'Mês', width: 489 }, { label: 'Valor', width: 200, align: 'right' }], rows: c.monthlyWon.map((x: Datum) => [monthLabel(x.label), brl(x.value)]) });
      if (c.bySeller?.length) sections.push({ title: 'Vendas por vendedor', columns: [{ label: 'Vendedor', width: 489 }, { label: 'Valor', width: 200, align: 'right' }], rows: list(c.bySeller, true) });
      if (c.topClients?.length) sections.push({ title: 'Principais clientes', columns: [{ label: 'Cliente', width: 489 }, { label: 'Valor', width: 200, align: 'right' }], rows: list(c.topClients, true) });
      if (c.nextToExpire?.length) sections.push({ title: 'Orçamentos próximos do vencimento', columns: [{ label: 'Nº', width: 70 }, { label: 'Cliente', width: 330 }, { label: 'Título', width: 169 }, { label: 'Validade', width: 120, align: 'center' }], rows: c.nextToExpire.map((q: { number: number; personName: string; title: string | null; validUntil: string }) => [String(q.number), q.personName, q.title ?? '', day(q.validUntil)]) });
    }

    const o = data.operacional;
    if (o && want('operacional')) {
      sections.push({
        title: 'Operacional — ordens de serviço e obras',
        summary: [['Ordens de serviço', int(o.total)], ['Em aberto', `${int(o.open)} (${brl(o.openValue)})`], ['Atrasadas', int(o.late)], ['Valor total', brl(o.value)], ['Prontas para fechar', int(o.ready)], ['Obras em andamento', int(o.active)], ['Média para fechar', `${int(o.averageCloseDays)} dias`], ['Entregas no prazo', o.onTimePercent === null ? '-' : pct(o.onTimePercent)], ['Materiais entregues', pct(o.materialsPercent)], ['Unidades pendentes', int(o.pendingUnits)], ['Faturado', `${int(o.billedCount)} (${brl(o.billedValue)})`], ['Vendas sem ordem de serviço', `${int(o.pendingQuotes)} (${brl(o.pendingQuotesValue)})`]],
      });
      if (o.byStatus?.length) sections.push({ title: 'Ordens por situação', columns: [{ label: 'Situação', width: 489 }, { label: 'Quantidade', width: 200, align: 'right' }], rows: list(o.byStatus, false) });
      if (o.byType?.length) sections.push({ title: 'Ordens por tipo', columns: [{ label: 'Tipo', width: 489 }, { label: 'Quantidade', width: 200, align: 'right' }], rows: list(o.byType, false) });
      if (o.byTechnician?.length) sections.push({ title: 'Ordens por técnico', columns: [{ label: 'Técnico', width: 489 }, { label: 'Quantidade', width: 200, align: 'right' }], rows: list(o.byTechnician, false) });
      if (o.monthly?.length) sections.push({ title: 'Ordens abertas por mês', columns: [{ label: 'Mês', width: 289 }, { label: 'Quantidade', width: 200, align: 'right' }, { label: 'Valor', width: 200, align: 'right' }], rows: o.monthly.map((m: { month: string; count: number; value: number }) => [monthLabel(m.month), int(m.count), brl(m.value)]) });
      if (o.lateList?.length) sections.push({ title: 'Ordens atrasadas (mais críticas)', columns: [{ label: 'Nº', width: 90 }, { label: 'Cliente', width: 489 }, { label: 'Prazo', width: 110, align: 'center' }], rows: o.lateList.map((x: { number: number; personName: string; scheduleEnd: string | null }) => [String(x.number), x.personName, day(x.scheduleEnd)]) });
    }

    const e = data.estoque;
    if (e && want('estoque')) {
      sections.push({
        title: 'Estoque — posição e movimentação',
        summary: [['Locais de estoque', int(e.locations)], ['Produtos', int(e.products)], ['Unidades em estoque', int(e.units)], ['Valor de custo', brl(e.costValue)], ['Valor de venda', brl(e.saleValue)], ['Produtos sem saldo', int(e.zero)], ['Produtos com saldo negativo', int(e.negative)], ['Movimentos (30 dias)', int(e.movements30)], ['Última movimentação', day(e.lastMovement)]],
      });
      if (e.topProducts?.length) sections.push({ title: 'Produtos de maior valor em estoque', columns: [{ label: 'Produto', width: 489 }, { label: 'Valor', width: 200, align: 'right' }], rows: list(e.topProducts, true) });
    }

    const k = data.cadastros;
    const g = data.governanca;
    if ((k || g) && want('cadastros')) {
      sections.push({
        title: 'Base cadastral e equipe',
        summary: [...(k ? ([['Clientes', int(k.clients)], ['Fornecedores', int(k.suppliers)], ['Técnicos', int(k.technicians)], ['Vendedores', int(k.sellers)], ['Serviços', int(k.services)], ['Produtos', int(k.products)], ['Marcas', int(k.brands)]] as [string, string][]) : []), ...(g ? ([['Usuários', int(g.users)], ['Ativos nos últimos 7 dias', int(g.active7)], ['Aguardando permissão', int(g.pending)], ['Acessos nos últimos 7 dias', int(g.logs7)]] as [string, string][]) : [])],
      });
    }

    const titles: Record<string, string> = { geral: 'Dados Estratégicos — Visão Geral', comercial: 'Dados Estratégicos — Comercial', operacional: 'Dados Estratégicos — Operacional', estoque: 'Dados Estratégicos — Estoque', cadastros: 'Dados Estratégicos — Cadastros e Equipe' };
    return {
      title: titles[kind] ?? titles.geral,
      company: company?.legalName || company?.tradeName || 'Teclive',
      generatedBy: user?.name ?? '',
      generatedAt: new Date().toISOString(),
      filters: [['Relatório:', titles[kind]?.replace('Dados Estratégicos — ', '') ?? 'Visão Geral'], ['Período:', 'Posição atual dos dados'], ['Fonte:', 'Painel executivo do sistema']],
      sections,
    };
  }
}
