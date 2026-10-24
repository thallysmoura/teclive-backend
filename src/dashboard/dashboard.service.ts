import { Injectable } from '@nestjs/common';
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

const n = (v: unknown) => Number(v ?? 0);
const round = (v: number) => Math.round(v * 100) / 100;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService, private readonly quotes: QuotesService, private readonly orders: ServiceOrdersService) {}

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
}
