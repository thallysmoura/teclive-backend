import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpException, NotFoundException, Patch, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

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
  constructor(private readonly prisma: PrismaService) {}

  private async isAdmin(req: Request) {
    const u = await this.prisma.user.findUnique({ where: { id: (req.user as { id: string }).id }, select: { role: true } });
    return u?.role === 'ADMIN';
  }

  @Get('categories')
  categories() {
    return CATEGORIES;
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
    const imageData = typeof body.imageData === 'string' ? body.imageData : '';
    if (description.length < 10) throw new BadRequestException('Descreva a melhoria com um pouco mais de detalhe.');
    if (!screenPath.startsWith('/')) throw new BadRequestException('Tela inválida.');
    // A captura de tela fica no próprio Postgres (base64), sem ocupar o armazenamento do Cloudflare.
    if (imageData) {
      const m = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(imageData);
      if (!m) throw new BadRequestException('Imagem inválida.');
      const bytes = Buffer.from(m[2], 'base64');
      if (bytes.length > MAX_IMAGE) throw new BadRequestException('A imagem ficou grande demais (máximo de 1,2 MB).');
      const ok = m[1] === 'png' ? bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) : m[1] === 'jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 : bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
      if (!ok) throw new BadRequestException('O arquivo não é uma imagem válida.');
    }

    return this.prisma.suggestion.create({
      data: { userId, category, title, description, screenPath, screenTitle: clean(body.screenTitle, 200) || screenPath, imageData: imageData || null, viewport: clean(body.viewport, 40) || null, userAgent: clean(req.headers['user-agent'], 300) || null },
      select: { id: true, createdAt: true },
    });
  }

  /** Lista leve (sem o base64): a imagem de cada sugestão vem de GET :id/image. */
  private static readonly LIST = { id: true, title: true, description: true, category: true, screenTitle: true, screenPath: true, viewport: true, imageUrl: true, status: true, createdAt: true } as const;
  private withFlag<T extends { imageUrl: string | null }>(rows: (T & { id: string })[], ids: Set<string>) {
    return rows.map((r) => ({ ...r, hasImage: !!r.imageUrl || ids.has(r.id) }));
  }
  private async idsWithData(where: object) {
    const rows = await this.prisma.suggestion.findMany({ where: { ...where, imageData: { not: null } }, select: { id: true } });
    return new Set(rows.map((r) => r.id));
  }

  /** Sugestões enviadas pela própria pessoa, com a situação de cada uma. */
  @Get('mine')
  async mine(@Req() req: Request) {
    const where = { userId: (req.user as { id: string }).id };
    const [rows, ids] = await Promise.all([this.prisma.suggestion.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, select: SuggestionsController.LIST }), this.idsWithData(where)]);
    return this.withFlag(rows, ids);
  }

  /** Lista para administradores. */
  @Get()
  async list(@Req() req: Request) {
    if (!(await this.isAdmin(req))) throw new ForbiddenException('Apenas administradores veem as sugestões.');
    const [rows, ids] = await Promise.all([
      this.prisma.suggestion.findMany({ orderBy: { createdAt: 'desc' }, take: 300, select: { ...SuggestionsController.LIST, user: { select: { name: true, email: true, avatarUrl: true } } } }),
      this.idsWithData({}),
    ]);
    return this.withFlag(rows.map(({ user, ...r }) => ({ ...r, author: user })), ids);
  }

  /** Imagem da sugestão (base64 do banco → arquivo): só quem enviou ou administradores. */
  @Get(':id/image')
  async image(@Req() req: Request, @Param('id') id: string, @Res() res: Response) {
    const row = await this.prisma.suggestion.findUnique({ where: { id }, select: { userId: true, imageData: true } });
    if (!row?.imageData) throw new NotFoundException('Imagem não encontrada.');
    if (row.userId !== (req.user as { id: string }).id && !(await this.isAdmin(req))) throw new ForbiddenException('Sem acesso a esta imagem.');
    const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(row.imageData);
    if (!m) throw new NotFoundException('Imagem não encontrada.');
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(Buffer.from(m[2], 'base64'));
  }

  /** Autor ou administrador complementa/corrige o texto da sugestão. */
  @Patch(':id')
  async edit(@Req() req: Request, @Param('id') id: string, @Body() body: { description?: string }) {
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 4000) : '';
    if (description.length < 10) throw new BadRequestException('Descreva a melhoria com um pouco mais de detalhe.');
    const current = await this.prisma.suggestion.findUnique({ where: { id }, select: { userId: true } });
    if (!current) throw new NotFoundException('Sugestão não encontrada.');
    if (current.userId !== (req.user as { id: string }).id && !(await this.isAdmin(req))) throw new ForbiddenException('Só quem enviou ou um administrador pode editar.');
    await this.prisma.suggestion.update({ where: { id }, data: { description, title: clean(description.split(/\n\nObservações/)[0], 80) || 'Sugestão de melhoria' } });
    return { ok: true };
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
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { name: true, avatarUrl: true } });
    const admins = await this.prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    const label = STATUS_LABEL[body.status];
    const title = body.status === 'CONCLUIDA' ? 'Sugestão resolvida' : 'Sugestão atualizada';
    const at = new Date().toISOString();
    const rows = admins.map((a) => ({ userId: a.id, title, message: `${actor?.name ?? 'Um administrador'} marcou a sugestão "${current.title}" (de ${current.user.name}) como ${label}.`, data: { type: 'suggestion', suggestionId: id, status: body.status, at, url: '/sugestoes', name: actor?.name, avatarUrl: actor?.avatarUrl ?? null } }));
    if (!admins.some((a) => a.id === current.userId)) rows.push({ userId: current.userId, title, message: `Sua sugestão "${current.title}" agora está como ${label}.`, data: { type: 'suggestion', suggestionId: id, status: body.status, at, url: '', name: actor?.name, avatarUrl: actor?.avatarUrl ?? null } });
    await this.prisma.notification.createMany({ data: rows });
    return { ok: true };
  }
}
