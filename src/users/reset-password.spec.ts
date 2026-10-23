import * as bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { PresenceService } from '../presence/presence.service.js';
import { UsersService } from './users.service.js';

describe('administrator password reset', () => {
  let service: UsersService;
  let storedHash: string;
  let tokens: { userId: string; revokedAt: Date | null }[];

  beforeEach(async () => {
    storedHash = await bcrypt.hash('old-password', 4);
    tokens = [{ userId: 'ana', revokedAt: null }, { userId: 'other', revokedAt: null }];
    // Only the database boundary is replaced; hashing and reset behavior are real.
    const transaction = {
      user: {
        findUnique: async ({ where }: { where: { id: string } }) => where.id === 'ana' ? { id: 'ana', name: 'Ana', email: 'ana@gmail.com' } : null,
        update: async ({ data }: { data: { passwordHash: string } }) => { storedHash = data.passwordHash; return { id: 'ana', name: 'Ana', email: 'ana@gmail.com' }; },
      },
      refreshToken: {
        updateMany: async ({ where, data }: { where: { userId: string }; data: { revokedAt: Date } }) => {
          tokens.forEach((token) => { if (token.userId === where.userId) token.revokedAt = data.revokedAt; });
          return { count: 1 };
        },
      },
    };
    const prisma = { $transaction: async (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction) } as unknown as PrismaService;
    service = new UsersService(prisma, new PresenceService());
  });

  it('replaces the old password with a generated password stored only as a hash', async () => {
    const result = await service.resetPassword('ana');
    expect(result.password.length).toBeGreaterThanOrEqual(12);
    expect(await bcrypt.compare('old-password', storedHash)).toBe(false);
    expect(await bcrypt.compare(result.password, storedHash)).toBe(true);
    expect(storedHash).not.toBe(result.password);
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('revokes refresh tokens only for the affected user', async () => {
    await service.resetPassword('ana');
    expect(tokens[0].revokedAt).toBeInstanceOf(Date);
    expect(tokens[1].revokedAt).toBeNull();
  });

  it('returns 404 for an unknown account without changing another account', async () => {
    const originalHash = storedHash;
    await expect(service.resetPassword('unknown')).rejects.toMatchObject({ status: 404 });
    expect(storedHash).toBe(originalHash);
    expect(tokens.every((token) => token.revokedAt === null)).toBe(true);
  });

  it('generates a different password on every reset', async () => {
    const first = await service.resetPassword('ana');
    const second = await service.resetPassword('ana');
    expect(first.password).not.toBe(second.password);
    expect(await bcrypt.compare(first.password, storedHash)).toBe(false);
    expect(await bcrypt.compare(second.password, storedHash)).toBe(true);
  });
});
