import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { PresenceService } from '../presence/presence.service.js';
import { validateEmailDomain } from './email-domain.js';
import { UsersService } from './users.service.js';

vi.mock('./email-domain.js', () => ({ validateEmailDomain: vi.fn() }));

describe('admin edits user identity', () => {
  let service: UsersService;
  let stored: { id: string; name: string; email: string; role: string; permissions: string[] };
  let race = false;
  beforeEach(() => {
    vi.mocked(validateEmailDomain).mockReset().mockResolvedValue(undefined);
    race = false;
    stored = { id: 'ana', name: 'Ana', email: 'ana@gmail.com', role: 'USER', permissions: ['inicio'] };
    const prisma = { user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id) return where.id === stored.id ? { ...stored } : null;
        return where.email === 'taken@gmail.com' ? { id: 'other' } : where.email === stored.email ? { ...stored } : null;
      },
      update: async ({ data }: { data: { name: string; email: string } }) => {
        if (race) throw { code: 'P2002' };
        stored = { ...stored, ...data };
        return { ...stored };
      },
    } } as unknown as PrismaService;
    service = new UsersService(prisma, new PresenceService());
  });

  it('updates name and email without changing permissions or role', async () => {
    await service.updateProfile('ana', { name: 'Ana Maria', email: 'ana.maria@gmail.com' });
    expect(stored).toEqual({ id: 'ana', name: 'Ana Maria', email: 'ana.maria@gmail.com', role: 'USER', permissions: ['inicio'] });
  });
  it('allows keeping the same email', async () => {
    await service.updateProfile('ana', { name: 'Ana Maria', email: 'ana@gmail.com' });
    expect(stored.name).toBe('Ana Maria');
  });
  it('rejects an email already used by another account', async () => {
    await expect(service.updateProfile('ana', { name: 'Ana Maria', email: 'taken@gmail.com' })).rejects.toMatchObject({ status: 409 });
    expect(stored.name).toBe('Ana');
  });
  it('does not save a changed email with an invalid domain', async () => {
    vi.mocked(validateEmailDomain).mockRejectedValue(new BadRequestException());
    await expect(service.updateProfile('ana', { name: 'Ana Maria', email: 'ana@missing.invalid' })).rejects.toMatchObject({ status: 400 });
    expect(stored.email).toBe('ana@gmail.com');
  });
  it('returns 404 for an account that does not exist', async () => {
    await expect(service.updateProfile('unknown', { name: 'Ana Maria', email: 'ana@gmail.com' })).rejects.toMatchObject({ status: 404 });
  });
  it('handles a concurrent unique-email collision as a conflict', async () => {
    race = true;
    await expect(service.updateProfile('ana', { name: 'Ana Maria', email: 'new@gmail.com' })).rejects.toMatchObject({ status: 409 });
  });
});
