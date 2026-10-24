import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

const PAGE_SIZE = 20;
const UNITS: Record<string, string> = { UN: 'Unidade', PC: 'Peça', MT: 'Metro', PACOTE: 'Pacote', KIT: 'Kit', CX: 'Caixa', KG: 'Quilograma', LT: 'Litro' };
export const UNIT_OPTIONS = Object.entries(UNITS).map(([code, name]) => ({ code, name }));

export type ProductInput = {
  description?: string; unit?: string; productGroup?: string; brand?: string; model?: string; alternativeDescription?: string;
  identifier?: string; supplierCode?: string; barcode?: string; allowNegativeStock?: boolean; allowRental?: boolean;
  costPrice?: number; margin?: number; salePrice?: number;
};

const blank = (v?: string) => (v?.trim() ? v.trim() : null);


function lastMonths(dates: Date[], count = 6) {
  const now = new Date();
  const buckets = Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return { key: d.getFullYear() * 12 + d.getMonth(), label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), value: 0 };
  });
  for (const date of dates) {
    const bucket = buckets.find((b) => b.key === date.getFullYear() * 12 + date.getMonth());
    if (bucket) bucket.value++;
  }
  return buckets.map(({ label, value }) => ({ label, value }));
}

function topBy<T>(items: T[], key: (item: T) => string, amount: (item: T) => number, limit = 6) {
  const map = new Map<string, number>();
  for (const item of items) map.set(key(item), (map.get(key(item)) ?? 0) + amount(item));
  return [...map.entries()].map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value).slice(0, limit);
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { q?: string; exibirInativos?: boolean; brand?: string; group?: string; page?: number; orderBy?: string; desc?: boolean }) {
    const where: Prisma.StockProductWhereInput = {
      ...(params.exibirInativos ? {} : { isActive: true }),
      ...(params.brand ? { brand: params.brand } : {}),
      ...(params.group ? { productGroup: params.group } : {}),
      ...(params.q ? { OR: [{ description: { contains: params.q, mode: 'insensitive' } }, { identifier: { contains: params.q, mode: 'insensitive' } }, { supplierCode: { contains: params.q, mode: 'insensitive' } }] } : {}),
    };
    const dir = params.desc ? 'desc' : 'asc';
    const orderBy: Prisma.StockProductOrderByWithRelationInput | Prisma.StockProductOrderByWithRelationInput[] = params.orderBy === 'isActive' ? { isActive: dir } : params.orderBy === 'salePrice' ? { salePrice: dir } : params.orderBy === 'description' ? { description: dir } : [{ legacyId: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }];
    const page = Math.max(1, params.page ?? 1);
    const [lista, totalRegistros] = await Promise.all([
      this.prisma.stockProduct.findMany({ where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      this.prisma.stockProduct.count({ where }),
    ]);
    return { lista, totalRegistros, tamanhoPagina: PAGE_SIZE };
  }

  async stats() {
    const products = await this.prisma.stockProduct.findMany({ include: { balances: { select: { quantity: true } } } });
    const active = products.filter((p) => p.isActive);
    const qty = (p: (typeof products)[number]) => p.balances.reduce((sum, b) => sum + Number(b.quantity), 0);
    const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
    const stockValue = active.reduce((sum, p) => sum + qty(p) * Number(p.costPrice ?? 0), 0);
    const stockSale = active.reduce((sum, p) => sum + qty(p) * Number(p.salePrice ?? 0), 0);
    const ranges = [
      { label: 'Até R$ 50', test: (v: number) => v <= 50 }, { label: 'R$ 51–150', test: (v: number) => v > 50 && v <= 150 },
      { label: 'R$ 151–500', test: (v: number) => v > 150 && v <= 500 }, { label: 'Acima de R$ 500', test: (v: number) => v > 500 },
    ];
    return {
      total: products.length,
      active: active.length,
      inactive: products.length - active.length,
      averagePrice: avg(active.map((p) => Number(p.salePrice ?? 0))),
      averageMargin: avg(active.map((p) => Number(p.margin ?? 0))),
      stockValue,
      potentialProfit: stockSale - stockValue,
      withStock: active.filter((p) => qty(p) > 0).length,
      withoutStock: active.filter((p) => qty(p) <= 0).length,
      byGroup: topBy(active, (p) => p.productGroup, () => 1),
      byBrand: topBy(active, (p) => p.brand, () => 1),
      stockByGroup: topBy(active, (p) => p.productGroup, (p) => qty(p) * Number(p.costPrice ?? 0)),
      priceRanges: ranges.map((r) => ({ label: r.label, value: active.filter((p) => r.test(Number(p.salePrice ?? 0))).length })),
      monthly: lastMonths(products.map((p) => p.createdAt)),
    };
  }

  units() {
    return UNIT_OPTIONS;
  }

  async get(id: string) {
    const product = await this.prisma.stockProduct.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Produto não encontrado.');
    return product;
  }

  private data(input: ProductInput) {
    const description = (input.description ?? '').trim();
    if (!description) throw new BadRequestException('Informe a descrição do produto.');
    if (description.length > 300) throw new BadRequestException('A descrição deve ter no máximo 300 caracteres.');
    const unit = input.unit && UNITS[input.unit] ? input.unit : null;
    if (!unit) throw new BadRequestException('Selecione a unidade de medida.');
    if (!input.productGroup?.trim()) throw new BadRequestException('Selecione o grupo de produtos.');
    if (!input.brand?.trim()) throw new BadRequestException('Selecione a marca.');
    const costPrice = Number(input.costPrice ?? 0), margin = Number(input.margin ?? 0), salePrice = Number(input.salePrice ?? 0);
    if (![costPrice, margin, salePrice].every((n) => Number.isFinite(n) && n >= 0)) throw new BadRequestException('Valores de precificação inválidos.');
    return {
      description, unit, unitName: UNITS[unit], productGroup: input.productGroup.trim(), brand: input.brand.trim(),
      model: blank(input.model), alternativeDescription: blank(input.alternativeDescription), identifier: blank(input.identifier),
      supplierCode: blank(input.supplierCode), barcode: blank(input.barcode),
      allowNegativeStock: !!input.allowNegativeStock, allowRental: !!input.allowRental, costPrice, margin, salePrice,
    };
  }

  create(input: ProductInput) {
    return this.prisma.stockProduct.create({ data: this.data(input) });
  }

  async update(id: string, input: ProductInput) {
    await this.get(id);
    return this.prisma.stockProduct.update({ where: { id }, data: this.data(input) });
  }

  async setActive(id: string, isActive: boolean) {
    await this.get(id);
    return this.prisma.stockProduct.update({ where: { id }, data: { isActive } });
  }

  async remove(id: string) {
    await this.get(id);
    const [stock, movements] = await Promise.all([
      this.prisma.stockProductBalance.count({ where: { productId: id, quantity: { not: 0 } } }),
      this.prisma.stockMovementItem.count({ where: { productId: id } }),
    ]);
    if (stock > 0 || movements > 0) throw new ConflictException('Este produto possui saldo ou movimentações e não pode ser excluído. Inative-o.');
    await this.prisma.stockProduct.delete({ where: { id } });
    return { ok: true };
  }
}
