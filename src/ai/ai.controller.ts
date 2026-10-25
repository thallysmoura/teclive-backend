import { BadRequestException, Body, Controller, Get, HttpException, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AiService, type AiMessage } from './ai.service.js';

const LIMIT_PER_MINUTE = 20;
const hits = new Map<string, number[]>();

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

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
    return this.ai.chat(messages!, { temperature: Math.min(Math.max(body.temperature ?? 0.4, 0), 1), maxTokens: Math.min(body.maxTokens ?? 800, 2000) });
  }
}
