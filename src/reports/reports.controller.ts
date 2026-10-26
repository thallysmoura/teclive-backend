import { BadRequestException, Body, Controller, ForbiddenException, HttpException, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReportsAiService } from './reports-ai.service.js';

const hits = new Map<string, number[]>();

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly ai: ReportsAiService, private readonly prisma: PrismaService) {}

  /** Relatório personalizado com IA (administradores; no máximo 8 pedidos por minuto). */
  @Post('ai')
  async generate(@Req() req: Request, @Body() body: { request?: string }) {
    const userId = (req.user as { id: string }).id;
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (me?.role !== 'ADMIN') throw new ForbiddenException('Apenas administradores usam relatórios com IA.');
    const now = Date.now();
    const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= 8) throw new HttpException('Muitos pedidos seguidos. Aguarde um minuto.', 429);
    hits.set(userId, [...recent, now]);
    if (typeof body.request !== 'string') throw new BadRequestException('Descreva o relatório que você quer.');
    return this.ai.generate(userId, body.request);
  }
}
