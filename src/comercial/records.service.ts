import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

const PAGE_SIZE = 20;
const page = (value?: number) => Math.max(1, value ?? 1);
const clean = (value: string | undefined, label: string, max = 200) => {
  const v = (value ?? '').trim();
  if (!v) throw new BadRequestException(`Informe ${label}.`);
  if (v.length > max) throw new BadRequestException(`${label[0].toUpperCase()}${label.slice(1)} deve ter no máximo ${max} caracteres.`);
  return v;
};

type ListParams = { q?: string; exibirInativos?: boolean; from?: string; until?: string; page?: number; desc?: boolean; orderBy?: string };

@Injectable()
export class RefusalReasonsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(p: ListParams) {
    const where: Prisma.RefusalReasonWhereInput = { ...(p.exibirInativos ? {} : { isActive: true }), ...(p.q ? { description: { contains: p.q, mode: 'insensitive' } } : {}) };
    const dir = p.desc ? 'desc' : 'asc';
    const orderBy: Prisma.RefusalReasonOrderByWithRelationInput = p.orderBy === 'isActive' ? { isActive: dir } : p.orderBy === 'usedWhen' ? { usedWhen: dir } : { description: dir };
    const [rows, totalRegistros] = await Promise.all([
      this.prisma.refusalReason.findMany({ where, orderBy, skip: (page(p.page) - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      this.prisma.refusalReason.count({ where }),
    ]);
    const counts = await this.prisma.quote.groupBy({ by: ['refusalReason'], _count: true, where: { refusalReason: { in: rows.map((r) => r.description) } } });
    const used = new Map(counts.map((c) => [c.refusalReason, c._count]));
    return { lista: rows.map((r) => ({ ...r, timesUsed: used.get(r.description) ?? 0 })), totalRegistros, tamanhoPagina: PAGE_SIZE };
  }

  async get(id: string) {
    const item = await this.prisma.refusalReason.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Motivo de recusa não encontrado.');
    return item;
  }

  private async data(input: { description?: string; usedWhen?: string }, ignoreId?: string) {
    const description = clean(input.description, 'a descrição');
    const duplicate = await this.prisma.refusalReason.findFirst({ where: { description: { equals: description, mode: 'insensitive' }, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) } });
    if (duplicate) throw new ConflictException('Já existe um motivo com essa descrição.');
    return { description, usedWhen: input.usedWhen === 'MANAGEMENT' ? 'MANAGEMENT' : 'CLIENT' };
  }

  async create(input: { description?: string; usedWhen?: string }) { return this.prisma.refusalReason.create({ data: await this.data(input) }); }

  async update(id: string, input: { description?: string; usedWhen?: string }) {
    const current = await this.get(id);
    const data = await this.data(input, id);
    if (data.description !== current.description) await this.prisma.quote.updateMany({ where: { refusalReason: current.description }, data: { refusalReason: data.description } });
    return this.prisma.refusalReason.update({ where: { id }, data });
  }

  async setActive(id: string, isActive: boolean) { await this.get(id); return this.prisma.refusalReason.update({ where: { id }, data: { isActive } }); }

  async remove(id: string) {
    const item = await this.get(id);
    const used = await this.prisma.quote.count({ where: { refusalReason: item.description } });
    if (used > 0) throw new ConflictException(`Este motivo está em uso por ${used} orçamento(s). Inative-o.`);
    await this.prisma.refusalReason.delete({ where: { id } });
    return { ok: true };
  }
}

@Injectable()
export class SalesActionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(p: ListParams) {
    const until = p.until ? new Date(p.until) : undefined;
    until?.setUTCHours(23, 59, 59, 999);
    const where: Prisma.SalesActionWhereInput = {
      ...(p.exibirInativos ? {} : { isActive: true }),
      ...(p.from || until ? { actionDate: { ...(p.from ? { gte: new Date(p.from) } : {}), ...(until ? { lte: until } : {}) } } : {}),
      ...(p.q ? { OR: [{ title: { contains: p.q, mode: 'insensitive' } }, { personName: { contains: p.q, mode: 'insensitive' } }] } : {}),
    };
    const dir = p.desc === false ? 'asc' : 'desc';
    const orderBy: Prisma.SalesActionOrderByWithRelationInput = p.orderBy === 'title' ? { title: dir } : p.orderBy === 'isActive' ? { isActive: dir } : { actionDate: dir };
    const [lista, totalRegistros] = await Promise.all([
      this.prisma.salesAction.findMany({ where, orderBy, skip: (page(p.page) - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      this.prisma.salesAction.count({ where }),
    ]);
    return { lista, totalRegistros, tamanhoPagina: PAGE_SIZE };
  }

  async stats() {
    const actions = await this.prisma.salesAction.findMany({ where: { isActive: true } });
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1); return { key: d.getFullYear() * 12 + d.getMonth(), label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), value: 0 }; });
    const channels = new Map<string, number>();
    for (const a of actions) {
      const m = months.find((x) => x.key === a.actionDate.getFullYear() * 12 + a.actionDate.getMonth());
      if (m) m.value++;
      channels.set(a.channel, (channels.get(a.channel) ?? 0) + 1);
    }
    const thisMonth = months[months.length - 1].value;
    return {
      total: actions.length, thisMonth, hours: actions.reduce((s, a) => s + Number(a.durationHours), 0), people: new Set(actions.map((a) => a.personId)).size,
      byChannel: [...channels.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      monthly: months.map(({ label, value }) => ({ label, value })),
    };
  }

  async get(id: string) {
    const item = await this.prisma.salesAction.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Ação de venda não encontrada.');
    return item;
  }

  private async data(input: { personId?: string; title?: string; actionDate?: string; durationHours?: number; channel?: string; supportTeam?: string; description?: string }) {
    if (!input.personId) throw new BadRequestException('Selecione o cliente / lead.');
    const person = await this.prisma.person.findUnique({ where: { id: input.personId } });
    if (!person) throw new BadRequestException('Cliente / lead não encontrado.');
    const actionDate = new Date(input.actionDate ?? '');
    if (Number.isNaN(actionDate.getTime())) throw new BadRequestException('Informe a data da ação.');
    const durationHours = Number(input.durationHours ?? 0);
    if (!(durationHours >= 0) || durationHours > 999) throw new BadRequestException('Duração inválida.');
    return {
      personId: person.id, personName: person.name, title: clean(input.title, 'o título'), actionDate, durationHours,
      channel: clean(input.channel, 'o canal de comunicação', 60), supportTeam: input.supportTeam?.trim() || null, description: input.description?.trim() || null,
    };
  }

  async create(userName: string, input: Parameters<SalesActionsService['data']>[0]) { return this.prisma.salesAction.create({ data: { ...(await this.data(input)), createdBy: userName } }); }
  async update(id: string, input: Parameters<SalesActionsService['data']>[0]) { await this.get(id); return this.prisma.salesAction.update({ where: { id }, data: await this.data(input) }); }
  async setActive(id: string, isActive: boolean) { await this.get(id); return this.prisma.salesAction.update({ where: { id }, data: { isActive } }); }
  async remove(id: string) { await this.get(id); await this.prisma.salesAction.delete({ where: { id } }); return { ok: true }; }
}

@Injectable()
export class QuoteModelsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(p: ListParams) {
    const where: Prisma.QuoteModelWhereInput = p.q ? { description: { contains: p.q, mode: 'insensitive' } } : {};
    const [lista, totalRegistros] = await Promise.all([
      this.prisma.quoteModel.findMany({ where, orderBy: { description: p.desc ? 'desc' : 'asc' }, skip: (page(p.page) - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      this.prisma.quoteModel.count({ where }),
    ]);
    return { lista, totalRegistros, tamanhoPagina: PAGE_SIZE };
  }

  async get(id: string) {
    const item = await this.prisma.quoteModel.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Modelo não encontrado.');
    return item;
  }

  create(description?: string) { return this.prisma.quoteModel.create({ data: { description: clean(description, 'a descrição do modelo') } }); }
  async update(id: string, description?: string) { await this.get(id); return this.prisma.quoteModel.update({ where: { id }, data: { description: clean(description, 'a descrição do modelo') } }); }
  async remove(id: string) { await this.get(id); await this.prisma.quoteModel.delete({ where: { id } }); return { ok: true }; }
}

@Injectable()
export class QuoteTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(p: ListParams) {
    const where: Prisma.QuoteTemplateWhereInput = { ...(p.exibirInativos ? {} : { isActive: true }), ...(p.q ? { description: { contains: p.q, mode: 'insensitive' } } : {}) };
    const dir = p.desc ? 'desc' : 'asc';
    const [rows, totalRegistros] = await Promise.all([
      this.prisma.quoteTemplate.findMany({ where, select: { id: true, description: true, fileName: true, isActive: true, createdAt: true }, orderBy: p.orderBy === 'isActive' ? { isActive: dir } : { description: dir }, skip: (page(p.page) - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      this.prisma.quoteTemplate.count({ where }),
    ]);
    return { lista: rows, totalRegistros, tamanhoPagina: PAGE_SIZE };
  }

  async get(id: string) {
    const item = await this.prisma.quoteTemplate.findUnique({ where: { id }, select: { id: true, description: true, fileName: true, isActive: true, createdAt: true } });
    if (!item) throw new NotFoundException('Template não encontrado.');
    return item;
  }

  async file(id: string) {
    const item = await this.prisma.quoteTemplate.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Template não encontrado.');
    return { fileName: item.fileName, data: Buffer.from(item.fileData) };
  }

  async create(input: { description?: string; fileName?: string; fileBase64?: string }) {
    const description = clean(input.description ?? input.fileName?.replace(/\.docx$/i, ''), 'a descrição do template');
    const fileName = clean(input.fileName, 'o arquivo do template');
    if (!/\.docx$/i.test(fileName)) throw new BadRequestException('Envie um arquivo no formato .docx.');
    const data = Buffer.from(input.fileBase64 ?? '', 'base64');
    if (data.length === 0) throw new BadRequestException('O arquivo está vazio.');
    if (data.length > 500 * 1024) throw new BadRequestException('O arquivo deve ter no máximo 500 KB.');
    if (data[0] !== 0x50 || data[1] !== 0x4b) throw new BadRequestException('O arquivo não é um .docx válido.');
    const created = await this.prisma.quoteTemplate.create({ data: { description, fileName, fileData: data }, select: { id: true, description: true, fileName: true, isActive: true, createdAt: true } });
    return created;
  }

  async update(id: string, description?: string) { await this.get(id); return this.prisma.quoteTemplate.update({ where: { id }, data: { description: clean(description, 'a descrição do template') }, select: { id: true, description: true, fileName: true, isActive: true, createdAt: true } }); }
  async setActive(id: string, isActive: boolean) { await this.get(id); return this.prisma.quoteTemplate.update({ where: { id }, data: { isActive }, select: { id: true, description: true, fileName: true, isActive: true, createdAt: true } }); }
  async remove(id: string) { await this.get(id); await this.prisma.quoteTemplate.delete({ where: { id } }); return { ok: true }; }
}

@Injectable()
export class CalendarEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(from?: string, until?: string, owners?: string[]) {
    const start = from ? new Date(from) : new Date(Date.now() - 31 * 86400000);
    const end = until ? new Date(until) : new Date(Date.now() + 62 * 86400000);
    return this.prisma.calendarEvent.findMany({
      where: { startsAt: { lt: end }, endsAt: { gte: start }, ...(owners?.length ? { ownerId: { in: owners } } : {}) },
      orderBy: { startsAt: 'asc' },
    });
  }

  async owners() {
    const users = await this.prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    return users;
  }

  async get(id: string) {
    const event = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Evento não encontrado.');
    return event;
  }

  private data(input: { title?: string; startsAt?: string; endsAt?: string; allDay?: boolean; description?: string }) {
    const title = clean(input.title, 'o título do evento');
    const startsAt = new Date(input.startsAt ?? '');
    const endsAt = new Date(input.endsAt ?? input.startsAt ?? '');
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) throw new BadRequestException('Informe as datas do evento.');
    if (endsAt < startsAt) throw new BadRequestException('O fim do evento deve ser depois do início.');
    return { title, startsAt, endsAt, allDay: !!input.allDay, description: input.description?.trim() || null };
  }

  async create(user: { id: string; name: string }, input: Parameters<CalendarEventsService['data']>[0]) {
    return this.prisma.calendarEvent.create({ data: { ...this.data(input), ownerName: user.name, ownerId: user.id } });
  }
  async update(id: string, input: Parameters<CalendarEventsService['data']>[0]) { await this.get(id); return this.prisma.calendarEvent.update({ where: { id }, data: this.data(input) }); }
  async remove(id: string) { await this.get(id); await this.prisma.calendarEvent.delete({ where: { id } }); return { ok: true }; }
}
