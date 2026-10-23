import { beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { PresenceService } from '../presence/presence.service.js';
import { UsersService } from './users.service.js';

describe('custom page permissions', () => {
  let service: UsersService;
  let saved: string[];
  beforeEach(() => {
    saved = [];
    const prisma = {
      sidebarItem: {
        findMany: async ({ where }: { where: { key?: { in: string[] } } }) => ['item_financeiro', 'log_acesso', 'dados_empresa'].filter((key) => !where.key || where.key.in.includes(key)).map((key) => ({ key })),
      },
      user: { update: async ({ data }: { data: { permissions: string[] } }) => { saved = data.permissions; return { id: 'ana', permissions: saved }; } },
    } as unknown as PrismaService;
    service = new UsersService(prisma, new PresenceService());
  });
  it('grants a new page permission together with existing built-in permissions', async () => {
    await service.updatePermissions('ana', ['inicio', 'item_financeiro']);
    expect(saved).toEqual(['inicio', 'item_financeiro']);
  });
  it('allows granting and revoking access-log permission explicitly', async () => {
    await service.updatePermissions('ana', ['log_acesso']);
    expect(saved).toEqual(['log_acesso']);
    await service.updatePermissions('ana', []);
    expect(saved).toEqual([]);
  });
  it('includes company data in the catalog and accepts granting and revoking it', async () => {
    expect(await service.permissionsCatalog()).toContainEqual({ key: 'dados_empresa' });
    await service.updatePermissions('ana', ['dados_empresa']);
    expect(saved).toEqual(['dados_empresa']);
    await service.updatePermissions('ana', []);
    expect(saved).toEqual([]);
  });
  it.each(['unknown_key', 'administrativo'])('rejects non-page permission %s without updating the account', async (key) => {
    await expect(service.updatePermissions('ana', [key])).rejects.toMatchObject({ status: 400 });
    expect(saved).toEqual([]);
  });
});
