import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from '../auth/dto/login.dto.js';
import { LocationService } from './location.service.js';
import type { Prisma } from '@prisma/client';
import type { AccessLogsQueryDto } from './access-logs-query.dto.js';

@Injectable()
export class AccessLogsService {
  constructor(private readonly prisma: PrismaService, private readonly locations: LocationService) {}

  async record(user: { id: string; name: string; email: string; avatarUrl?: string | null } | null, device: string, dto: LoginDto, ip?: string, userAgent?: string, status: 'VALID' | 'INVALID' = 'VALID') {
    const location = dto.locationStatus === 'shared' ? dto.location : undefined;
    const place = location ? this.locations.nearest(location.latitude, location.longitude) : {};
    return this.prisma.accessLog.create({ data: {
      userId: user?.id, userName: (user?.name ?? 'Usuário não identificado').slice(0, 100), userEmail: dto.email.slice(0, 254), avatarUrl: user?.avatarUrl ?? null, status, device,
      ip: ip?.slice(0, 64), userAgent: userAgent?.slice(0, 512),
      locationStatus: location ? 'shared' : dto.locationStatus === 'denied' ? 'denied' : dto.locationStatus === 'unavailable' ? 'unavailable' : 'not_requested',
      ...(location ? { latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy, ...place } : {}),
    } });
  }

  async list(page: number, filters: Pick<AccessLogsQueryDto, 'search' | 'from' | 'until'> = {}) {
    const take = 5;
    const search = filters.search?.trim();
    const where: Prisma.AccessLogWhereInput = {
      ...(search ? { OR: [{ userName: { contains: search, mode: 'insensitive' } }, { userEmail: { contains: search, mode: 'insensitive' } }] } : {}),
      ...(filters.from || filters.until ? { createdAt: { ...(filters.from ? { gte: new Date(filters.from) } : {}), ...(filters.until ? { lt: new Date(filters.until) } : {}) } } : {}),
    };
    return this.prisma.$transaction(async (tx) => {
      const total = await tx.accessLog.count({ where });
      const pageCount = Math.max(1, Math.ceil(total / take));
      const current = Math.min(page, pageCount);
      const items = await tx.accessLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (current - 1) * take, take, include: { user: { select: { avatarUrl: true } } } });
      return { items: items.map(({ user, ...log }) => ({ ...log, avatarUrl: log.avatarUrl ?? user?.avatarUrl ?? null })), total, page: current, pageCount };
    });
  }
}
