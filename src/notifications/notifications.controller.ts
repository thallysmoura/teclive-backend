import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

const uid = (req: Request) => (req.user as { id: string }).id;

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() req: Request, @Query('unread') unread?: string) {
    const userId = uid(req);
    const [lista, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, ...(unread === 'true' ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, title: true, message: true, data: true, readAt: true, createdAt: true },
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { lista, unreadCount };
  }

  @Post('read-all')
  async readAll(@Req() req: Request) {
    await this.prisma.notification.updateMany({ where: { userId: uid(req), readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  @Post(':id/read')
  async read(@Req() req: Request, @Param('id') id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId: uid(req), readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }
}
