import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PresenceGateway } from '../presence/presence.gateway.js';

export type OpsInput = {
  type: 'comment' | 'attachment' | 'interrupted' | 'closed' | 'cancelled' | 'reopened';
  order: { id: string; number: number; personName: string };
  user: { id?: string; name: string };
  text?: string | null;
  imageUrl?: string | null;
};

const OPEN = [0, 1, 8];

@Injectable()
export class OpsService {
  constructor(private readonly prisma: PrismaService, private readonly gateway: PresenceGateway) {}

  /** Grava o evento operacional e o envia na hora para quem está com o Painel de Acompanhamento aberto. */
  async record(input: OpsInput) {
    try {
      const u = await this.prisma.user.findFirst({ where: input.user.id ? { id: input.user.id } : { name: input.user.name }, select: { id: true, name: true, avatarUrl: true } });
      const ev = await this.prisma.opsEvent.create({
        data: {
          type: input.type, orderId: input.order.id, orderNumber: input.order.number, clientName: input.order.personName,
          userId: u?.id ?? input.user.id ?? null, userName: u?.name ?? input.user.name, avatarUrl: u?.avatarUrl ?? null,
          text: input.text?.slice(0, 1000) ?? null, imageUrl: input.imageUrl ?? null,
        },
      });
      this.gateway.emitOps(ev);
    } catch { /* o painel nunca pode atrapalhar a operação */ }
  }

  /** Empurra o sino de notificações dos administradores conectados. */
  notifyAdmins() { this.gateway.notifyAdmins(); }

  async panel() {
    const now = new Date();
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const [open, interrupted, ready, closedToday, events, scheduledToday] = await Promise.all([
      this.prisma.serviceOrder.findMany({ where: { status: { in: OPEN } }, orderBy: { scheduleEnd: 'asc' } }),
      this.prisma.serviceOrder.findMany({ where: { status: 3 }, orderBy: { interruptedAt: 'asc' } }),
      this.prisma.serviceOrder.count({ where: { status: 7 } }),
      this.prisma.serviceOrder.count({ where: { status: { in: [4, 5, 6] }, closedAt: { gte: start, lt: end } } }),
      this.prisma.opsEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 40 }),
      this.prisma.serviceOrder.count({ where: { status: { in: OPEN }, scheduleStart: { gte: start, lt: end } } }),
    ]);
    const late = open.filter((o) => o.scheduleEnd && o.scheduleEnd.getTime() < now.getTime());
    const row = (o: (typeof open)[number]) => ({ id: o.id, number: o.number, client: o.personName, defect: o.defectName, technicians: o.technicians, scheduleEnd: o.scheduleEnd, interruptedAt: o.interruptedAt });
    const todayEvents = events.filter((e) => e.createdAt >= start);
    return {
      kpis: { open: open.length, late: late.length, interrupted: interrupted.length, ready, closedToday, scheduledToday, commentsToday: todayEvents.filter((e) => e.type === 'comment').length },
      interrupted: interrupted.slice(0, 12).map(row),
      late: late.slice(0, 12).map(row),
      events,
      now: now.toISOString(),
    };
  }
}
