import { Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 1 day — not remembered (session-only cookie)
const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — "mantenha-me conectado"

function hash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class RefreshTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(userId: string, remember: boolean) {
    const raw = randomBytes(48).toString('hex');
    const ttl = remember ? REMEMBER_TTL_MS : SESSION_TTL_MS;

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hash(raw),
        remember,
        expiresAt: new Date(Date.now() + ttl),
      },
    });

    return { raw, ttl, remember };
  }

  /** Validates a presented refresh token and rotates it (reuse detection: a revoked token is rejected). */
  async rotate(raw: string) {
    const tokenHash = hash(raw);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      return null;
    }

    const next = await this.issue(record.userId, record.remember);

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date(), replacedBy: hash(next.raw) },
    });

    return { userId: record.userId, ...next };
  }

  async revoke(raw: string) {
    const tokenHash = hash(raw);
    await this.prisma.refreshToken
      .updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }
}
