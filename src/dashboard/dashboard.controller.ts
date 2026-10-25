import { Controller, Get, HttpException, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { DashboardService } from './dashboard.service.js';

const aiHits = new Map<string, number[]>();

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('overview')
  overview(@Req() req: Request) { return this.service.overview((req.user as { id: string }).id); }

  /** Resumo executivo com IA (administradores; no máximo 5 por minuto). */
  @Post('ai-summary')
  aiSummary(@Req() req: Request) {
    const id = (req.user as { id: string }).id;
    const now = Date.now();
    const recent = (aiHits.get(id) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= 5) throw new HttpException('Muitas solicitações de resumo. Aguarde um minuto.', 429);
    aiHits.set(id, [...recent, now]);
    return this.service.aiSummary(id);
  }
}
