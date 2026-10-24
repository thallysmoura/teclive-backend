import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export const CATALOG_KINDS = ['brands', 'product-groups', 'activity-branches'] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

@Injectable()
export class CatalogsService {
  constructor(private readonly prisma: PrismaService) {}

  private kind(value: string): CatalogKind {
    if (!(CATALOG_KINDS as readonly string[]).includes(value)) throw new NotFoundException('Cadastro não encontrado.');
    return value as CatalogKind;
  }

  async list(kindParam: string, params: { descricao?: string; exibirInativos?: boolean; decrescente?: boolean; ordenarPor?: string }) {
    const kind = this.kind(kindParam);
    const direction = params.decrescente ? 'desc' : 'asc';
    const lista = await this.prisma.catalogItem.findMany({
      where: {
        kind,
        ...(params.exibirInativos ? {} : { isActive: true }),
        ...(params.descricao ? { description: { contains: params.descricao, mode: 'insensitive' } } : {}),
      },
      orderBy: params.ordenarPor === 'isActive' ? [{ isActive: direction }, { description: 'asc' }] : [{ description: direction }],
    });
    return { lista, totalRegistros: lista.length };
  }

  async stats(kindParam: string) {
    const kind = this.kind(kindParam);
    const items = await this.prisma.catalogItem.findMany({ where: { kind } });
    const active = items.filter((i) => i.isActive);
    const base = { total: items.length, active: active.length, inactive: items.length - active.length };
    if (kind === 'activity-branches') return { ...base, used: 0, unused: active.length, top: [], stockByItem: [], usageLabel: 'pessoas' };

    const products = await this.prisma.stockProduct.findMany({ where: { isActive: true }, include: { balances: { select: { quantity: true } } } });
    const key = (p: (typeof products)[number]) => (kind === 'brands' ? p.brand : p.productGroup);
    const counts = new Map<string, number>();
    const stock = new Map<string, number>();
    for (const p of products) {
      counts.set(key(p), (counts.get(key(p)) ?? 0) + 1);
      stock.set(key(p), (stock.get(key(p)) ?? 0) + p.balances.reduce((s, b) => s + Number(b.quantity), 0) * Number(p.costPrice ?? 0));
    }
    const used = active.filter((i) => (counts.get(i.description) ?? 0) > 0).length;
    const sorted = (map: Map<string, number>) => [...map.entries()].map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value).slice(0, 6);
    return { ...base, used, unused: active.length - used, top: sorted(counts), stockByItem: sorted(stock), usageLabel: 'produtos' };
  }

  async get(kindParam: string, id: string) {
    const item = await this.prisma.catalogItem.findFirst({ where: { id, kind: this.kind(kindParam) } });
    if (!item) throw new NotFoundException('Registro não encontrado.');
    return item;
  }

  private async clean(kind: CatalogKind, description?: string, ignoreId?: string) {
    const value = (description ?? '').trim();
    if (!value) throw new BadRequestException('Informe a descrição.');
    if (value.length > 200) throw new BadRequestException('A descrição deve ter no máximo 200 caracteres.');
    const duplicate = await this.prisma.catalogItem.findFirst({
      where: { kind, description: { equals: value, mode: 'insensitive' }, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) },
    });
    if (duplicate) throw new ConflictException('Já existe um registro com essa descrição.');
    return value;
  }

  async create(kindParam: string, description?: string) {
    const kind = this.kind(kindParam);
    return this.prisma.catalogItem.create({ data: { kind, description: await this.clean(kind, description) } });
  }

  async rename(kindParam: string, id: string, description?: string) {
    const item = await this.get(kindParam, id);
    const value = await this.clean(item.kind as CatalogKind, description, id);
    if (item.kind === 'brands') await this.prisma.stockProduct.updateMany({ where: { brand: item.description }, data: { brand: value } });
    if (item.kind === 'product-groups') await this.prisma.stockProduct.updateMany({ where: { productGroup: item.description }, data: { productGroup: value } });
    return this.prisma.catalogItem.update({ where: { id }, data: { description: value } });
  }

  async setActive(kindParam: string, id: string, isActive: boolean) {
    await this.get(kindParam, id);
    return this.prisma.catalogItem.update({ where: { id }, data: { isActive } });
  }

  async remove(kindParam: string, id: string) {
    const item = await this.get(kindParam, id);
    const used =
      item.kind === 'brands' ? await this.prisma.stockProduct.count({ where: { brand: item.description } })
      : item.kind === 'product-groups' ? await this.prisma.stockProduct.count({ where: { productGroup: item.description } })
      : 0;
    if (used > 0) throw new ConflictException(`Este registro está em uso por ${used} produto(s) e não pode ser excluído. Inative-o.`);
    await this.prisma.catalogItem.delete({ where: { id } });
    return { ok: true };
  }
}
