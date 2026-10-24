import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const PAGE_SIZE = 20;
export type LookupKind = 'causes' | 'defects' | 'solutions' | 'questionnaires';
export const LOOKUP_KINDS: LookupKind[] = ['causes', 'defects', 'solutions', 'questionnaires'];
const LABELS: Record<LookupKind, string> = { causes: 'A causa', defects: 'O defeito', solutions: 'A solução', questionnaires: 'O questionário' };

type ListParams = { q?: string; exibirInativos?: boolean; page?: number; orderBy?: string; desc?: boolean };
type Input = { description?: string; title?: string; serviceMinutes?: number; closingMinutes?: number; questionCount?: number };

/** Cadastros simples do Operacional (causas, defeitos, soluções e modelos de questionário). */
@Injectable()
export class LookupsService {
  constructor(private readonly prisma: PrismaService) {}

  // O delegate muda por tipo; os campos usados em cada um são conhecidos aqui.
  private d(kind: LookupKind) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = this.prisma as any;
    return { causes: p.opCause, defects: p.opDefect, solutions: p.opSolution, questionnaires: p.opQuestionnaire }[kind];
  }
  private nameField(kind: LookupKind) { return kind === 'questionnaires' ? 'title' : 'description'; }

  private async usage(kind: LookupKind, names: string[]) {
    const field = { causes: 'causeName', defects: 'defectName', solutions: 'solutionName', questionnaires: null }[kind];
    if (!field || !names.length) return new Map<string, number>();
    const rows = await this.prisma.serviceOrder.groupBy({ by: [field as 'causeName'], _count: true, where: { [field]: { in: names } } });
    return new Map(rows.map((r) => [r[field as 'causeName'] as string, r._count]));
  }

  async list(kind: LookupKind, p: ListParams) {
    const nf = this.nameField(kind);
    const where = { ...(p.exibirInativos ? {} : { isActive: true }), ...(p.q ? { [nf]: { contains: p.q, mode: 'insensitive' } } : {}) };
    const dir = p.desc ? 'desc' : 'asc';
    const allowed = [nf, 'isActive', 'serviceMinutes', 'closingMinutes', 'questionCount'];
    const orderBy = { [allowed.includes(p.orderBy ?? '') ? p.orderBy! : nf]: dir };
    const delegate = this.d(kind);
    const [rows, totalRegistros] = await Promise.all([
      delegate.findMany({ where, orderBy, skip: (Math.max(1, p.page ?? 1) - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      delegate.count({ where }),
    ]);
    const used = await this.usage(kind, rows.map((r: Record<string, string>) => r[nf]));
    return { lista: rows.map((r: Record<string, string>) => ({ ...r, timesUsed: used.get(r[nf]) ?? 0 })), totalRegistros, tamanhoPagina: PAGE_SIZE };
  }

  async get(kind: LookupKind, id: string) {
    const item = await this.d(kind).findUnique({ where: { id } });
    if (!item) throw new NotFoundException(`${LABELS[kind]} não encontrado(a).`);
    return item;
  }

  private async data(kind: LookupKind, input: Input, ignoreId?: string) {
    const nf = this.nameField(kind);
    const name = String((kind === 'questionnaires' ? input.title : input.description) ?? '').trim();
    if (!name) throw new BadRequestException(kind === 'questionnaires' ? 'Informe o título.' : 'Informe a descrição.');
    if (name.length > 200) throw new BadRequestException('O texto deve ter no máximo 200 caracteres.');
    const duplicate = await this.d(kind).findFirst({ where: { [nf]: { equals: name, mode: 'insensitive' }, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) } });
    if (duplicate) throw new ConflictException(`Já existe um registro com esse ${kind === 'questionnaires' ? 'título' : 'nome'}.`);
    const minutes = (v: unknown) => Math.max(0, Math.min(99999, Math.round(Number(v) || 0)));
    if (kind === 'defects') return { description: name, serviceMinutes: minutes(input.serviceMinutes), closingMinutes: minutes(input.closingMinutes) };
    if (kind === 'questionnaires') return { title: name, description: (input.description ?? '').trim() || null, questionCount: minutes(input.questionCount) };
    return { description: name };
  }

  async create(kind: LookupKind, input: Input) { return this.d(kind).create({ data: await this.data(kind, input) }); }

  async update(kind: LookupKind, id: string, input: Input) {
    const current = await this.get(kind, id);
    const data = await this.data(kind, input, id);
    const field = { causes: 'causeName', defects: 'defectName', solutions: 'solutionName', questionnaires: null }[kind];
    const nf = this.nameField(kind);
    if (field && data[nf as 'description'] !== current[nf]) await this.prisma.serviceOrder.updateMany({ where: { [field]: current[nf] }, data: { [field]: data[nf as 'description'] } });
    return this.d(kind).update({ where: { id }, data });
  }

  async setActive(kind: LookupKind, id: string, isActive: boolean) { await this.get(kind, id); return this.d(kind).update({ where: { id }, data: { isActive } }); }

  async remove(kind: LookupKind, id: string) {
    const item = await this.get(kind, id);
    const used = (await this.usage(kind, [item[this.nameField(kind)]])).get(item[this.nameField(kind)]) ?? 0;
    if (used > 0) throw new ConflictException(`Está em uso por ${used} ordem(ns) de serviço. Inative-o.`);
    await this.d(kind).delete({ where: { id } });
    return { ok: true };
  }

  /** Opções para filtros/seleção (apenas ativos). */
  async options() {
    const [causes, defects, solutions] = await Promise.all([
      this.prisma.opCause.findMany({ where: { isActive: true }, orderBy: { description: 'asc' }, select: { description: true } }),
      this.prisma.opDefect.findMany({ where: { isActive: true }, orderBy: { description: 'asc' }, select: { description: true, serviceMinutes: true, closingMinutes: true } }),
      this.prisma.opSolution.findMany({ where: { isActive: true }, orderBy: { description: 'asc' }, select: { description: true } }),
    ]);
    const techs = await this.prisma.person.findMany({ where: { isTechnician: true, isActive: true }, orderBy: { name: 'asc' }, select: { name: true } });
    const sellers = await this.prisma.person.findMany({ where: { isSeller: true, isActive: true }, orderBy: { name: 'asc' }, select: { name: true } });
    return { causes: causes.map((c) => c.description), defects, solutions: solutions.map((s) => s.description), technicians: techs.map((t) => t.name), sellers: sellers.map((s) => s.name) };
  }
}
