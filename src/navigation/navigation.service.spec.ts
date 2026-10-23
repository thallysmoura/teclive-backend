import type { SidebarItem } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { NavigationService } from './navigation.service.js';

describe('persistent sidebar navigation', () => {
  let service: NavigationService;
  let items: SidebarItem[];
  beforeEach(() => {
    items = [
      { key: 'inicio', label: 'Início', href: '/home', section: 'main', sortOrder: 0, embedUrl: null, parentKey: null, createdById: null },
      { key: 'administrativo', label: 'Administrativo', href: null, section: 'group', sortOrder: 0, embedUrl: null, parentKey: null, createdById: null },
      { key: 'controle_acesso', label: 'Controle de Acesso', href: '/access-control', section: 'admin', sortOrder: 0, embedUrl: null, parentKey: null, createdById: null },
      { key: 'item_financeiro', label: 'Financeiro', href: '/items/item_financeiro', section: 'main', sortOrder: 1, embedUrl: null, parentKey: null, createdById: null },
    ];
    const prisma = {
      user: { count: async () => 6, findUnique: async ({ where }: { where: { id: string } }) => where.id === 'missing' ? null : { id: where.id, role: where.id.startsWith('admin') ? 'ADMIN' : 'USER', permissions: where.id === 'company-member' ? ['dados_empresa'] : where.id === 'member' ? ['item_financeiro'] : where.id.endsWith('allowed') ? ['log_acesso'] : [] } },
      sidebarItem: {
        findMany: async (args?: { where?: { parentKey?: string } }) => args?.where?.parentKey ? items.filter((item) => item.parentKey === args.where!.parentKey) : [...items],
        findUnique: async ({ where }: { where: { key?: string; href?: string } }) => items.find((item) => where.key ? item.key === where.key : item.href === where.href) ?? null,
        aggregate: async () => ({ _max: { sortOrder: 1, embedUrl: null, parentKey: null, createdById: null } }),
        create: async ({ data }: { data: SidebarItem }) => { items.push(data); return { ...data }; },
        update: async ({ where, data }: { where: { key: string }; data: Partial<SidebarItem> }) => {
          const item = items.find((candidate) => candidate.key === where.key)!;
          Object.assign(item, data);
          return { ...item };
        },
      },
    } as unknown as PrismaService;
    service = new NavigationService(prisma);
  });

  it('shows all menu entries to an administrator', async () => {
    expect((await service.listForUser('admin')).map((item) => item.key)).toEqual(['inicio', 'administrativo', 'controle_acesso', 'item_financeiro']);
  });
  it('includes the total registered users only on the access-control entry', async () => {
    const entries = await service.listForUser('admin');
    expect(entries.find((item) => item.key === 'controle_acesso')).toHaveProperty('badge', 6);
    expect(entries.find((item) => item.key === 'inicio')).not.toHaveProperty('badge');
    expect((await service.listForUser('member')).every((item) => !('badge' in item))).toBe(true);
  });
  it('only shows permitted main entries to regular users', async () => {
    expect((await service.listForUser('member')).map((item) => item.key)).toEqual(['item_financeiro']);
    expect(await service.listForUser('pending')).toEqual([]);
  });
  it('shows access logs only after an explicit grant, including admins', async () => {
    items.push({ key: 'log_acesso', label: 'Log de acesso', href: '/access-logs', section: 'admin', sortOrder: 1, embedUrl: null, parentKey: null, createdById: null });
    expect((await service.listForUser('admin')).some((item) => item.key === 'log_acesso')).toBe(false);
    expect((await service.listForUser('admin-allowed')).some((item) => item.key === 'log_acesso')).toBe(true);
    expect((await service.listForUser('member-allowed')).some((item) => item.key === 'log_acesso')).toBe(true);
    expect((await service.listForUser('member')).some((item) => item.key === 'log_acesso')).toBe(false);
  });
  it('creates a stable internal page and independent permission key', async () => {
    const item = await service.create('Contratos', undefined, undefined, undefined, 'admin');
    expect(item.label).toBe('Contratos');
    expect(item.key).toMatch(/^item_[a-f0-9-]+$/);
    expect(item.href).toBe('/items/contratos');
    expect(item.section).toBe('main');
    expect((await service.listForUser('admin')).some((candidate) => candidate.label === 'Contratos')).toBe(true);
  });
  it('shows company data to administrators and explicitly granted members', async () => {
    items.push({ key: 'dados_empresa', label: 'Dados da empresa', href: '/company', section: 'admin', sortOrder: 2, embedUrl: null, parentKey: null, createdById: null });
    expect((await service.listForUser('company-member')).map((item) => item.key)).toEqual(['dados_empresa']);
    expect((await service.listForUser('admin')).some((item) => item.key === 'dados_empresa')).toBe(true);
    expect((await service.listForUser('pending')).some((item) => item.key === 'dados_empresa')).toBe(false);
  });
  it('renames an entry without breaking its route or permission key', async () => {
    const item = await service.rename('inicio', 'Indicadores');
    expect(item).toMatchObject({ key: 'inicio', href: '/home', label: 'Indicadores' });
  });
  it('blocks direct access to a page without its permission', async () => {
    await expect(service.getForUser('item_financeiro', 'pending')).rejects.toMatchObject({ status: 403 });
    expect((await service.getForUser('item_financeiro', 'member')).label).toBe('Financeiro');
  });
  it('returns 404 for unknown entries', async () => {
    await expect(service.rename('unknown', 'Nome')).rejects.toMatchObject({ status: 404 });
    await expect(service.getForUser('unknown', 'admin')).rejects.toMatchObject({ status: 404 });
  });
  it('uses readable unique URLs and keeps permission keys when renamed', async () => {
    const first = await service.create('Gestão Financeira', 'https://example.com/report', undefined, undefined, 'admin');
    const duplicate = await service.create('Gestão Financeira', undefined, undefined, undefined, 'admin');
    expect(first.href).toBe('/items/gestao-financeira');
    expect(first.embedUrl).toBe('https://example.com/report');
    expect(duplicate.href).toBe('/items/gestao-financeira-2');
    expect((await service.getForUser('gestao-financeira', 'admin')).key).toBe(first.key);
    const renamed = await service.rename(first.key, 'Relatórios');
    expect(renamed.key).toBe(first.key);
    expect(renamed.href).toBe('/items/relatorios');
    expect(renamed.embedUrl).toBe('https://example.com/report');
    await expect(service.getForUser('relatorios', 'pending')).rejects.toMatchObject({ status: 403 });
    expect((await service.rename(first.key, 'Relatórios', null)).embedUrl).toBeNull();
  });
  it('does not allow renaming administrative entries', async () => {
    await expect(service.rename('administrativo', 'Novo')).rejects.toMatchObject({ status: 403 });
    await expect(service.rename('controle_acesso', 'Novo')).rejects.toMatchObject({ status: 403 });
  });
  it('restarts the whole batch transaction after a concurrent URL conflict', async () => {
    const transaction = vi.fn().mockRejectedValueOnce({ code: 'P2002' }).mockResolvedValueOnce(items[0]);
    const service = new NavigationService({ $transaction: transaction } as unknown as PrismaService);
    expect(await service.create('Grupo', null, undefined, [{ label: 'Filho' }], 'admin')).toEqual(items[0]);
    expect(transaction).toHaveBeenCalledTimes(2);
  });
});
