import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

const PAGE_SIZE = 20;
const MANUAL_OPERATION = 2;

export type MovementItemInput = {
  operation?: 'ADD' | 'REMOVE' | 'TRANSFER';
  productId?: string;
  quantity?: number;
  cost?: number;
  fromLocationId?: string;
  toLocationId?: string;
};

@Injectable()
export class StockMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { q?: string; from?: string; until?: string; hideCancelled?: boolean; page?: number; orderBy?: string; desc?: boolean }) {
    const until = params.until ? new Date(params.until) : undefined;
    until?.setUTCHours(23, 59, 59, 999);
    const where: Prisma.StockMovementWhereInput = {
      ...(params.q ? { OR: [{ description: { contains: params.q, mode: 'insensitive' } }, { userName: { contains: params.q, mode: 'insensitive' } }] } : {}),
      ...(params.hideCancelled ? { cancellationDate: null } : {}),
      ...(params.from || until ? { movementDate: { ...(params.from ? { gte: new Date(params.from) } : {}), ...(until ? { lte: until } : {}) } } : {}),
    };
    const direction = params.desc === false ? 'asc' : 'desc';
    const orderBy: Prisma.StockMovementOrderByWithRelationInput =
      params.orderBy === 'description' ? { description: direction } : params.orderBy === 'userName' ? { userName: direction } : { movementDate: direction };
    const page = Math.max(1, params.page ?? 1);
    const [lista, totalRegistros] = await Promise.all([
      this.prisma.stockMovement.findMany({ where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { lista, totalRegistros, tamanhoPagina: PAGE_SIZE };
  }

  async get(id: string) {
    const movement = await this.prisma.stockMovement.findUnique({ where: { id }, include: { items: true } });
    if (!movement) throw new NotFoundException('Movimento de estoque não encontrado.');
    return movement;
  }

  async create(userId: string, input: { description?: string; movementDate?: string; items?: MovementItemInput[] }) {
    const description = (input.description ?? '').trim();
    if (!description) throw new BadRequestException('Informe a descrição do movimento.');
    if (description.length > 200) throw new BadRequestException('A descrição deve ter no máximo 200 caracteres.');
    const movementDate = input.movementDate ? new Date(input.movementDate) : new Date();
    if (Number.isNaN(movementDate.getTime())) throw new BadRequestException('Data do movimento inválida.');
    if (!input.items?.length) throw new BadRequestException('Adicione ao menos um produto ao movimento.');

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });

    return this.prisma.$transaction(async (tx) => {
      const rows: Prisma.StockMovementItemCreateManyMovementInput[] = [];

      const move = async (productId: string, locationId: string, delta: number) => {
        const location = await tx.stockLocation.findUnique({ where: { id: locationId } });
        if (!location || !location.isActive) throw new BadRequestException('Local de estoque inválido ou inativo.');
        const balance = await tx.stockProductBalance.findUnique({ where: { productId_locationId: { productId, locationId } } });
        const next = Number(balance?.quantity ?? 0) + delta;
        if (next < 0) throw new BadRequestException(`Saldo insuficiente em "${location.description}".`);
        await tx.stockProductBalance.upsert({
          where: { productId_locationId: { productId, locationId } },
          create: { productId, locationId, quantity: next },
          update: { quantity: next },
        });
        return location.description;
      };

      for (const item of input.items!) {
        const quantity = Number(item.quantity);
        const cost = Number(item.cost ?? 0);
        if (!item.operation || !['ADD', 'REMOVE', 'TRANSFER'].includes(item.operation)) throw new BadRequestException('Operação inválida.');
        if (!item.productId) throw new BadRequestException('Selecione o produto.');
        if (!(quantity > 0)) throw new BadRequestException('Informe uma quantidade maior que zero.');
        if (!(cost >= 0)) throw new BadRequestException('Custo inválido.');
        const product = await tx.stockProduct.findUnique({ where: { id: item.productId } });
        if (!product) throw new BadRequestException('Produto não encontrado.');
        const base = { productId: product.id, description: product.description, quantity, unit: product.unit, cost };

        if (item.operation === 'ADD') {
          if (!item.toLocationId) throw new BadRequestException('Selecione o estoque de destino.');
          rows.push({ ...base, type: 'IN', locationName: await move(product.id, item.toLocationId, quantity) });
        } else if (item.operation === 'REMOVE') {
          if (!item.fromLocationId) throw new BadRequestException('Selecione o estoque de saída.');
          rows.push({ ...base, type: 'OUT', locationName: await move(product.id, item.fromLocationId, -quantity) });
        } else {
          if (!item.fromLocationId || !item.toLocationId) throw new BadRequestException('Selecione os estoques de saída e de destino.');
          if (item.fromLocationId === item.toLocationId) throw new BadRequestException('Os estoques de saída e destino devem ser diferentes.');
          rows.push({ ...base, type: 'OUT', locationName: await move(product.id, item.fromLocationId, -quantity) });
          rows.push({ ...base, type: 'IN', locationName: await move(product.id, item.toLocationId, quantity) });
        }
      }

      return tx.stockMovement.create({
        data: { description, movementDate, userName: user?.name ?? 'Usuário', operation: MANUAL_OPERATION, items: { createMany: { data: rows } } },
        include: { items: true },
      });
    });
  }
}
