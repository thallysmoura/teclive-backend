import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class StockBalancesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { from?: string; until?: string }) {
    const from = params.from ? new Date(params.from) : undefined;
    const until = params.until ? new Date(params.until) : undefined;
    if (until) until.setUTCHours(23, 59, 59, 999);
    const lista = await this.prisma.stockBalance.findMany({
      where: { balanceDate: { ...(from ? { gte: from } : {}), ...(until ? { lte: until } : {}) } },
      include: { location: { select: { description: true } } },
      orderBy: { balanceDate: 'desc' },
    });
    return { lista, totalRegistros: lista.length };
  }

  async create(userId: string, input: { locationId?: string; filterType?: string; filterIds?: string[] }) {
    if (!input.locationId) throw new BadRequestException('Selecione o local de estoque.');
    const [location, user] = await Promise.all([
      this.prisma.stockLocation.findUnique({ where: { id: input.locationId } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    ]);
    if (!location) throw new BadRequestException('Local de estoque não encontrado.');
    return this.prisma.stockBalance.create({
      data: {
        locationId: location.id,
        userName: user?.name ?? 'Usuário',
        filterType: input.filterType === 'GROUPS' ? 'GROUPS' : 'PRODUCTS',
        filterIds: input.filterIds ?? [],
      },
      include: { location: { select: { description: true } } },
    });
  }
}
