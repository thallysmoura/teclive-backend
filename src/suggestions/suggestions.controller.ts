import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpException, Patch, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { R2Service } from '../storage/r2.service.js';

const CATEGORIES = ['Visual / layout', 'Novo campo ou coluna', 'Novo filtro ou busca', 'Novo relatório ou gráfico', 'Fluxo / usabilidade', 'Desempenho', 'Correção de erro', 'Outro'];
const STATUSES = ['NOVA', 'EM_ANALISE', 'PLANEJADA', 'CONCLUIDA', 'DESCARTADA'];
const STATUS_LABEL: Record<string, string> = { NOVA: 'Pendente', EM_ANALISE: 'Em análise', PLANEJADA: 'Planejada', CONCLUIDA: 'Resolvido', DESCARTADA: 'Descartada' };
const MAX_IMAGE = 1200 * 1024;
const LIMIT_PER_MINUTE = 6;
const hits = new Map<string, number[]>();

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Sugestões de melhoria enviadas pelas telas: captura anotada no R2, texto e autoria no Postgres. */
@UseGuards(JwtAuthGuard)
@Controller('suggestions')
export class SuggestionsController {
  constructor(private readonly prisma: PrismaService, private readonly storage: R2Service) {}

  private async isAdmin(req: Request) {
    const u = await this.prisma.user.findUnique({ where: { id: (req.user as { id: string }).id }, select: { role: true } });
    return u?.role === 'ADMIN';
  }

  @Get('categories')
  categories() {
    return CATEGORIES;
  }

  /** Imagem anotada (WEBP/JPG/PNG): nome = hash do conteúdo, guardada no R2. */
  @Post('image')
  async image(@Req() req: Request) {
    const body = req.body as unknown;
    if (!Buffer.isBuffer(body) || body.length === 0) throw new BadRequestException('Imagem não enviada.');
    if (body.length > MAX_IMAGE) throw new BadRequestException('A imagem ficou grande demais (máximo de 1,2 MB).');
    const isJpeg = body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
    const isPng = body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isWebp = body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP';
    const kind = isJpeg ? { ext: 'jpg', type: 'image/jpeg' } : isPng ? { ext: 'png', type: 'image/png' } : isWebp ? { ext: 'webp', type: 'image/webp' } : null;
    if (!kind) throw new BadRequestException('Formato de imagem inválido.');
    const key = `suggestions/${createHash('sha256').update(body).digest('hex')}.${kind.ext}`;
    await this.storage.put(key, body, kind.type);
    return { imageUrl: this.storage.publicUrl(key) };
  }

  @Post()
  async create(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const userId = (req.user as { id: string }).id;
    const now = Date.now();
    const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= LIMIT_PER_MINUTE) throw new HttpException('Muitas sugestões em pouco tempo. Aguarde um minuto.', 429);
    hits.set(userId, [...recent, now]);

    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 4000) : '';
    const category = CATEGORIES.includes(clean(body.category, 40)) ? clean(body.category, 40) : 'Outro';
    const title = clean(body.title, 160) || clean(description.split(/\n\nObservações/)[0], 80) || 'Sugestão de melhoria';
    const screenPath = clean(body.screenPath, 300);
    const imageUrl = clean(body.imageUrl, 500);
    if (description.length < 10) throw new BadRequestException('Descreva a melhoria com um pouco mais de detalhe.');
    if (!screenPath.startsWith('/')) throw new BadRequestException('Tela inválida.');
    if (imageUrl && !this.storage.keyFromUrl(imageUrl)) throw new BadRequestException('Imagem inválida.');

    const saved = await this.prisma.suggestion.create({
      data: { userId, category, title, description, screenPath, screenTitle: clean(body.screenTitle, 200) || screenPath, imageUrl: imageUrl || null, viewport: clean(body.viewport, 40) || null, userAgent: clean(req.headers['user-agent'], 300) || null },
      select: { id: true, createdAt: true },
    });
    return saved;
  }

  /** Sugestões enviadas pela própria pessoa, com a situação de cada uma. */
  @Get('mine')
  mine(@Req() req: Request) {
    return this.prisma.suggestion.findMany({ where: { userId: (req.user as { id: string }).id }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, title: true, description: true, category: true, screenTitle: true, imageUrl: true, status: true, createdAt: true } });
  }

  /** Lista para administradores. */
  @Get()
  async list(@Req() req: Request) {
    if (!(await this.isAdmin(req))) throw new ForbiddenException('Apenas administradores veem as sugestões.');
    const rows = await this.prisma.suggestion.findMany({ orderBy: { createdAt: 'desc' }, take: 300, include: { user: { select: { name: true, email: true, avatarUrl: true } } } });
    return rows.map(({ user, ...r }) => ({ ...r, author: user }));
  }

  @Patch(':id/status')
  async setStatus(@Req() req: Request, @Param('id') id: string, @Body() body: { status?: string }) {
    if (!(await this.isAdmin(req))) throw new ForbiddenException('Apenas administradores alteram o andamento.');
    if (!body.status || !STATUSES.includes(body.status)) throw new BadRequestException('Situação inválida.');
    const actorId = (req.user as { id: string }).id;
    const current = await this.prisma.suggestion.findUnique({ where: { id }, select: { status: true, title: true, userId: true, user: { select: { name: true, role: true } } } });
    if (!current) throw new BadRequestException('Sugestão não encontrada.');
    if (current.status === body.status) return { ok: true };
    await this.prisma.suggestion.update({ where: { id }, data: { status: body.status } });

    // Avisa todos os administradores (e quem enviou, se não for admin) sobre a mudança de situação.
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { name: true } });
    const admins = await this.prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    const label = STATUS_LABEL[body.status];
    const title = body.status === 'CONCLUIDA' ? 'Sugestão resolvida' : 'Sugestão atualizada';
    const at = new Date().toISOString();
    const rows = admins.map((a) => ({ userId: a.id, title, message: `${actor?.name ?? 'Um administrador'} marcou a sugestão "${current.title}" (de ${current.user.name}) como ${label}.`, data: { type: 'suggestion', suggestionId: id, status: body.status, at, url: '/sugestoes' } }));
    if (!admins.some((a) => a.id === current.userId)) rows.push({ userId: current.userId, title, message: `Sua sugestão "${current.title}" agora está como ${label}.`, data: { type: 'suggestion', suggestionId: id, status: body.status, at, url: '' } });
    await this.prisma.notification.createMany({ data: rows });
    return { ok: true };
  }
}
