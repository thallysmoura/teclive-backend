import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpException, Post, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AiService, type AiMessage } from './ai.service.js';

const LIMIT_PER_MINUTE = 20;
const hits = new Map<string, number[]>();

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService, private readonly prisma: PrismaService) {}

  @Get('status')
  status() {
    return { configured: this.ai.configured };
  }

  /** Conversa genérica: { messages: [{role, content}], temperature?, maxTokens? } ou { prompt, system? }. */
  @Post('chat')
  async chat(@Req() req: Request, @Body() body: { prompt?: string; system?: string; messages?: AiMessage[]; temperature?: number; maxTokens?: number }) {
    const userId = (req.user as { id: string }).id;
    const now = Date.now();
    const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= LIMIT_PER_MINUTE) throw new HttpException('Muitas solicitações de IA. Aguarde um minuto.', 429);
    hits.set(userId, [...recent, now]);

    const messages = body.messages ?? (body.prompt ? [...(body.system ? [{ role: 'system' as const, content: body.system }] : []), { role: 'user' as const, content: body.prompt }] : null);
    const valid = Array.isArray(messages) && messages.length > 0 && messages.length <= 40 && messages.every((m) => ['system', 'user', 'assistant'].includes(m?.role) && typeof m.content === 'string' && m.content.length > 0 && m.content.length <= 8000);
    if (!valid) throw new BadRequestException('Mensagem inválida.');
    return this.ai.chat(messages!, { temperature: Math.min(Math.max(body.temperature ?? 0.4, 0), 1), maxTokens: Math.min(body.maxTokens ?? 800, 2000), feature: 'chat', userId });
  }

  /** Custo da IA (só administradores): totais, por recurso, por dia e últimas chamadas, com dólar e real. */
  @Get('usage')
  async usage(@Req() req: Request) {
    const me = await this.prisma.user.findUnique({ where: { id: (req.user as { id: string }).id }, select: { role: true } });
    if (me?.role !== 'ADMIN') throw new ForbiddenException('Apenas administradores veem o custo da IA.');
    const rows = await this.prisma.aiUsage.findMany({ orderBy: { createdAt: 'desc' }, take: 5000 });
    const sum = (list: typeof rows) => ({ calls: list.length, promptTokens: list.reduce((s, r) => s + r.promptTokens, 0), completionTokens: list.reduce((s, r) => s + r.completionTokens, 0), costUsd: list.reduce((s, r) => s + Number(r.costUsd), 0) });
    const group = (key: (r: (typeof rows)[number]) => string) => {
      const map = new Map<string, typeof rows>();
      for (const r of rows) map.set(key(r), [...(map.get(key(r)) ?? []), r]);
      return [...map.entries()].map(([k, list]) => ({ key: k, ...sum(list) }));
    };
    const rate = await usdToBrl();
    return {
      total: sum(rows),
      today: sum(rows.filter((r) => r.createdAt.toDateString() === new Date().toDateString())),
      byFeature: group((r) => r.feature).sort((a, b) => b.costUsd - a.costUsd),
      byModel: group((r) => r.model).sort((a, b) => b.costUsd - a.costUsd),
      byDay: group((r) => r.createdAt.toISOString().slice(0, 10)).sort((a, b) => (a.key < b.key ? 1 : -1)).slice(0, 30),
      recent: rows.slice(0, 20).map((r) => ({ id: r.id, feature: r.feature, model: r.model, promptTokens: r.promptTokens, completionTokens: r.completionTokens, costUsd: Number(r.costUsd), createdAt: r.createdAt })),
      rate,
      since: rows.length ? rows[rows.length - 1].createdAt : null,
    };
  }
}

let rateCache: { at: number; value: { brl: number; source: string } } | null = null;
async function usdToBrl(): Promise<{ brl: number; source: string }> {
  if (rateCache && Date.now() - rateCache.at < 3_600_000) return rateCache.value;
  let value = { brl: 5.5, source: 'valor padrão (cotação indisponível)' };
  try {
    const res = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', { signal: AbortSignal.timeout(5000) });
    const j = (await res.json()) as { USDBRL?: { bid?: string } };
    const bid = Number(j.USDBRL?.bid);
    if (bid > 0) value = { brl: bid, source: 'cotação do dia (AwesomeAPI)' };
  } catch { /* usa o padrão */ }
  rateCache = { at: Date.now(), value };
  return value;
}
