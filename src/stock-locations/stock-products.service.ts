import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

const PAGE_SIZE = 50;

@Injectable()
export class StockProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { search?: string; page?: number; orderBy?: string; desc?: boolean; brand?: string; group?: string }) {
    const where: Prisma.StockProductWhereInput = {
      balances: { some: {} },
      ...(params.search ? { description: { contains: params.search, mode: 'insensitive' } } : {}),
      ...(params.brand ? { brand: params.brand } : {}),
      ...(params.group ? { productGroup: params.group } : {}),
    };
    const rows = await this.prisma.stockProduct.findMany({ where, include: { balances: { select: { quantity: true } } } });
    const items = rows.map((p) => ({
      id: p.id,
      description: p.description,
      brand: p.brand,
      productGroup: p.productGroup,
      unit: p.unit,
      balance: p.balances.reduce((sum, b) => sum + Number(b.quantity), 0),
    }));
    const dir = params.desc ? -1 : 1;
    items.sort((a, b) =>
      params.orderBy === 'balance' ? (a.balance - b.balance) * dir : a.description.localeCompare(b.description, 'pt-BR', { sensitivity: 'base' }) * dir,
    );
    const page = Math.max(1, params.page ?? 1);
    return { lista: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), totalRegistros: items.length, tamanhoPagina: PAGE_SIZE };
  }

  async options() {
    const rows = await this.prisma.stockProduct.findMany({
      where: { isActive: true },
      orderBy: { description: 'asc' },
      select: { id: true, description: true, unit: true, costPrice: true, balances: { select: { locationId: true, quantity: true } } },
    });
    return rows.map((p) => ({
      id: p.id,
      description: p.description,
      unit: p.unit,
      costPrice: Number(p.costPrice ?? 0),
      balances: p.balances.map((b) => ({ locationId: b.locationId, quantity: Number(b.quantity) })),
    }));
  }

  async filters() {
    const rows = await this.prisma.stockProduct.findMany({ select: { brand: true, productGroup: true } });
    const uniq = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    return { brands: uniq(rows.map((r) => r.brand)), groups: uniq(rows.map((r) => r.productGroup)) };
  }

  async detail(id: string) {
    const product = await this.prisma.stockProduct.findUnique({
      where: { id },
      include: { balances: { include: { location: { select: { description: true } } } } },
    });
    if (!product) throw new NotFoundException('Produto não encontrado.');
    const balances = product.balances
      .map((b) => ({ location: b.location.description, quantity: Number(b.quantity) }))
      .sort((a, b) => a.location.localeCompare(b.location, 'pt-BR'));
    return {
      id: product.id,
      description: product.description,
      brand: product.brand,
      productGroup: product.productGroup,
      unit: product.unit,
      unitName: product.unitName,
      balances,
      total: balances.reduce((sum, b) => sum + b.quantity, 0),
    };
  }
}
