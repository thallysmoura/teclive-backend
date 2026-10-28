import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { R2Service } from '../storage/r2.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PresenceGateway } from '../presence/presence.gateway.js';
import { PrismaService } from '../prisma/prisma.service.js';

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

type ImageInput = { fileName?: string; fileBase64?: string };
type PostInput = { title?: string; body?: string; allowComments?: boolean; toAll?: boolean; userIds?: string[]; image?: ImageInput; removeImage?: boolean };

/** Mural de Notícias: administradores publicam (para todos ou para pessoas específicas) e decidem se aceita comentários. */
@Controller('news')
@UseGuards(JwtAuthGuard)
export class NewsController {
  constructor(private readonly prisma: PrismaService, private readonly gateway: PresenceGateway, private readonly storage: R2Service) {}

  /** Confere o conteúdo da imagem (não confia só no tipo informado), guarda no Cloudflare R2 e devolve o endereço. */
  private async saveImage(img: ImageInput): Promise<string> {
    const data = Buffer.from(img.fileBase64 ?? '', 'base64');
    if (!data.length) throw new BadRequestException('Arquivo vazio.');
    if (data.length > 3 * 1024 * 1024) throw new BadRequestException('A imagem deve ter no máximo 3 MB.');
    const isJpeg = data[0] === 0xff && data[1] === 0xd8;
    const isPng = data.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const isWebp = data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP';
    if (!(isJpeg || isPng || isWebp)) throw new BadRequestException('Envie uma imagem JPG, PNG ou WEBP.');
    const ext = isJpeg ? 'jpg' : isPng ? 'png' : 'webp';
    const key = `mural/${createHash('sha256').update(data).digest('hex')}.${ext}`;
    await this.storage.put(key, data, isJpeg ? 'image/jpeg' : isPng ? 'image/png' : 'image/webp');
    return this.storage.publicUrl(key);
  }

  /** Apaga o arquivo do R2 quando nenhuma outra notícia usa a mesma imagem. */
  private async dropImage(url: string | null | undefined) {
    if (!url || (await this.prisma.newsPost.count({ where: { imageUrl: url } })) > 0) return;
    const key = this.storage.keyFromUrl(url);
    if (key) await this.storage.delete(key).catch(() => undefined);
  }

  private async me(req: Request) {
    const u = await this.prisma.user.findUnique({ where: { id: (req.user as { id: string }).id }, select: { id: true, name: true, role: true, avatarUrl: true } });
    if (!u) throw new ForbiddenException();
    return u;
  }

  private admin(u: { role: string }) { if (u.role !== 'ADMIN') throw new ForbiddenException('Somente administradores podem publicar no mural.'); }

  /** Visível para o administrador (sempre) e para quem foi o destinatário, ou para todos. */
  private canSee(u: { id: string; role: string }, p: { toAll: boolean; targets: { userId: string }[] }) {
    return u.role === 'ADMIN' || p.toAll || p.targets.some((t) => t.userId === u.id);
  }

  private async view(u: { id: string; role: string }, posts: Awaited<ReturnType<NewsController['load']>>) {
    const authors = await this.prisma.user.findMany({ where: { id: { in: posts.map((p) => p.authorId).filter((x): x is string => !!x) } }, select: { id: true, avatarUrl: true } });
    const avatar = new Map(authors.map((a) => [a.id, a.avatarUrl]));
    const names = u.role === 'ADMIN' ? await this.prisma.user.findMany({ where: { id: { in: posts.flatMap((p) => p.targets.map((t) => t.userId)) } }, select: { id: true, name: true } }) : [];
    const nameOf = new Map(names.map((n) => [n.id, n.name]));
    return posts.map((p) => ({
      id: p.id, title: p.title, body: p.body, imageUrl: p.imageUrl, allowComments: p.allowComments, toAll: p.toAll, authorName: p.authorName,
      authorAvatar: p.authorId ? avatar.get(p.authorId) ?? null : null, createdAt: p.createdAt, commentCount: p._count.comments,
      targets: u.role === 'ADMIN' ? p.targets.map((t) => ({ id: t.userId, name: nameOf.get(t.userId) ?? 'Usuário' })) : undefined,
    }));
  }

  private load(where: object = {}) {
    return this.prisma.newsPost.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, include: { targets: true, _count: { select: { comments: true } } } });
  }

  @Get()
  async list(@Req() req: Request) {
    const u = await this.me(req);
    const posts = await this.load(u.role === 'ADMIN' ? {} : { OR: [{ toAll: true }, { targets: { some: { userId: u.id } } }] });
    return this.view(u, posts);
  }

  /** Avisa as pessoas do mural: sino (notificação) e atualização em tempo real. */
  private async notify(post: { id: string; title: string; authorName: string }, ids: string[], title: string) {
    if (!ids.length) return;
    await this.prisma.notification.createMany({ data: ids.map((userId) => ({ userId, title, message: `${post.authorName}: ${post.title}`, data: { type: 'news', postId: post.id, url: `/mural?post=${post.id}` } })) });
    this.gateway.notifyUsers(ids);
  }

  @Post()
  async create(@Req() req: Request, @Body() b: PostInput) {
    const u = await this.me(req); this.admin(u);
    const title = str(b.title, 160), body = str(b.body, 8000);
    if (!title) throw new BadRequestException('Informe o título da notícia.');
    if (!body) throw new BadRequestException('Escreva o texto da notícia.');
    const toAll = b.toAll !== false;
    const userIds = [...new Set(Array.isArray(b.userIds) ? b.userIds.map(String) : [])];
    if (!toAll && !userIds.length) throw new BadRequestException('Escolha ao menos uma pessoa para receber a notícia.');
    const valid = toAll ? [] : (await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true } })).map((x) => x.id);
    if (!toAll && !valid.length) throw new BadRequestException('Pessoas selecionadas não encontradas.');
    const imageUrl = b.image ? await this.saveImage(b.image) : null;
    const post = await this.prisma.newsPost.create({ data: { title, body, imageUrl, toAll, allowComments: b.allowComments !== false, authorId: u.id, authorName: u.name, targets: { create: valid.map((userId) => ({ userId })) } } });
    const recipients = toAll ? (await this.prisma.user.findMany({ where: { id: { not: u.id } }, select: { id: true } })).map((x) => x.id) : valid.filter((id) => id !== u.id);
    await this.notify(post, recipients, 'Nova notícia no mural');
    return { id: post.id };
  }

  @Put(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() b: PostInput) {
    const u = await this.me(req); this.admin(u);
    const cur = await this.prisma.newsPost.findUnique({ where: { id }, include: { targets: true } });
    if (!cur) throw new NotFoundException('Notícia não encontrada.');
    const data: { title?: string; body?: string; allowComments?: boolean; imageUrl?: string | null; toAll?: boolean } = {};
    if (b.title !== undefined) { const t = str(b.title, 160); if (!t) throw new BadRequestException('Informe o título.'); data.title = t; }
    if (b.body !== undefined) { const t = str(b.body, 8000); if (!t) throw new BadRequestException('Escreva o texto.'); data.body = t; }
    if (typeof b.allowComments === 'boolean') data.allowComments = b.allowComments;
    if (b.image) data.imageUrl = await this.saveImage(b.image);
    else if (b.removeImage) data.imageUrl = null;
    // Destinatários: troca a lista e avisa só quem entrou agora.
    let added: string[] = [];
    if (typeof b.toAll === 'boolean') {
      const ids = b.toAll ? [] : [...new Set(Array.isArray(b.userIds) ? b.userIds.map(String) : [])];
      const valid = b.toAll ? [] : (await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((x) => x.id);
      if (!b.toAll && !valid.length) throw new BadRequestException('Escolha ao menos uma pessoa para receber a notícia.');
      data.toAll = b.toAll;
      const before = new Set(cur.targets.map((t) => t.userId));
      added = b.toAll ? (cur.toAll ? [] : (await this.prisma.user.findMany({ where: { id: { not: u.id } }, select: { id: true } })).map((x) => x.id).filter((x) => !before.has(x))) : valid.filter((x) => !before.has(x) && x !== u.id);
      await this.prisma.$transaction([this.prisma.newsTarget.deleteMany({ where: { postId: id } }), this.prisma.newsTarget.createMany({ data: valid.map((userId) => ({ postId: id, userId })) })]);
    }
    await this.prisma.newsPost.update({ where: { id }, data });
    if (data.imageUrl !== undefined && cur.imageUrl && cur.imageUrl !== data.imageUrl) await this.dropImage(cur.imageUrl);
    await this.notify({ id, title: data.title ?? cur.title, authorName: u.name }, added, 'Nova notícia no mural');
    return { ok: true };
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    const u = await this.me(req); this.admin(u);
    const cur = await this.prisma.newsPost.findUnique({ where: { id }, select: { imageUrl: true } });
    if (!cur) throw new NotFoundException('Notícia não encontrada.');
    await this.prisma.newsPost.delete({ where: { id } });
    await this.dropImage(cur.imageUrl);
    return { ok: true };
  }

  private async visiblePost(u: { id: string; role: string }, id: string) {
    const p = await this.prisma.newsPost.findUnique({ where: { id }, include: { targets: true } });
    if (!p || !this.canSee(u, p)) throw new NotFoundException('Notícia não encontrada.');
    return p;
  }

  @Get(':id/comments')
  async comments(@Req() req: Request, @Param('id') id: string) {
    const u = await this.me(req);
    await this.visiblePost(u, id);
    const rows = await this.prisma.newsComment.findMany({ where: { postId: id }, orderBy: { createdAt: 'asc' }, take: 300 });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId).filter((x): x is string => !!x) } }, select: { id: true, avatarUrl: true } });
    const avatar = new Map(users.map((x) => [x.id, x.avatarUrl]));
    return rows.map((r) => ({ id: r.id, userId: r.userId, userName: r.userName, avatarUrl: r.userId ? avatar.get(r.userId) ?? null : null, text: r.text, createdAt: r.createdAt }));
  }

  @Post(':id/comments')
  async comment(@Req() req: Request, @Param('id') id: string, @Body() b: { text?: string }) {
    const u = await this.me(req);
    const p = await this.visiblePost(u, id);
    if (!p.allowComments) throw new ForbiddenException('Esta notícia não aceita comentários.');
    const text = str(b.text, 1000);
    if (!text) throw new BadRequestException('Escreva o comentário.');
    const c = await this.prisma.newsComment.create({ data: { postId: id, userId: u.id, userName: u.name, text } });
    // Avisa o autor da notícia (quando é outra pessoa).
    if (p.authorId && p.authorId !== u.id) {
      await this.prisma.notification.create({ data: { userId: p.authorId, title: 'Novo comentário no mural', message: `${u.name} comentou em "${p.title}": ${text.length > 100 ? `${text.slice(0, 97)}...` : text}`, data: { type: 'news-comment', postId: id, url: `/mural?post=${id}` } } });
      this.gateway.notifyUsers([p.authorId]);
    }
    return { id: c.id, userId: u.id, userName: u.name, avatarUrl: u.avatarUrl, text, createdAt: c.createdAt };
  }

  @Delete(':id/comments/:commentId')
  async removeComment(@Req() req: Request, @Param('id') id: string, @Param('commentId') commentId: string) {
    const u = await this.me(req);
    const c = await this.prisma.newsComment.findFirst({ where: { id: commentId, postId: id } });
    if (!c) throw new NotFoundException('Comentário não encontrado.');
    if (u.role !== 'ADMIN' && c.userId !== u.id) throw new ForbiddenException('Você só pode excluir os seus comentários.');
    await this.prisma.newsComment.delete({ where: { id: commentId } });
    return { ok: true };
  }
}
