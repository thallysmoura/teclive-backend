import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

const PAGE_SIZE = 20;

/** 1 Cancelado · 2 Recusado · 3 Aberto · 4 Liberado · 6 Vencido · 7 OS Aberta · 8 Concluído */
export const QUOTE_STATUS = { CANCELLED: 1, REFUSED: 2, OPEN: 3, RELEASED: 4, EXPIRED: 6, WORK_ORDER: 7, DONE: 8 } as const;
const WON: number[] = [QUOTE_STATUS.RELEASED, QUOTE_STATUS.WORK_ORDER, QUOTE_STATUS.DONE];

type QuoteWithItems = Prisma.QuoteGetPayload<{ include: { items: true } }>;

const STATUS_LABEL: Record<number, string> = { 1: 'Cancelado', 2: 'Recusado', 3: 'Aberto', 4: 'Liberado', 6: 'Vencido', 7: 'OS Aberta', 8: 'Concluído' };
const MAX_ATTACHMENT = 500 * 1024;
const num = (v: unknown) => Number(v ?? 0);
/** A validade vale até o fim do dia (horário de Manaus, UTC-4). */
const endOfValidity = (validUntil: Date) => {
  const local = new Date(validUntil.getTime() - 4 * 3600000);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 23 + 4, 59, 59, 999);
};
const effectiveStatus = (q: { status: number; validUntil: Date }) => (q.status === QUOTE_STATUS.OPEN && endOfValidity(q.validUntil) < Date.now() ? QUOTE_STATUS.EXPIRED : q.status);

export function totalsOf(items: { kind: string; total: unknown; discountValue: unknown; unitValue: unknown; quantity: unknown; cost: unknown }[]) {
  const sum = (kind: string, f: (i: (typeof items)[number]) => number) => items.filter((i) => i.kind === kind).reduce((s, i) => s + f(i), 0);
  const products = sum('PRODUCT', (i) => num(i.total));
  const services = sum('SERVICE', (i) => num(i.total));
  const recurring = sum('RECURRING', (i) => num(i.total));
  const discount = items.filter((i) => i.kind !== 'RECURRING').reduce((s, i) => s + num(i.discountValue), 0);
  const cost = items.filter((i) => i.kind !== 'RECURRING').reduce((s, i) => s + num(i.cost) * num(i.quantity), 0);
  return { products, services, recurring, total: products + services, discount, gross: products + services + discount, cost };
}

function lastMonths(count = 6) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return { key: d.getFullYear() * 12 + d.getMonth(), label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), count: 0, value: 0 };
  });
}

export type QuoteInput = {
  personId?: string; title?: string; validUntil?: string; sellerName?: string; contactName?: string; contactEmail?: string; contactPhone?: string;
  technicalSheet?: string; notes?: string; showNotes?: boolean; address?: Prisma.InputJsonValue;
};
export type QuoteItemInput = { kind?: string; description?: string; identifier?: string; unit?: string; quantity?: number; unitValue?: number; discountValue?: number; discountPercent?: number; cost?: number; rental?: boolean };

@Injectable()
export class QuotesService {
  constructor(private readonly prisma: PrismaService) {}

  private async userName(userId: string) {
    return (await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name ?? 'Usuário';
  }

  private row(q: QuoteWithItems) {
    const t = totalsOf(q.items);
    return {
      id: q.id, number: q.number, title: q.title, personName: q.personName, personNickname: q.personNickname, personIsLead: q.personIsLead, personId: q.personId,
      sellerName: q.sellerName, modality: q.modality, status: effectiveStatus(q), openedAt: q.openedAt, validUntil: q.validUntil, total: t.total, recurring: t.recurring,
      refusalReason: q.refusalReason,
    };
  }

  async list(params: { q?: string; from?: string; until?: string; status?: string; modality?: string; personType?: string; seller?: string; reason?: string; hideCancelled?: boolean; page?: number; orderBy?: string; desc?: boolean }) {
    const until = params.until ? new Date(params.until) : undefined;
    until?.setUTCHours(23, 59, 59, 999);
    const search = params.q?.trim();
    const where: Prisma.QuoteWhereInput = {
      ...(params.from || until ? { openedAt: { ...(params.from ? { gte: new Date(params.from) } : {}), ...(until ? { lte: until } : {}) } } : {}),
      ...(params.modality ? { modality: Number(params.modality) } : {}),
      ...(params.personType === 'F' || params.personType === 'J' ? { personType: params.personType } : {}),
      ...(params.seller ? { sellerName: params.seller } : {}),
      ...(params.reason ? { refusalReason: params.reason } : {}),
      ...(search
        ? { OR: [
            { title: { contains: search, mode: 'insensitive' } }, { personName: { contains: search, mode: 'insensitive' } }, { personNickname: { contains: search, mode: 'insensitive' } },
            ...(Number.isInteger(Number(search.replace(/\D/g, ''))) && search.replace(/\D/g, '') ? [{ number: Number(search.replace(/\D/g, '')) }] : []),
          ] }
        : {}),
    };
    const quotes = await this.prisma.quote.findMany({ where, include: { items: true } });
    let rows = quotes.map((q) => this.row(q));
    if (params.status) rows = rows.filter((r) => r.status === Number(params.status));
    if (params.hideCancelled) rows = rows.filter((r) => r.status !== QUOTE_STATUS.CANCELLED);
    const dir = params.desc === false ? 1 : -1;
    const key = params.orderBy ?? 'number';
    rows.sort((a, b) => {
      if (key === 'total') return (a.total - b.total) * dir;
      if (key === 'recurring') return (a.recurring - b.recurring) * dir;
      return (a.number - b.number) * dir;
    });
    const page = Math.max(1, params.page ?? 1);
    const totalValue = rows.reduce((s, r) => s + r.total, 0);
    return { lista: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), totalRegistros: rows.length, tamanhoPagina: PAGE_SIZE, totalValue };
  }

  /** Orçamentos abertos no mês (horário de Manaus, UTC-4), agrupados por situação. */
  async indicators(month?: string) {
    const match = /^(\d{4})-(\d{2})$/.exec(month ?? '');
    const now = new Date(Date.now() - 4 * 3600000);
    const year = match ? Number(match[1]) : now.getUTCFullYear();
    const monthIndex = match ? Number(match[2]) - 1 : now.getUTCMonth();
    if (monthIndex < 0 || monthIndex > 11) throw new BadRequestException('Mês inválido.');
    const from = new Date(Date.UTC(year, monthIndex, 1, 4));
    const until = new Date(Date.UTC(year, monthIndex + 1, 1, 4));
    const quotes = await this.prisma.quote.findMany({ where: { openedAt: { gte: from, lt: until } }, include: { items: true } });
    const rows = quotes.map((q) => this.row(q));
    const order = [3, 4, 7, 8, 6, 2];
    const groups = order
      .map((status) => {
        const list = rows.filter((r) => r.status === status);
        return { status, label: STATUS_LABEL[status], count: list.length, value: Math.round(list.reduce((s, r) => s + r.total, 0) * 100) / 100 };
      })
      .filter((g) => g.count > 0);
    return { month: `${year}-${String(monthIndex + 1).padStart(2, '0')}`, groups, totalCount: groups.reduce((s, g) => s + g.count, 0), totalValue: Math.round(groups.reduce((s, g) => s + g.value, 0) * 100) / 100 };
  }

  async filters() {
    const quotes = await this.prisma.quote.findMany({ select: { sellerName: true, refusalReason: true } });
    const uniq = (values: (string | null)[]) => [...new Set(values.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return { sellers: uniq(quotes.map((q) => q.sellerName)), reasons: uniq(quotes.map((q) => q.refusalReason)) };
  }

  async stats() {
    const quotes = await this.prisma.quote.findMany({ include: { items: true } });
    const rows = quotes.map((q) => this.row(q));
    const byStatus = (statuses: number[]) => rows.filter((r) => statuses.includes(r.status));
    const sumTotal = (list: typeof rows) => list.reduce((s, r) => s + r.total, 0);
    const open = byStatus([QUOTE_STATUS.OPEN]);
    const won = byStatus(WON);
    const lost = byStatus([QUOTE_STATUS.EXPIRED, QUOTE_STATUS.CANCELLED, QUOTE_STATUS.REFUSED]);
    const decided = won.length + lost.length;
    const months = lastMonths();
    for (const q of rows) {
      const m = months.find((x) => x.key === q.openedAt.getFullYear() * 12 + q.openedAt.getMonth());
      if (m) { m.count++; if (WON.includes(q.status)) m.value += q.total; }
    }
    const group = (list: typeof rows, label: (r: (typeof rows)[number]) => string) => {
      const map = new Map<string, number>();
      for (const r of list) map.set(label(r), (map.get(label(r)) ?? 0) + r.total);
      return [...map.entries()].map(([name, value]) => ({ label: name, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value).slice(0, 6);
    };
    const labels: Record<number, string> = { 1: 'Cancelado', 2: 'Recusado', 3: 'Aberto', 4: 'Liberado', 6: 'Vencido', 7: 'OS Aberta', 8: 'Concluído' };
    return {
      total: rows.length,
      openCount: open.length, openValue: sumTotal(open),
      wonCount: won.length, wonValue: sumTotal(won), averageTicket: won.length ? sumTotal(won) / won.length : 0,
      conversionRate: decided ? Math.round((won.length / decided) * 1000) / 10 : 0,
      recurringValue: won.reduce((s, r) => s + r.recurring, 0),
      statuses: Object.entries(labels).map(([code, label]) => ({ label, value: rows.filter((r) => r.status === Number(code)).length })).filter((s) => s.value > 0),
      monthlyCount: months.map(({ label, count }) => ({ label, value: count })),
      monthlyWon: months.map(({ label, value }) => ({ label, value: Math.round(value * 100) / 100 })),
      bySeller: group(won, (r) => r.sellerName ?? 'Sem vendedor'),
      topClients: group(won, (r) => r.personName),
    };
  }

  async get(id: string) {
    const quote = await this.prisma.quote.findUnique({
      where: { id },
      include: { items: { orderBy: { sortOrder: 'asc' } }, payments: true, history: { orderBy: { at: 'desc' } }, attachments: { select: { id: true, fileName: true, caption: true, mimeType: true, size: true, userName: true, createdAt: true }, orderBy: { createdAt: 'desc' } }, person: { select: { id: true, isLead: true } } },
    });
    if (!quote) throw new NotFoundException('Orçamento não encontrado.');
    const totals = totalsOf(quote.items);
    return { ...quote, status: effectiveStatus(quote), totals };
  }

  private async log(quoteId: string, userName: string, description: string) {
    await this.prisma.quoteHistory.create({ data: { quoteId, userName, description, at: new Date() } });
  }

  private async person(personId?: string) {
    if (!personId) throw new BadRequestException('Selecione o cliente.');
    const person = await this.prisma.person.findUnique({ where: { id: personId } });
    if (!person) throw new BadRequestException('Cliente não encontrado.');
    return person;
  }

  async create(userId: string, input: QuoteInput) {
    const person = await this.person(input.personId);
    const validUntil = input.validUntil ? new Date(input.validUntil) : new Date(Date.now() + 7 * 86400000);
    if (Number.isNaN(validUntil.getTime())) throw new BadRequestException('Validade inválida.');
    const userName = await this.userName(userId);
    const last = await this.prisma.quote.aggregate({ _max: { number: true } });
    const quote = await this.prisma.quote.create({
      data: {
        number: (last._max.number ?? 0) + 1, title: input.title?.trim() || null, personId: person.id, personName: person.name, personNickname: person.nickname, personDocument: person.document,
        personType: person.type, personIsLead: person.isLead, sellerName: input.sellerName?.trim() || person.sellerName || null, validUntil,
        contactName: person.name ? 'Contato Principal' : null, contactEmail: person.email, contactPhone: person.phone, openedBy: userName,
      },
    });
    await this.log(quote.id, userName, `Orçamento cadastrado por ${userName}`);
    return quote;
  }

  async update(userId: string, id: string, input: QuoteInput) {
    const quote = await this.prisma.quote.findUnique({ where: { id } });
    if (!quote) throw new NotFoundException('Orçamento não encontrado.');
    const data: Prisma.QuoteUpdateInput = {};
    if (input.title !== undefined) data.title = input.title.trim() || null;
    if (input.validUntil) { const d = new Date(input.validUntil); if (Number.isNaN(d.getTime())) throw new BadRequestException('Validade inválida.'); data.validUntil = d; }
    if (input.sellerName !== undefined) data.sellerName = input.sellerName.trim() || null;
    if (input.technicalSheet !== undefined) data.technicalSheet = input.technicalSheet;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.showNotes !== undefined) data.showNotes = input.showNotes;
    if (input.contactName !== undefined) data.contactName = input.contactName;
    if (input.contactEmail !== undefined) data.contactEmail = input.contactEmail;
    if (input.contactPhone !== undefined) data.contactPhone = input.contactPhone;
    if (input.address !== undefined) data.address = input.address;
    if (input.personId && input.personId !== quote.personId) {
      const person = await this.person(input.personId);
      Object.assign(data, { person: { connect: { id: person.id } }, personName: person.name, personNickname: person.nickname, personDocument: person.document, personType: person.type, personIsLead: person.isLead });
      const userName = await this.userName(userId);
      await this.log(id, userName, `Cliente alterado de ${quote.personName} para ${person.name} por ${userName}`);
    }
    await this.prisma.quote.update({ where: { id }, data });
    return this.get(id);
  }

  private async editable(id: string) {
    const quote = await this.prisma.quote.findUnique({ where: { id } });
    if (!quote) throw new NotFoundException('Orçamento não encontrado.');
    const current = effectiveStatus(quote);
    if (![QUOTE_STATUS.OPEN, QUOTE_STATUS.EXPIRED].includes(current as 3 | 6)) throw new BadRequestException(`Não é possível editar um orçamento com ${STATUS_LABEL[current] ?? 'esta situação'}.`);
    return quote;
  }

  async addItem(id: string, input: QuoteItemInput) {
    await this.editable(id);
    const kind = input.kind === 'PRODUCT' || input.kind === 'RECURRING' ? input.kind : 'SERVICE';
    const description = (input.description ?? '').trim();
    if (!description) throw new BadRequestException('Informe a descrição do item.');
    const quantity = Number(input.quantity ?? 1), unitValue = Number(input.unitValue ?? 0), discountValue = Number(input.discountValue ?? 0);
    if (!(quantity > 0) || !(unitValue >= 0) || !(discountValue >= 0)) throw new BadRequestException('Quantidade, valor unitário ou desconto inválidos.');
    const gross = quantity * unitValue;
    if (discountValue > gross) throw new BadRequestException('O desconto não pode ser maior que o valor do item.');
    const last = await this.prisma.quoteItem.aggregate({ where: { quoteId: id }, _max: { sortOrder: true } });
    await this.prisma.quoteItem.create({
      data: {
        quoteId: id, kind, description, identifier: input.identifier?.trim() || null, unit: input.unit ?? 'UN', quantity, unitValue, discountValue,
        discountPercent: gross ? Math.round((discountValue / gross) * 10000) / 100 : 0, total: gross - discountValue, cost: Number(input.cost ?? 0), rental: !!input.rental, sortOrder: (last._max.sortOrder ?? 0) + 1,
      },
    });
    await this.prisma.quotePayment.updateMany({ where: { quoteId: id }, data: { selected: false } });
    return this.get(id);
  }

  async updateItem(id: string, itemId: string, input: QuoteItemInput) {
    await this.editable(id);
    const item = await this.prisma.quoteItem.findFirst({ where: { id: itemId, quoteId: id } });
    if (!item) throw new NotFoundException('Item não encontrado.');
    const quantity = Number(input.quantity ?? item.quantity), unitValue = Number(input.unitValue ?? item.unitValue), discountValue = Number(input.discountValue ?? item.discountValue);
    if (!(quantity > 0) || !(unitValue >= 0) || !(discountValue >= 0)) throw new BadRequestException('Quantidade, valor unitário ou desconto inválidos.');
    const gross = quantity * unitValue;
    if (discountValue > gross) throw new BadRequestException('O desconto não pode ser maior que o valor do item.');
    await this.prisma.quoteItem.update({
      where: { id: itemId },
      data: { quantity, unitValue, discountValue, discountPercent: gross ? Math.round((discountValue / gross) * 10000) / 100 : 0, total: gross - discountValue, rental: input.rental ?? item.rental },
    });
    await this.prisma.quotePayment.updateMany({ where: { quoteId: id }, data: { selected: false } });
    return this.get(id);
  }

  async addAttachment(userId: string, id: string, input: { fileName?: string; caption?: string; mimeType?: string; fileBase64?: string }) {
    const quote = await this.prisma.quote.findUnique({ where: { id }, select: { id: true } });
    if (!quote) throw new NotFoundException('Orçamento não encontrado.');
    const fileName = (input.fileName ?? '').trim();
    if (!fileName) throw new BadRequestException('Selecione o arquivo.');
    const data = Buffer.from(input.fileBase64 ?? '', 'base64');
    if (data.length === 0) throw new BadRequestException('O arquivo está vazio.');
    if (data.length > MAX_ATTACHMENT) throw new BadRequestException('O arquivo deve ter no máximo 500 KB.');
    const userName = await this.userName(userId);
    await this.prisma.quoteAttachment.create({ data: { quoteId: id, fileName: fileName.slice(0, 200), caption: input.caption?.trim().slice(0, 200) || null, mimeType: (input.mimeType || 'application/octet-stream').slice(0, 120), size: data.length, fileData: data, userName } });
    await this.log(id, userName, `Anexo "${fileName}" adicionado por ${userName}`);
    return this.get(id);
  }

  async attachmentFile(id: string, attachmentId: string) {
    const file = await this.prisma.quoteAttachment.findFirst({ where: { id: attachmentId, quoteId: id } });
    if (!file) throw new NotFoundException('Anexo não encontrado.');
    return { fileName: file.fileName, mimeType: file.mimeType, data: Buffer.from(file.fileData) };
  }

  async removeAttachment(userId: string, id: string, attachmentId: string) {
    const file = await this.prisma.quoteAttachment.findFirst({ where: { id: attachmentId, quoteId: id }, select: { fileName: true } });
    if (!file) throw new NotFoundException('Anexo não encontrado.');
    await this.prisma.quoteAttachment.delete({ where: { id: attachmentId } });
    const userName = await this.userName(userId);
    await this.log(id, userName, `Anexo "${file.fileName}" removido por ${userName}`);
    return this.get(id);
  }

  async removeItem(id: string, itemId: string) {
    await this.editable(id);
    await this.prisma.quoteItem.deleteMany({ where: { id: itemId, quoteId: id } });
    return this.get(id);
  }

  async addPayment(id: string, input: { method?: string; installments?: number }) {
    await this.editable(id);
    const method = (input.method ?? '').trim();
    if (!method) throw new BadRequestException('Informe a forma de pagamento.');
    const installments = Math.max(1, Math.floor(Number(input.installments ?? 1)));
    const quote = await this.get(id);
    await this.prisma.quotePayment.create({ data: { quoteId: id, method, installments, total: quote.totals.total } });
    return this.get(id);
  }

  async removePayment(id: string, paymentId: string) {
    await this.editable(id);
    await this.prisma.quotePayment.deleteMany({ where: { id: paymentId, quoteId: id } });
    return this.get(id);
  }

  /** "Ganhar": escolhe a forma de pagamento, marca ganho e libera o orçamento. */
  async win(userId: string, id: string, paymentId?: string) {
    const quote = await this.get(id);
    if (![QUOTE_STATUS.OPEN, QUOTE_STATUS.EXPIRED].includes(quote.status as 3 | 6)) throw new BadRequestException('Este orçamento não pode ser ganho.');
    if (quote.totals.total <= 0) throw new BadRequestException('Adicione produtos ou serviços antes de ganhar o orçamento.');
    const payment = quote.payments.find((p) => p.id === paymentId);
    if (!payment) throw new BadRequestException('Selecione a forma de pagamento.');
    const userName = await this.userName(userId);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.quotePayment.updateMany({ where: { quoteId: id }, data: { selected: false } }),
      this.prisma.quotePayment.update({ where: { id: payment.id }, data: { selected: true, total: quote.totals.total } }),
      this.prisma.quote.update({ where: { id }, data: { status: QUOTE_STATUS.RELEASED, wonAt: now, releasedAt: now, refusalReason: null } }),
      this.prisma.quoteHistory.create({ data: { quoteId: id, userName, description: `Orçamento ganho com a condição de pagamento '${payment.installments}x ${payment.method}' por ${userName}`, at: now } }),
      this.prisma.quoteHistory.create({ data: { quoteId: id, userName, description: `Orçamento liberado por ${userName}`, at: new Date(now.getTime() + 1) } }),
    ]);
    if (quote.personId) await this.prisma.person.updateMany({ where: { id: quote.personId, isLead: true }, data: { isLead: false, isClient: true, becameClientAt: now } });
    return this.get(id);
  }

  async refuse(userId: string, id: string, reason?: string) {
    const quote = await this.get(id);
    if (![QUOTE_STATUS.OPEN, QUOTE_STATUS.EXPIRED].includes(quote.status as 3 | 6)) throw new BadRequestException('Este orçamento não pode ser recusado.');
    const motive = (reason ?? '').trim();
    if (!motive) throw new BadRequestException('Selecione o motivo da recusa.');
    const userName = await this.userName(userId);
    await this.prisma.quote.update({ where: { id }, data: { status: QUOTE_STATUS.REFUSED, refusalReason: motive } });
    await this.log(id, userName, `Orçamento recusado (${motive}) por ${userName}`);
    return this.get(id);
  }

  async openWorkOrder(userId: string, id: string) {
    const quote = await this.get(id);
    if (quote.status !== QUOTE_STATUS.RELEASED) throw new BadRequestException('Só orçamentos liberados podem abrir ordem de serviço.');
    const userName = await this.userName(userId);
    await this.prisma.quote.update({ where: { id }, data: { status: QUOTE_STATUS.WORK_ORDER } });
    await this.log(id, userName, `Ordem de serviço aberta por ${userName}`);
    return this.get(id);
  }

  async cancel(userId: string, id: string) {
    const quote = await this.get(id);
    if (quote.status === QUOTE_STATUS.CANCELLED) throw new BadRequestException('O orçamento já está cancelado.');
    if ([QUOTE_STATUS.WORK_ORDER, QUOTE_STATUS.DONE].includes(quote.status as 7 | 8)) throw new BadRequestException('Orçamentos com ordem de serviço não podem ser cancelados.');
    const userName = await this.userName(userId);
    await this.prisma.quote.update({ where: { id }, data: { status: QUOTE_STATUS.CANCELLED, cancelledAt: new Date() } });
    await this.log(id, userName, `Orçamento cancelado por ${userName}`);
    return this.get(id);
  }

  async switchModality(userId: string, id: string, modality: number) {
    await this.editable(id);
    if (modality !== 1 && modality !== 2) throw new BadRequestException('Modalidade inválida.');
    const userName = await this.userName(userId);
    await this.prisma.quote.update({ where: { id }, data: { modality } });
    await this.log(id, userName, `Orçamento trocado para ${modality === 1 ? 'Locação' : 'Venda'} por ${userName}`);
    return this.get(id);
  }

  async duplicate(userId: string, id: string) {
    const source = await this.prisma.quote.findUnique({ where: { id }, include: { items: true, payments: true } });
    if (!source) throw new NotFoundException('Orçamento não encontrado.');
    const userName = await this.userName(userId);
    const last = await this.prisma.quote.aggregate({ _max: { number: true } });
    const number = (last._max.number ?? 0) + 1;
    const copy = await this.prisma.quote.create({
      data: {
        number, title: source.title, personId: source.personId, personName: source.personName, personNickname: source.personNickname, personDocument: source.personDocument, personType: source.personType,
        personIsLead: source.personIsLead, sellerName: source.sellerName, purpose: source.purpose, modality: source.modality, validUntil: new Date(Date.now() + 7 * 86400000), technicalSheet: source.technicalSheet,
        notes: source.notes, showNotes: source.showNotes, contactName: source.contactName, contactEmail: source.contactEmail, contactPhone: source.contactPhone, address: source.address ?? undefined, openedBy: userName,
        items: { create: source.items.map(({ id: _id, quoteId: _q, ...item }) => item) },
        payments: { create: source.payments.map((p) => ({ method: p.method, installments: p.installments, total: p.total, selected: false })) },
      },
    });
    await this.log(copy.id, userName, `Orçamento cadastrado por ${userName}`);
    await this.log(copy.id, userName, `Orçamento ${number} foi duplicado do orçamento: ${source.number} por ${userName}`);
    return copy;
  }
}
