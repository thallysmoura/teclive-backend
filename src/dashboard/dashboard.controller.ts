import { Controller, Get, HttpException, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { DashboardService } from './dashboard.service.js';

const aiHits = new Map<string, number[]>();

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  /** Relatórios de dados estratégicos: kind = geral | comercial | operacional | estoque | cadastros. */
  @Get('report')
  report(@Req() req: Request, @Query('kind') kind?: string) {
    return this.service.strategicReport((req.user as { id: string }).id, ['comercial', 'operacional', 'estoque', 'cadastros'].includes(kind ?? '') ? (kind as string) : 'geral');
  }

  @Get('overview')
  overview(@Req() req: Request) { return this.service.overview((req.user as { id: string }).id); }

  /** Resumo executivo com IA (administradores; no máximo 10 por minuto). */
  @Post('ai-summary')
  aiSummary(@Req() req: Request) {
    const id = (req.user as { id: string }).id;
    const now = Date.now();
    const recent = (aiHits.get(id) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= 10) throw new HttpException('Muitas solicitações de resumo. Aguarde um minuto.', 429);
    aiHits.set(id, [...recent, now]);
    return this.service.aiSummary(id);
  }
}
