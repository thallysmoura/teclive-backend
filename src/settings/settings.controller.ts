import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Configurações da empresa: cada seção é um JSON livre (os padrões ficam na tela). Só administradores leem e alteram. */
@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly prisma: PrismaService) {}

  private async admin(req: Request) {
    const user = await this.prisma.user.findUnique({ where: { id: (req.user as { id: string }).id }, select: { role: true, name: true } });
    if (user?.role !== 'ADMIN') throw new ForbiddenException('Apenas administradores acessam as configurações.');
    return user.name;
  }

  private key(section: string) {
    if (!/^[a-z0-9-]{2,60}$/.test(section)) throw new BadRequestException('Seção inválida.');
    return section;
  }

  /** Espaço ocupado pelos arquivos guardados no sistema (tela "Gestão dos arquivos"). */
  @Get('files/usage')
  async usage(@Req() req: Request) {
    await this.admin(req);
    const [orders, quotes] = await Promise.all([
      this.prisma.serviceOrderFile.aggregate({ _count: true, _sum: { size: true } }),
      this.prisma.quoteAttachment.aggregate({ _count: true, _sum: { size: true } }),
    ]);
    return {
      groups: [
        { label: 'Imagens de ordens de serviço', count: orders._count, bytes: orders._sum.size ?? 0 },
        { label: 'Anexos de orçamentos', count: quotes._count, bytes: quotes._sum.size ?? 0 },
      ],
    };
  }

  @Get(':section')
  async get(@Req() req: Request, @Param('section') section: string) {
    await this.admin(req);
    const row = await this.prisma.appSetting.findUnique({ where: { key: this.key(section) } });
    return { value: row?.value ?? null, updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null };
  }

  @Put(':section')
  async put(@Req() req: Request, @Param('section') section: string, @Body() body: { value?: unknown }) {
    const name = await this.admin(req);
    const value = body?.value;
    if (value === null || typeof value !== 'object') throw new BadRequestException('Envie os valores da configuração.');
    if (JSON.stringify(value).length > 100_000) throw new BadRequestException('Configuração grande demais.');
    const saved = await this.prisma.appSetting.upsert({
      where: { key: this.key(section) },
      create: { key: section, value: value as Prisma.InputJsonValue, updatedBy: name },
      update: { value: value as Prisma.InputJsonValue, updatedBy: name },
    });
    return { value: saved.value, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy };
  }
}
