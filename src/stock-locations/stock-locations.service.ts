import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class StockLocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { descricao?: string; exibirInativos?: boolean; ordenarPor?: string; decrescente?: boolean }) {
    const where = {
      ...(params.exibirInativos ? {} : { isActive: true }),
      ...(params.descricao
        ? { description: { contains: params.descricao, mode: 'insensitive' as const } }
        : {}),
    };

    const direction = params.decrescente ? 'desc' : 'asc';
    const lista = await this.prisma.stockLocation.findMany({
      where,
      orderBy:
        params.ordenarPor === 'description'
          ? [{ description: direction }]
          : params.ordenarPor === 'isActive'
            ? [{ isActive: direction }, { description: 'asc' }]
            : [{ isPrincipal: 'desc' }, { description: 'asc' }],
    });

    return { lista, totalRegistros: lista.length };
  }

  async get(id: string) {
    const location = await this.prisma.stockLocation.findUnique({ where: { id } });
    if (!location) throw new NotFoundException('Local de estoque não encontrado.');
    return location;
  }

  private async cleanDescription(description: string | undefined, ignoreId?: string) {
    const value = (description ?? '').trim();
    if (!value) throw new BadRequestException('Informe a descrição do local de estoque.');
    if (value.length > 200) throw new BadRequestException('A descrição deve ter no máximo 200 caracteres.');
    const duplicate = await this.prisma.stockLocation.findFirst({
      where: { description: { equals: value, mode: 'insensitive' }, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) },
    });
    if (duplicate) throw new ConflictException('Já existe um local de estoque com essa descrição.');
    return value;
  }

  async create(description?: string) {
    const value = await this.cleanDescription(description);
    return this.prisma.stockLocation.create({ data: { description: value } });
  }

  async rename(id: string, description?: string) {
    await this.get(id);
    const value = await this.cleanDescription(description, id);
    return this.prisma.stockLocation.update({ where: { id }, data: { description: value } });
  }

  async setPrincipal(id: string) {
    const location = await this.get(id);
    if (!location.isActive) throw new BadRequestException('Ative o local antes de defini-lo como principal.');
    await this.prisma.$transaction([
      this.prisma.stockLocation.updateMany({ where: { isPrincipal: true }, data: { isPrincipal: false } }),
      this.prisma.stockLocation.update({ where: { id }, data: { isPrincipal: true } }),
    ]);
    return this.get(id);
  }

  async setActive(id: string, isActive: boolean) {
    const location = await this.get(id);
    if (!isActive && location.isPrincipal) throw new BadRequestException('O estoque principal não pode ser inativado.');
    return this.prisma.stockLocation.update({ where: { id }, data: { isActive } });
  }

  async remove(id: string) {
    const location = await this.get(id);
    if (location.isPrincipal) throw new BadRequestException('O estoque principal não pode ser excluído.');
    const [balances, products] = await Promise.all([
      this.prisma.stockBalance.count({ where: { locationId: id } }),
      this.prisma.stockProductBalance.count({ where: { locationId: id, quantity: { not: 0 } } }),
    ]);
    if (balances > 0 || products > 0) {
      throw new ConflictException('Este local possui saldo ou balanços e não pode ser excluído. Inative-o.');
    }
    await this.prisma.stockProductBalance.deleteMany({ where: { locationId: id } });
    await this.prisma.stockLocation.delete({ where: { id } });
    return { ok: true };
  }
}
