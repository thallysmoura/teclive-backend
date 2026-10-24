import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

const PAGE_SIZE = 20;

export type ServiceInput = {
  description?: string; category?: string; modality?: number; allowsRental?: boolean; blocksOnDelinquency?: boolean;
  cost?: number; margin?: number; price?: number;
};


function lastMonths(dates: Date[], count = 6) {
  const now = new Date();
  const buckets = Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return { key: d.getFullYear() * 12 + d.getMonth(), label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), value: 0 };
  });
  for (const date of dates) {
    const key = date.getFullYear() * 12 + date.getMonth();
    const bucket = buckets.find((b) => b.key === key);
    if (bucket) bucket.value++;
  }
  return buckets.map(({ label, value }) => ({ label, value }));
}

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { q?: string; exibirInativos?: boolean; type?: string; category?: string; page?: number; orderBy?: string; desc?: boolean }) {
    const where: Prisma.ServiceItemWhereInput = {
      ...(params.exibirInativos ? {} : { isActive: true }),
      ...(params.q ? { description: { contains: params.q, mode: 'insensitive' } } : {}),
      ...(params.type === '1' || params.type === '2' ? { modality: Number(params.type) } : {}),
      ...(params.category ? { category: params.category } : {}),
    };
    const dir = params.desc ? 'desc' : 'asc';
    const orderBy: Prisma.ServiceItemOrderByWithRelationInput | Prisma.ServiceItemOrderByWithRelationInput[] = params.orderBy === 'isActive' ? { isActive: dir } : params.orderBy === 'price' ? { price: dir } : params.orderBy === 'description' ? { description: dir } : [{ legacyId: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }];
    const page = Math.max(1, params.page ?? 1);
    const [lista, totalRegistros] = await Promise.all([
      this.prisma.serviceItem.findMany({ where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      this.prisma.serviceItem.count({ where }),
    ]);
    return { lista, totalRegistros, tamanhoPagina: PAGE_SIZE };
  }

  async stats() {
    const items = await this.prisma.serviceItem.findMany({ select: { description: true, category: true, modality: true, cost: true, margin: true, price: true, isActive: true, createdAt: true } });
    const active = items.filter((s) => s.isActive);
    const num = (v: unknown) => Number(v);
    const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
    const byCategory = new Map<string, number>();
    for (const s of active) byCategory.set(s.category ?? 'Sem categoria', (byCategory.get(s.category ?? 'Sem categoria') ?? 0) + 1);
    const top = [...active].sort((a, b) => num(b.price) - num(a.price))[0];
    const ranges = [
      { label: 'Até R$ 100', test: (p: number) => p <= 100 }, { label: 'R$ 101–300', test: (p: number) => p > 100 && p <= 300 },
      { label: 'R$ 301–600', test: (p: number) => p > 300 && p <= 600 }, { label: 'Acima de R$ 600', test: (p: number) => p > 600 },
    ];
    return {
      total: items.length,
      active: active.length,
      inactive: items.length - active.length,
      contracts: active.filter((s) => s.modality === 2).length,
      workOrders: active.filter((s) => s.modality === 1).length,
      averagePrice: avg(active.map((s) => num(s.price))),
      averageMargin: avg(active.map((s) => num(s.margin))),
      averageProfit: avg(active.map((s) => num(s.price) - num(s.cost))),
      topService: top ? { description: top.description, price: num(top.price) } : null,
      categories: [...byCategory.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6),
      priceRanges: ranges.map((r) => ({ label: r.label, value: active.filter((s) => r.test(num(s.price))).length })),
      monthly: lastMonths(items.map((s) => s.createdAt)),
    };
  }

  async categories() {
    const rows = await this.prisma.serviceItem.findMany({ where: { category: { not: null } }, select: { category: true }, distinct: ['category'], orderBy: { category: 'asc' } });
    return rows.map((r) => r.category as string);
  }

  async get(id: string) {
    const item = await this.prisma.serviceItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Serviço não encontrado.');
    return item;
  }

  private data(input: ServiceInput) {
    const description = (input.description ?? '').trim();
    if (!description) throw new BadRequestException('Informe a descrição do serviço.');
    if (description.length > 200) throw new BadRequestException('A descrição deve ter no máximo 200 caracteres.');
    if (!input.category?.trim()) throw new BadRequestException('Selecione a categoria da receita.');
    const cost = Number(input.cost ?? 0), margin = Number(input.margin ?? 0), price = Number(input.price ?? 0);
    if (![cost, margin, price].every((n) => Number.isFinite(n) && n >= 0)) throw new BadRequestException('Valores de precificação inválidos.');
    return {
      description, category: input.category.trim(), modality: input.modality === 2 ? 2 : 1,
      allowsRental: !!input.allowsRental, blocksOnDelinquency: !!input.blocksOnDelinquency, cost, margin, price,
    };
  }

  create(input: ServiceInput) {
    return this.prisma.serviceItem.create({ data: this.data(input) });
  }

  async update(id: string, input: ServiceInput) {
    await this.get(id);
    return this.prisma.serviceItem.update({ where: { id }, data: this.data(input) });
  }

  async setActive(id: string, isActive: boolean) {
    await this.get(id);
    return this.prisma.serviceItem.update({ where: { id }, data: { isActive } });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.serviceItem.delete({ where: { id } });
    return { ok: true };
  }
}
