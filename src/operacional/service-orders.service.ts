import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type ServiceOrder } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

const PAGE_SIZE = 20;
const OPEN = [0, 1, 8];
const LATE_AWARE = [0, 1];

export const OS_STATUS: Record<number, string> = { 0: 'Aberta', 1: 'Em atraso', 2: 'Cancelada', 3: 'Interrompida', 4: 'Fechada', 5: 'Faturada', 6: 'Faturada Parcialmente', 7: 'Aguardando Aprovação', 8: 'Em Atendimento' };
export const OS_TYPES: Record<number, string> = { 1: 'Instalação', 2: 'Cancelamento', 3: 'Manutenção Corretiva', 4: 'Manutenção Preventiva' };

type Detail = {
  contato?: unknown; vendedores?: unknown[]; atendimentos?: Record<string, unknown>[]; eventos?: Record<string, unknown>[]; pendencias?: { mensagem: string; tipoPendencia: number }[];
  servicos?: Item[]; produtos?: Item[]; produtosARetirar?: Item[]; anexos?: unknown[]; historico?: { dataHora: string; descricao: string; nomeUsuario: string; isLog: boolean }[];
  adiantamentos?: unknown[]; questionarios?: unknown[]; cobranca?: unknown; fechamento?: unknown; totais?: unknown; duracaoMinutos?: number;
};
type Item = { ordemServicoItemId: number; quantidade: number; quantidadeEntregue?: number; cobrado?: boolean; valores?: { unitario?: number; total?: number; desconto?: unknown }; servico?: { descricao: string }; produto?: { descricao: string; identificador?: string; unidadeMedida?: string }; orcamento?: { numero: number } | null };

export type OsInput = {
  personId?: string; type?: number; defectName?: string; scheduleStart?: string; scheduleEnd?: string; technicians?: string[]; technicalSheet?: string;
  address?: { logradouro?: string; numero?: string; bairro?: string; cidade?: string; uf?: string; cep?: string; titulo?: string };
};

const money = (n: number) => Math.round(n * 100) / 100;
const asNumber = (v: unknown) => Number(v ?? 0);

@Injectable()
export class ServiceOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Aberta + prazo vencido = "Em atraso" (o eugestor calcula isso na hora). */
  private effective(o: Pick<ServiceOrder, 'status' | 'scheduleEnd'>) {
    if (LATE_AWARE.includes(o.status)) return o.scheduleEnd && o.scheduleEnd.getTime() < Date.now() ? 1 : 0;
    return o.status;
  }

  private pending(o: ServiceOrder) {
    const d = (o.detail ?? {}) as Detail;
    const out: { mensagem: string; tipoPendencia: number }[] = [];
    if (!OPEN.includes(o.status)) return out;
    if (!(d.servicos?.length || d.produtos?.length)) out.push({ tipoPendencia: 1, mensagem: 'Não é possível fechar uma ordem de serviço sem produtos e serviços.' });
    if ((d.produtos ?? []).some((p) => (p.quantidadeEntregue ?? 0) < p.quantidade)) out.push({ tipoPendencia: 2, mensagem: 'Não é possível fechar uma ordem de serviço com produtos pendentes de entrega.' });
    if ((d.produtosARetirar ?? []).length) out.push({ tipoPendencia: 3, mensagem: 'Não é possível fechar uma ordem de serviço com produtos a retirar.' });
    return out;
  }

  private summary(o: ServiceOrder) {
    const d = (o.detail ?? {}) as Detail;
    return {
      id: o.id, number: o.number, type: o.type, typeLabel: OS_TYPES[o.type] ?? '—', status: this.effective(o), statusLabel: OS_STATUS[this.effective(o)] ?? '—', defect: o.defectName,
      personName: o.personNickname ? `${o.personName}` : o.personName, personNickname: o.personNickname, address: o.address, openedAt: o.openedAt, closedAt: o.closedAt, cancelledAt: o.cancelledAt,
      scheduleStart: o.scheduleStart, scheduleEnd: o.scheduleEnd, technicians: o.technicians, sellers: o.sellers, quoteNumbers: o.quoteNumbers,
      total: money(asNumber(o.totalServices) + asNumber(o.totalProducts)), pendencies: this.pending(o).length, attachments: d.anexos?.length ?? 0,
    };
  }

  async list(p: { q?: string; from?: string; until?: string; status?: string; type?: string; technician?: string; seller?: string; defect?: string; cause?: string; solution?: string; hideCancelled?: boolean; page?: number; orderBy?: string; desc?: boolean }) {
    const and: Prisma.ServiceOrderWhereInput[] = [];
    const now = new Date();
    if (p.q) {
      const n = Number(p.q.replace(/\D/g, ''));
      and.push({ OR: [
        { personName: { contains: p.q, mode: 'insensitive' } }, { personNickname: { contains: p.q, mode: 'insensitive' } }, { defectName: { contains: p.q, mode: 'insensitive' } },
        { address: { path: ['logradouro'], string_contains: p.q } }, ...(n ? [{ number: n }] : []),
      ] });
    }
    if (p.from) and.push({ openedAt: { gte: new Date(p.from) } });
    if (p.until) { const u = new Date(p.until); u.setUTCHours(23, 59, 59, 999); and.push({ openedAt: { lte: u } }); }
    if (p.status !== undefined && p.status !== '') {
      const s = Number(p.status);
      if (s === 0) and.push({ status: { in: LATE_AWARE }, OR: [{ scheduleEnd: null }, { scheduleEnd: { gte: now } }] });
      else if (s === 1) and.push({ status: { in: LATE_AWARE }, scheduleEnd: { lt: now } });
      else and.push({ status: s });
    }
    if (p.type) and.push({ type: Number(p.type) });
    if (p.technician) and.push({ technicians: { has: p.technician } });
    if (p.seller) and.push({ sellers: { has: p.seller } });
    if (p.defect) and.push({ defectName: p.defect });
    if (p.cause) and.push({ causeName: p.cause });
    if (p.solution) and.push({ solutionName: p.solution });
    if (p.hideCancelled) and.push({ status: { not: 2 } });
    const where: Prisma.ServiceOrderWhereInput = and.length ? { AND: and } : {};
    const dir = p.desc ? 'desc' : 'asc';
    const orderBy: Prisma.ServiceOrderOrderByWithRelationInput =
      p.orderBy === 'personName' ? { personName: dir } : p.orderBy === 'scheduleEnd' ? { scheduleEnd: dir } : p.orderBy === 'status' ? { status: dir } : p.orderBy === 'number' ? { number: dir } : { openedAt: dir };
    const [rows, totalRegistros] = await Promise.all([
      this.prisma.serviceOrder.findMany({ where, orderBy, skip: (Math.max(1, p.page ?? 1) - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      this.prisma.serviceOrder.count({ where }),
    ]);
    return { lista: rows.map((o) => this.summary(o)), totalRegistros, tamanhoPagina: PAGE_SIZE };
  }

  async get(id: string) {
    const o = await this.prisma.serviceOrder.findUnique({ where: { id } });
    if (!o) throw new NotFoundException('Ordem de serviço não encontrada.');
    return this.out(o);
  }

  /** Enriquece os comentários com a foto de quem escreveu (por id; os importados, pelo nome). */
  private async out(o: ServiceOrder) {
    const full = this.full(o);
    const events = full.events as Record<string, unknown>[];
    if (!events.length) return full;
    const ids = events.map((e) => e.usuarioId as string | undefined).filter(Boolean) as string[];
    const names = events.map((e) => e.usuario as string).filter(Boolean);
    const users = await this.prisma.user.findMany({ where: { OR: [{ id: { in: ids } }, { name: { in: names } }] }, select: { id: true, name: true, avatarUrl: true } });
    const byId = new Map(users.map((u) => [u.id, u.avatarUrl])), byName = new Map(users.map((u) => [u.name.toLowerCase(), u.avatarUrl]));
    return { ...full, events: events.map((e) => ({ ...e, avatarUrl: (e.usuarioId ? byId.get(e.usuarioId as string) : undefined) ?? byName.get(String(e.usuario).toLowerCase()) ?? null })) };
  }

  private full(o: ServiceOrder) {
    const d = (o.detail ?? {}) as Detail;
    return {
      ...this.summary(o), purpose: o.purpose, openedBy: o.openedBy, interruptedAt: o.interruptedAt, contact: o.contact, technicalSheet: o.technicalSheet, cause: o.causeName, solution: o.solutionName,
      paymentMethod: o.paymentMethod, installments: o.installments, totalServices: asNumber(o.totalServices), totalProducts: asNumber(o.totalProducts), personId: o.personId,
      services: d.servicos ?? [], products: d.produtos ?? [], toWithdraw: d.produtosARetirar ?? [], calls: d.atendimentos ?? [], events: d.eventos ?? [], history: d.historico ?? [], attachments: d.anexos ?? [],
      advances: d.adiantamentos ?? [], questionnaires: d.questionarios ?? [], billing: d.cobranca ?? null, pendingList: this.pending(o), durationMinutes: d.duracaoMinutos ?? 0,
    };
  }

  async stats() {
    const rows = await this.prisma.serviceOrder.findMany({ select: { status: true, scheduleEnd: true, totalServices: true, totalProducts: true } });
    const by: Record<number, number> = {};
    let value = 0;
    for (const r of rows) { const s = this.effective(r as ServiceOrder); by[s] = (by[s] ?? 0) + 1; if (![2].includes(r.status)) value += asNumber(r.totalServices) + asNumber(r.totalProducts); }
    return { total: rows.length, byStatus: by, value: money(value) };
  }

  async filters() {
    const [defects, causes, solutions] = await Promise.all([
      this.prisma.serviceOrder.findMany({ where: { defectName: { not: null } }, distinct: ['defectName'], select: { defectName: true }, orderBy: { defectName: 'asc' } }),
      this.prisma.opCause.findMany({ where: { isActive: true }, select: { description: true }, orderBy: { description: 'asc' } }),
      this.prisma.opSolution.findMany({ where: { isActive: true }, select: { description: true }, orderBy: { description: 'asc' } }),
    ]);
    const orders = await this.prisma.serviceOrder.findMany({ select: { technicians: true, sellers: true } });
    const uniq = (v: string[]) => [...new Set(v)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return {
      defects: defects.map((d) => d.defectName as string), causes: causes.map((c) => c.description), solutions: solutions.map((s) => s.description),
      technicians: uniq(orders.flatMap((o) => o.technicians)), sellers: uniq(orders.flatMap((o) => o.sellers)),
      statuses: Object.entries(OS_STATUS).map(([value, label]) => ({ value, label })), types: Object.entries(OS_TYPES).map(([value, label]) => ({ value, label })),
    };
  }

  /* ---------- gravação ---------- */

  private async touch(id: string, patch: Prisma.ServiceOrderUpdateInput, detail?: Detail, log?: { user: string; text: string }) {
    const d: Detail = { ...detail };
    if (log) d.historico = [{ dataHora: new Date().toISOString(), descricao: log.text, nomeUsuario: log.user, isLog: true }, ...(d.historico ?? [])];
    return this.prisma.serviceOrder.update({ where: { id }, data: { ...patch, detail: d as Prisma.InputJsonValue } });
  }

  private async load(id: string) {
    const o = await this.prisma.serviceOrder.findUnique({ where: { id } });
    if (!o) throw new NotFoundException('Ordem de serviço não encontrada.');
    return o;
  }

  private dates(input: OsInput) {
    const start = input.scheduleStart ? new Date(input.scheduleStart) : null;
    const end = input.scheduleEnd ? new Date(input.scheduleEnd) : null;
    if ((start && isNaN(+start)) || (end && isNaN(+end))) throw new BadRequestException('Informe datas de agendamento válidas.');
    if (start && end && end < start) throw new BadRequestException('A previsão de fechamento deve ser depois do atendimento.');
    return { scheduleStart: start, scheduleEnd: end };
  }

  async create(userName: string, input: OsInput) {
    if (!input.personId) throw new BadRequestException('Informe o cliente.');
    const person = await this.prisma.person.findUnique({ where: { id: input.personId } });
    if (!person) throw new BadRequestException('Cliente não encontrado.');
    const type = Number(input.type ?? 1);
    if (!OS_TYPES[type]) throw new BadRequestException('Tipo de OS inválido.');
    const last = await this.prisma.serviceOrder.aggregate({ _max: { number: true } });
    const number = (last._max.number ?? 0) + 1;
    const detail: Detail = { historico: [{ dataHora: new Date().toISOString(), descricao: `Ordem de Serviço aberta por '${userName}'`, nomeUsuario: userName, isLog: true }], eventos: [], servicos: [], produtos: [] };
    return this.out(await this.prisma.serviceOrder.create({
      data: {
        number, type, personId: person.id, personName: person.name, personNickname: person.nickname, personType: person.type, address: (input.address ?? undefined) as Prisma.InputJsonValue | undefined,
        defectName: input.defectName?.trim() || null, technicalSheet: input.technicalSheet?.trim() || null, technicians: (input.technicians ?? []).filter(Boolean), openedBy: userName,
        ...this.dates(input), detail: detail as Prisma.InputJsonValue,
      },
    }));
  }

  async update(userName: string, id: string, input: OsInput) {
    const o = await this.load(id);
    if (!OPEN.includes(o.status)) throw new BadRequestException('Só é possível alterar uma OS aberta.');
    const patch: Prisma.ServiceOrderUpdateInput = {
      type: input.type && OS_TYPES[input.type] ? input.type : o.type, defectName: input.defectName !== undefined ? input.defectName.trim() || null : o.defectName,
      technicalSheet: input.technicalSheet !== undefined ? input.technicalSheet.trim() || null : o.technicalSheet, technicians: input.technicians ? input.technicians.filter(Boolean) : o.technicians,
      ...(input.scheduleStart !== undefined || input.scheduleEnd !== undefined ? this.dates({ scheduleStart: input.scheduleStart ?? o.scheduleStart?.toISOString(), scheduleEnd: input.scheduleEnd ?? o.scheduleEnd?.toISOString() }) : {}),
      ...(input.address ? { address: input.address as Prisma.InputJsonValue } : {}),
    };
    return this.out(await this.touch(id, patch, o.detail as Detail, { user: userName, text: `Dados da OS alterados por '${userName}'` }));
  }

  /** Envia uma imagem (já reduzida no navegador) e devolve o id para anexar a um comentário. */
  async uploadFile(user: { id: string; name: string }, id: string, input: { fileName?: string; mimeType?: string; fileBase64?: string }) {
    await this.load(id);
    const mime = (input.mimeType ?? '').toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) throw new BadRequestException('Envie uma imagem JPG, PNG, WEBP ou GIF.');
    const data = Buffer.from(input.fileBase64 ?? '', 'base64');
    if (!data.length) throw new BadRequestException('Arquivo vazio.');
    if (data.length > 560 * 1024) throw new BadRequestException('A imagem deve ter no máximo 550 KB (ela é reduzida automaticamente antes do envio).');
    const file = await this.prisma.serviceOrderFile.create({ data: { orderId: id, fileName: (input.fileName ?? 'imagem').slice(0, 200), mimeType: mime, size: data.length, fileData: data, userId: user.id, userName: user.name } });
    return { id: file.id, fileName: file.fileName, mimeType: file.mimeType, size: file.size };
  }

  async file(id: string, fileId: string) {
    const f = await this.prisma.serviceOrderFile.findFirst({ where: { id: fileId, orderId: id } });
    if (!f) throw new NotFoundException('Arquivo não encontrado.');
    return { fileName: f.fileName, mimeType: f.mimeType, data: Buffer.from(f.fileData) };
  }

  async comment(user: { id: string; name: string }, id: string, input: { text?: string; fileIds?: string[] }) {
    const o = await this.load(id);
    const content = (input.text ?? '').trim();
    const fileIds = [...new Set(input.fileIds ?? [])].slice(0, 8);
    if (!content && !fileIds.length) throw new BadRequestException('Escreva o comentário ou anexe uma imagem.');
    if (content.length > 4000) throw new BadRequestException('O comentário deve ter no máximo 4000 caracteres.');
    const files = fileIds.length ? await this.prisma.serviceOrderFile.findMany({ where: { id: { in: fileIds }, orderId: id }, select: { id: true, fileName: true, mimeType: true, size: true } }) : [];
    const d = (o.detail ?? {}) as Detail;
    d.eventos = [...(d.eventos ?? []), { tipo: 0, id: randomUUID(), conteudo: content || null, dataRegistro: new Date().toISOString(), usuario: user.name, usuarioId: user.id, registroId: null, anexos: files }];
    const updated = await this.touch(id, {}, d, { user: user.name, text: `Comentário adicionado por '${user.name}'` });
    // Administradores recebem como notificação não lida e vão direto para a OS.
    const admins = await this.prisma.user.findMany({ where: { role: 'ADMIN', id: { not: user.id } }, select: { id: true } });
    if (admins.length) {
      const number = String(Math.floor(o.number / 1000)).padStart(3, '0') + '.' + String(o.number % 1000).padStart(3, '0');
      const snippet = content ? (content.length > 120 ? `${content.slice(0, 117)}...` : content) : `${files.length} imagem(ns)`;
      await this.prisma.notification.createMany({
        data: admins.map((a) => ({ userId: a.id, title: `Novo comentário na OS ${number}`, message: `${user.name}: ${snippet}`, data: { type: 'os-comment', serviceOrderId: id, url: `/operacional/ordens-servico?os=${id}` } })),
      });
    }
    return this.out(updated);
  }

  /** Só os comentários (para acompanhar em tempo real sem recarregar a OS toda). */
  async comments(id: string) {
    const o = await this.load(id);
    return (await this.out(o)).events;
  }

  private recalc(d: Detail) {
    const sum = (items: Item[] = []) => money(items.filter((i) => i.cobrado !== false).reduce((s, i) => s + asNumber(i.valores?.total), 0));
    return { totalServices: sum(d.servicos), totalProducts: sum(d.produtos) };
  }

  async addItem(userName: string, id: string, input: { kind?: string; description?: string; quantity?: number; unitValue?: number; discount?: number; unit?: string }) {
    const o = await this.load(id);
    if (!OPEN.includes(o.status)) throw new BadRequestException('Só é possível alterar itens de uma OS aberta.');
    const description = (input.description ?? '').trim();
    const quantity = Number(input.quantity);
    const unit = Number(input.unitValue);
    if (!description) throw new BadRequestException('Informe a descrição do item.');
    if (!(quantity > 0)) throw new BadRequestException('Informe uma quantidade maior que zero.');
    if (!(unit >= 0)) throw new BadRequestException('Informe o valor unitário.');
    const discount = Math.max(0, Number(input.discount) || 0);
    const total = money(quantity * unit - discount);
    if (total < 0) throw new BadRequestException('O desconto não pode ser maior que o total do item.');
    const d = (o.detail ?? {}) as Detail;
    const nextId = Math.max(0, ...[...(d.servicos ?? []), ...(d.produtos ?? [])].map((i) => i.ordemServicoItemId)) + 1;
    const isService = input.kind !== 'product';
    const base = { ordemServicoItemId: nextId, quantidade: quantity, cobrado: true, valores: { unitario: unit, total, desconto: { valor: discount } }, orcamento: null };
    if (isService) d.servicos = [...(d.servicos ?? []), { ...base, servico: { descricao: description } }];
    else d.produtos = [...(d.produtos ?? []), { ...base, quantidadeEntregue: 0, produto: { descricao: description, unidadeMedida: input.unit || 'UN' } }];
    return this.out(await this.touch(id, this.recalc(d), d, { user: userName, text: `${isService ? 'Serviço' : 'Produto'} '${description}' adicionado por '${userName}'` }));
  }

  async removeItem(userName: string, id: string, itemId: number) {
    const o = await this.load(id);
    if (!OPEN.includes(o.status)) throw new BadRequestException('Só é possível alterar itens de uma OS aberta.');
    const d = (o.detail ?? {}) as Detail;
    const all = [...(d.servicos ?? []), ...(d.produtos ?? [])];
    const item = all.find((i) => i.ordemServicoItemId === itemId);
    if (!item) throw new NotFoundException('Item não encontrado.');
    if (item.orcamento) throw new BadRequestException('Itens vindos de um orçamento não podem ser removidos.');
    d.servicos = (d.servicos ?? []).filter((i) => i.ordemServicoItemId !== itemId);
    d.produtos = (d.produtos ?? []).filter((i) => i.ordemServicoItemId !== itemId);
    return this.out(await this.touch(id, this.recalc(d), d, { user: userName, text: `Item '${item.servico?.descricao ?? item.produto?.descricao}' removido por '${userName}'` }));
  }

  async deliver(userName: string, id: string, itemId: number, quantity?: number) {
    const o = await this.load(id);
    if (!OPEN.includes(o.status)) throw new BadRequestException('Só é possível entregar produtos de uma OS aberta.');
    const d = (o.detail ?? {}) as Detail;
    const item = (d.produtos ?? []).find((i) => i.ordemServicoItemId === itemId);
    if (!item) throw new NotFoundException('Produto não encontrado.');
    const qty = quantity === undefined ? item.quantidade - (item.quantidadeEntregue ?? 0) : Number(quantity);
    if (!(qty > 0) || (item.quantidadeEntregue ?? 0) + qty > item.quantidade) throw new BadRequestException('Quantidade de entrega inválida.');
    item.quantidadeEntregue = (item.quantidadeEntregue ?? 0) + qty;
    return this.out(await this.touch(id, {}, d, { user: userName, text: `${qty} un. de '${item.produto?.descricao}' entregue(s) por '${userName}'` }));
  }

  async close(userName: string, id: string, input: { cause?: string; solution?: string }) {
    const o = await this.load(id);
    if (!OPEN.includes(o.status)) throw new BadRequestException('Só é possível fechar uma OS aberta.');
    const pending = this.pending(o);
    if (pending.length) throw new BadRequestException(pending.map((p) => p.mensagem).join(' '));
    const d = (o.detail ?? {}) as Detail;
    d.fechamento = { causa: input.cause ? { descricao: input.cause } : null, solucao: input.solution ? { descricao: input.solution } : null };
    return this.out(await this.touch(id, { status: 4, closedAt: new Date(), causeName: input.cause || null, solutionName: input.solution || null }, d, { user: userName, text: `Ordem de Serviço fechada por '${userName}'` }));
  }

  async cancel(userName: string, id: string) {
    const o = await this.load(id);
    if (![0, 1, 3, 7, 8].includes(o.status)) throw new BadRequestException('Esta OS não pode ser cancelada.');
    return this.out(await this.touch(id, { status: 2, cancelledAt: new Date() }, o.detail as Detail, { user: userName, text: `Ordem de Serviço cancelada por '${userName}'` }));
  }

  async reopen(userName: string, id: string) {
    const o = await this.load(id);
    if (![2, 4, 3].includes(o.status)) throw new BadRequestException('Esta OS já está aberta ou foi faturada.');
    return this.out(await this.touch(id, { status: 0, cancelledAt: null, closedAt: null, interruptedAt: null }, o.detail as Detail, { user: userName, text: `Ordem de Serviço reaberta por '${userName}'` }));
  }

  async interrupt(userName: string, id: string) {
    const o = await this.load(id);
    if (!OPEN.includes(o.status)) throw new BadRequestException('Só é possível interromper uma OS aberta.');
    return this.out(await this.touch(id, { status: 3, interruptedAt: new Date() }, o.detail as Detail, { user: userName, text: `Ordem de Serviço interrompida por '${userName}'` }));
  }


  /** "Abrir OS" no quadro: cria a OS com os serviços e produtos do orçamento e marca o orçamento como "OS Aberta". */
  async createFromQuote(userName: string, quoteId: string) {
    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
    if (!quote) throw new NotFoundException('Orçamento não encontrado.');
    if (![4, 7].includes(quote.status) || !quote.wonAt) throw new BadRequestException('Só é possível abrir OS de um orçamento liberado.');
    if ((await this.prisma.serviceOrder.count({ where: { quoteNumbers: { has: quote.number } } })) > 0) throw new BadRequestException('Já existe uma OS para este orçamento.');
    const last = await this.prisma.serviceOrder.aggregate({ _max: { number: true } });
    let itemId = 0;
    const toItem = (i: (typeof quote.items)[number]) => ({
      ordemServicoItemId: ++itemId, quantidade: asNumber(i.quantity), cobrado: true, orcamento: { numero: quote.number },
      valores: { unitario: asNumber(i.unitValue), total: asNumber(i.total), desconto: { valor: asNumber(i.discountValue) } },
    });
    const servicos = quote.items.filter((i) => i.kind === 'SERVICE').map((i) => ({ ...toItem(i), servico: { descricao: i.description } }));
    const produtos = quote.items.filter((i) => i.kind === 'PRODUCT').map((i) => ({ ...toItem(i), quantidadeEntregue: 0, produto: { descricao: i.description, identificador: i.identifier ?? undefined, unidadeMedida: i.unit ?? 'UN' } }));
    const detail: Detail = { servicos, produtos, eventos: [], contato: quote.contactName ? { nome: quote.contactName, email: quote.contactEmail, telefone: quote.contactPhone } : undefined, historico: [{ dataHora: new Date().toISOString(), descricao: `Ordem de Serviço aberta por '${userName}' a partir do orçamento ${quote.number}`, nomeUsuario: userName, isLog: true }] };
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.quote.update({ where: { id: quote.id }, data: { status: 7 } });
      return tx.serviceOrder.create({
        data: {
          number: (last._max.number ?? 0) + 1, type: 1, personId: quote.personId, personName: quote.personName, personNickname: quote.personNickname, personType: quote.personType,
          address: (quote.address ?? undefined) as Prisma.InputJsonValue | undefined, openedBy: userName, quoteNumbers: [quote.number], sellers: quote.sellerName ? [quote.sellerName] : [],
          technicalSheet: quote.technicalSheet, totalServices: servicos.reduce((s, i) => s + i.valores.total, 0), totalProducts: produtos.reduce((s, i) => s + i.valores.total, 0), detail: detail as Prisma.InputJsonValue,
        },
      });
    });
    return this.out(created);
  }

  /** Gestão de OS: indicadores consolidados. */
  async management() {
    const rows = await this.prisma.serviceOrder.findMany({ orderBy: { openedAt: 'desc' } });
    const count = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    const byStatus = new Map<string, number>(), byType = new Map<string, number>(), byTech = new Map<string, number>(), monthly = new Map<string, { count: number; value: number }>();
    let closeDays = 0, closed = 0, value = 0, openValue = 0;
    for (const o of rows) {
      const s = this.effective(o);
      const total = asNumber(o.totalServices) + asNumber(o.totalProducts);
      count(byStatus, OS_STATUS[s] ?? String(s)); count(byType, OS_TYPES[o.type] ?? '—');
      if (OPEN.includes(s)) { openValue += total; for (const t of o.technicians.length ? o.technicians : ['Sem técnico']) count(byTech, t); }
      if (s !== 2) { value += total; const k = o.openedAt.toISOString().slice(0, 7); const m = monthly.get(k) ?? { count: 0, value: 0 }; m.count++; m.value += total; monthly.set(k, m); }
      if (o.closedAt && [4, 5, 6].includes(o.status)) { closeDays += (o.closedAt.getTime() - o.openedAt.getTime()) / 864e5; closed++; }
    }
    const sorted = (m: Map<string, number>) => [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    return {
      total: rows.length, open: rows.filter((o) => OPEN.includes(this.effective(o))).length, late: rows.filter((o) => this.effective(o) === 1).length, value: money(value), openValue: money(openValue),
      averageCloseDays: closed ? Math.round((closeDays / closed) * 10) / 10 : 0,
      byStatus: sorted(byStatus), byType: sorted(byType), byTechnician: sorted(byTech),
      monthly: [...monthly.entries()].sort().slice(-6).map(([month, v]) => ({ month, count: v.count, value: money(v.value) })),
      lateList: rows.filter((o) => this.effective(o) === 1).sort((a, b) => (a.scheduleEnd?.getTime() ?? 0) - (b.scheduleEnd?.getTime() ?? 0)).slice(0, 8).map((o) => this.summary(o)),
    };
  }

  /* ---------- painéis ---------- */

  async board() {
    const open = await this.prisma.serviceOrder.findMany({ where: { status: { in: [...OPEN, 7] } }, orderBy: { openedAt: 'desc' } });
    // Orçamento fica pendente enquanto os itens dele não estiverem todos em OS (OS cancelada não conta).
    const covered = new Map<number, number>();
    for (const o of await this.prisma.serviceOrder.findMany({ where: { status: { not: 2 } }, select: { detail: true } })) {
      const d = (o.detail ?? {}) as Detail;
      for (const i of [...(d.servicos ?? []), ...(d.produtos ?? [])]) if (i.orcamento) covered.set(i.orcamento.numero, (covered.get(i.orcamento.numero) ?? 0) + 1);
    }
    const won = await this.prisma.quote.findMany({ where: { status: { in: [4, 7] }, wonAt: { not: null } }, orderBy: { wonAt: 'desc' }, include: { _count: { select: { items: { where: { kind: { in: ['SERVICE', 'PRODUCT'] } } } } } } });
    const quotes = won.filter((q) => (covered.get(q.number) ?? 0) < q._count.items);
    const sums = await this.prisma.quoteItem.groupBy({ by: ['quoteId'], _sum: { total: true }, where: { quoteId: { in: quotes.map((q) => q.id) }, kind: { not: 'RECURRING' } } });
    const quoteTotal = new Map(sums.map((r) => [r.quoteId, asNumber(r._sum.total)]));
    const card = (o: ServiceOrder) => ({ id: o.id, number: o.number, personName: o.personName, openedAt: o.openedAt, scheduleEnd: o.scheduleEnd, typeLabel: OS_TYPES[o.type] ?? '—', total: money(asNumber(o.totalServices) + asNumber(o.totalProducts)), status: this.effective(o) });
    const byPending = (kind: number) => open.filter((o) => o.status !== 7 && this.pending(o).some((p) => p.tipoPendencia === kind));
    const closable = open.filter((o) => OPEN.includes(o.status) && this.pending(o).length === 0);
    return [
      { key: 'release', title: 'Liberação de Orçamento', kind: 'quote', cards: [] as unknown[] },
      { key: 'contract', title: 'Orçamentos Pendentes de Contrato', kind: 'quote', cards: [] as unknown[] },
      { key: 'quotes', title: 'Orçamentos Pendentes de OS', kind: 'quote', cards: quotes.map((q) => ({ id: q.id, number: q.number, personName: q.personName, title: q.title ?? 'Orçamento sem título', wonAt: q.wonAt, total: money(quoteTotal.get(q.id) ?? 0) })) },
      { key: 'delivery', title: 'OS Aguardando Entrega de Equipamentos', kind: 'os', cards: byPending(2).map(card) },
      { key: 'withdraw', title: 'OS Aguardando Retirada de Equipamentos', kind: 'os', cards: byPending(3).map(card) },
      { key: 'approval', title: 'OS Aguardando Aprovação', kind: 'os', cards: open.filter((o) => o.status === 7).map(card) },
      { key: 'closing', title: 'OS Aguardando Fechamento', kind: 'os', cards: closable.map(card) },
    ];
  }

  async schedule(from?: string, until?: string) {
    const start = from ? new Date(from) : new Date(Date.now() - 7 * 864e5);
    const end = until ? new Date(until) : new Date(Date.now() + 35 * 864e5);
    end.setUTCHours(23, 59, 59, 999);
    const rows = await this.prisma.serviceOrder.findMany({ where: { scheduleStart: { gte: start, lte: end }, status: { notIn: [2] } }, orderBy: { scheduleStart: 'asc' } });
    return rows.map((o) => ({ ...this.summary(o) }));
  }

  /** Central de Operações: OS abertas com coordenadas, para o mapa. */
  async operations() {
    const rows = await this.prisma.serviceOrder.findMany({ where: { status: { in: [...OPEN, 3, 7] } }, orderBy: { scheduleEnd: 'asc' } });
    const points = rows.map((o) => {
      const c = (o.address as { coordenada?: { latitude: number; longitude: number } } | null)?.coordenada;
      return { ...this.summary(o), lat: c?.latitude ?? null, lng: c?.longitude ?? null };
    });
    const stats = { open: points.length, late: points.filter((p) => p.status === 1).length, withoutTech: points.filter((p) => !p.technicians.length).length, withoutSchedule: points.filter((p) => !p.scheduleStart).length };
    return { stats, points };
  }
}
