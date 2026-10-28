import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { SidebarItem } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class NavigationService {
  private insideTransaction = false;
  constructor(private readonly prisma: PrismaService) {}
  async listForUser(id: string): Promise<(SidebarItem & { badge?: number })[]> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { role: true, permissions: true } });
    if (!user) throw new UnauthorizedException();
    const items = await this.prisma.sidebarItem.findMany({ orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] });
    const news = await this.prisma.newsPost.count({ where: user.role === 'ADMIN' ? {} : { OR: [{ toAll: true }, { targets: { some: { userId: id } } }] } });
    const withNews = <T extends { key: string }>(item: T) => (item.key === 'mural' && news > 0 ? { ...item, badge: news } : item);
    if (user.role === 'ADMIN') {
      const [totalUsers, pendingSuggestions] = await Promise.all([this.prisma.user.count(), this.prisma.suggestion.count({ where: { status: 'NOVA' } })]);
      return items.filter((item) => item.key !== 'log_acesso' || user.permissions.includes('log_acesso')).map(withNews).map((item) => item.key === 'controle_acesso' ? { ...item, badge: totalUsers } : item.key === 'envios_melhorias' ? { ...item, badge: pendingSuggestions } : item);
    }
    const visible = new Set(items.filter((item) => user.permissions.includes(item.key)).map((item) => item.parentKey).filter(Boolean));
    return items.filter((item) => item.key === 'ajuda' || item.key === 'mural' || (['log_acesso', 'dados_empresa'].includes(item.key) && user.permissions.includes(item.key)) || (item.section === 'main' && (user.permissions.includes(item.key) || visible.has(item.key))))
      .map((item) => visible.has(item.key) && !user.permissions.includes(item.key) ? { ...item, href: null, embedUrl: null } : item).map(withNews);
  }

  private async availableHref(label: string, key?: string): Promise<string> {
    const base = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pagina';
    let href = `/items/${base}`;
    let suffix = 2;
    for (;;) {
      const existing = await this.prisma.sidebarItem.findUnique({ where: { href } });
      if (!existing || existing.key === key) return href;
      href = `/items/${base}-${suffix++}`;
    }
  }

  async create(label: string, embedUrl?: string | null, parentKey?: string, subItems: { label: string; embedUrl?: string | null }[] = [], creatorId?: string): Promise<SidebarItem> {
    if (!creatorId) throw new UnauthorizedException();
    if (parentKey) {
      const parent = await this.prisma.sidebarItem.findUnique({ where: { key: parentKey } });
      if (!parent || parent.section !== 'main' || parent.parentKey || !parent.href?.startsWith('/items/')) throw new BadRequestException('Selecione um item principal criado para adicionar subitens.');
      if (subItems.length) throw new BadRequestException('Subitens não podem ter outros subitens.');
    }
    if (subItems.length) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const service = new NavigationService(tx as PrismaService);
          service.insideTransaction = true;
          const parent = await service.create(label, embedUrl, undefined, [], creatorId);
          for (const child of subItems) await service.create(child.label, child.embedUrl, parent.key, [], creatorId);
          return parent;
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') return this.create(label, embedUrl, parentKey, subItems, creatorId);
        throw error;
      }
    }
    const key = `item_${randomUUID()}`;
    const last = await this.prisma.sidebarItem.aggregate({ _max: { sortOrder: true } });
    const href = await this.availableHref(label);
    try {
      return await this.prisma.sidebarItem.create({ data: { key, label, href, embedUrl: embedUrl ?? null, parentKey: parentKey ?? null, createdById: creatorId, section: 'main', sortOrder: (last._max.sortOrder ?? 0) + 1 } });
    } catch (error) {
      if (!this.insideTransaction && (error as { code?: string }).code === 'P2002') return this.create(label, embedUrl, parentKey, [], creatorId);
      throw error;
    }
  }

  async rename(key: string, label: string, embedUrl?: string | null): Promise<SidebarItem> {
    const item = await this.prisma.sidebarItem.findUnique({ where: { key } });
    if (!item) throw new NotFoundException('Item não encontrado.');
    if (item.section !== 'main') throw new ForbiddenException('Os itens administrativos não podem ser editados.');
    const custom = item.href?.startsWith('/items/');
    const href = custom ? await this.availableHref(label, key) : item.href;
    try { return await this.prisma.sidebarItem.update({ where: { key }, data: { label, href, ...(custom && embedUrl !== undefined ? { embedUrl } : {}) } }); }
    catch (error) {
      if ((error as { code?: string }).code === 'P2025') throw new NotFoundException('Item não encontrado.');
      if ((error as { code?: string }).code === 'P2002') return this.rename(key, label, embedUrl);
      throw error;
    }
  }

  async remove(key: string, actorId: string): Promise<{ key: string }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "key" FROM "sidebar_items" WHERE "key" = ${key} FOR UPDATE`;
      const item = await tx.sidebarItem.findUnique({ where: { key } });
      if (!item) throw new NotFoundException('Item não encontrado.');
      if (item.section !== 'main' || !item.href?.startsWith('/items/')) throw new ForbiddenException('Apenas itens criados podem ser excluídos.');
      if (!actorId || item.createdById !== actorId) throw new ForbiddenException('Você só pode excluir itens que criou.');
      const children = await tx.sidebarItem.findMany({ where: { parentKey: key }, select: { key: true, createdById: true } });
      if (children.some((child) => child.createdById !== actorId)) throw new ForbiddenException('Este item contém subitens criados por outro administrador e não pode ser excluído.');
      for (const permission of [key, ...children.map((child) => child.key)]) {
        await tx.$executeRaw`UPDATE "users" SET "permissions" = array_remove("permissions", ${permission}) WHERE ${permission} = ANY("permissions")`;
      }
      await tx.sidebarItem.delete({ where: { key } });
      return { key };
    });
  }

  async getForUser(key: string, id: string): Promise<SidebarItem> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { role: true, permissions: true } });
    if (!user) throw new UnauthorizedException();
    const item = await this.prisma.sidebarItem.findUnique({ where: { key } }) ?? await this.prisma.sidebarItem.findUnique({ where: { href: `/items/${key}` } });
    if (!item || !item.href?.startsWith('/items/')) throw new NotFoundException('Página não encontrada.');
    if (user.role !== 'ADMIN' && (item.section !== 'main' || !user.permissions.includes(item.key))) throw new ForbiddenException('Aguardando permissão para acessar esta página.');
    return item;
  }
}
