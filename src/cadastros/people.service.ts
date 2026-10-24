import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

const PAGE_SIZE = 20;
const ROLES = ['isClient', 'isSupplier', 'isEmployee', 'isTechnician', 'isCarrier', 'isSeller'] as const;

export type PersonInput = {
  type?: string; name?: string; nickname?: string; document?: string; rg?: string; identifier?: string;
  isClient?: boolean; isSupplier?: boolean; isEmployee?: boolean; isTechnician?: boolean; isCarrier?: boolean; isSeller?: boolean;
  sellerName?: string; taxpayerType?: number | null; isFinalConsumer?: boolean; municipalRegistration?: string; stateRegistration?: string; email?: string; phone?: string;
};

const blank = (v?: string | null) => (v?.trim() ? v.trim() : null);
const digits = (v?: string | null) => (v ?? '').replace(/\D/g, '');


function lastMonths(dates: Date[], count = 6) {
  const now = new Date();
  const buckets = Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return { key: d.getFullYear() * 12 + d.getMonth(), label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), value: 0 };
  });
  for (const date of dates) {
    const key = date.getFullYear() * 12 + date.getMonth();
    const bucket = buckets.find((b) => b.key === key);
    if (bucket) bucket.value++;
  }
  return buckets.map(({ label, value }) => ({ label, value }));
}

@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { q?: string; exibirInativos?: boolean; lead?: boolean; role?: string; type?: string; page?: number; orderBy?: string; desc?: boolean }) {
    const q = params.q?.trim();
    const qDigits = digits(q);
    const where: Prisma.PersonWhereInput = {
      isLead: !!params.lead,
      ...(params.exibirInativos ? {} : { isActive: true }),
      ...(params.type === 'F' || params.type === 'J' ? { type: params.type } : {}),
      ...(params.role && (ROLES as readonly string[]).includes(params.role) ? { [params.role]: true } : {}),
      ...(q
        ? { OR: [
            { name: { contains: q, mode: 'insensitive' } }, { nickname: { contains: q, mode: 'insensitive' } }, { identifier: { contains: q, mode: 'insensitive' } },
            ...(qDigits ? [{ document: { contains: qDigits } }] : []),
          ] }
        : {}),
    };
    const dir = params.desc ? 'desc' : 'asc';
    const orderBy: Prisma.PersonOrderByWithRelationInput | Prisma.PersonOrderByWithRelationInput[] = params.orderBy === 'isActive' ? { isActive: dir } : params.orderBy === 'name' ? { name: dir } : [{ legacyId: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }];
    const page = Math.max(1, params.page ?? 1);
    const [lista, totalRegistros] = await Promise.all([
      this.prisma.person.findMany({ where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      this.prisma.person.count({ where }),
    ]);
    return { lista, totalRegistros, tamanhoPagina: PAGE_SIZE };
  }

  async stats() {
    const people = await this.prisma.person.findMany({ where: { isLead: false }, select: { type: true, document: true, email: true, phone: true, isActive: true, createdAt: true, isClient: true, isSupplier: true, isEmployee: true, isTechnician: true, isCarrier: true, isSeller: true } });
    const total = people.length;
    const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
    const since = Date.now() - 30 * 86400000;
    return {
      total,
      active: people.filter((p) => p.isActive).length,
      inactive: people.filter((p) => !p.isActive).length,
      physical: people.filter((p) => p.type === 'F').length,
      legal: people.filter((p) => p.type === 'J').length,
      newLast30Days: people.filter((p) => p.createdAt.getTime() >= since).length,
      withDocumentPct: pct(people.filter((p) => p.document).length),
      withContactPct: pct(people.filter((p) => p.email || p.phone).length),
      roles: [
        { label: 'Clientes', value: people.filter((p) => p.isClient).length },
        { label: 'Fornecedores', value: people.filter((p) => p.isSupplier).length },
        { label: 'Funcionários', value: people.filter((p) => p.isEmployee).length },
        { label: 'Técnicos', value: people.filter((p) => p.isTechnician).length },
        { label: 'Vendedores', value: people.filter((p) => p.isSeller).length },
        { label: 'Transportadores', value: people.filter((p) => p.isCarrier).length },
      ],
      monthly: lastMonths(people.map((p) => p.createdAt)),
    };
  }

  async get(id: string) {
    const person = await this.prisma.person.findUnique({ where: { id } });
    if (!person) throw new NotFoundException('Pessoa não encontrada.');
    return person;
  }

  private async data(input: PersonInput, ignoreId?: string, lead = false) {
    const type = input.type === 'J' ? 'J' : 'F';
    const name = (input.name ?? '').trim();
    if (!name) throw new BadRequestException(type === 'J' ? 'Informe a razão social.' : 'Informe o nome da pessoa.');
    if (name.length > 200) throw new BadRequestException('O nome deve ter no máximo 200 caracteres.');
    const document = digits(input.document) || null;
    if (document && document.length !== (type === 'J' ? 14 : 11)) throw new BadRequestException(type === 'J' ? 'CNPJ inválido.' : 'CPF inválido.');
    if (document) {
      const duplicate = await this.prisma.person.findFirst({ where: { document, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) } });
      if (duplicate) throw new ConflictException(`Já existe uma pessoa cadastrada com este ${type === 'J' ? 'CNPJ' : 'CPF'}.`);
    }
    const roles = Object.fromEntries(ROLES.map((r) => [r, !!input[r]])) as Record<(typeof ROLES)[number], boolean>;
    if (lead) for (const r of ROLES) roles[r] = false;
    else if (!Object.values(roles).some(Boolean)) throw new BadRequestException('Selecione ao menos um tipo de cadastro.');
    const email = blank(input.email);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestException('E-mail inválido.');
    return {
      type, name, nickname: blank(input.nickname), document, rg: type === 'F' ? blank(input.rg) : null, identifier: blank(input.identifier), ...roles,
      ...(input.sellerName !== undefined ? { sellerName: blank(input.sellerName) } : {}),
      taxpayerType: input.taxpayerType ?? null, isFinalConsumer: !!input.isFinalConsumer,
      municipalRegistration: blank(input.municipalRegistration), stateRegistration: blank(input.stateRegistration), email, phone: blank(input.phone),
    };
  }

  async create(input: PersonInput, lead = false) {
    return this.prisma.person.create({ data: { ...(await this.data(input, undefined, lead)), isLead: lead } });
  }

  async update(id: string, input: PersonInput) {
    const current = await this.get(id);
    return this.prisma.person.update({ where: { id }, data: await this.data(input, id, current.isLead) });
  }

  async sellers() {
    return this.prisma.person.findMany({ where: { isSeller: true, isActive: true, isLead: false }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }

  async leadStats() {
    const leads = await this.prisma.person.findMany({ where: { isLead: true }, select: { id: true, type: true, isActive: true, sellerName: true, email: true, phone: true } });
    const quotes = await this.prisma.quote.findMany({ where: { personId: { in: leads.map((l) => l.id) } }, include: { items: true } });
    const byLead = new Map<string, { count: number; value: number }>();
    for (const q of quotes) {
      const value = q.items.filter((i) => i.kind !== 'RECURRING').reduce((s, i) => s + Number(i.total), 0);
      const cur = byLead.get(q.personId as string) ?? { count: 0, value: 0 };
      byLead.set(q.personId as string, { count: cur.count + 1, value: cur.value + value });
    }
    const sellers = new Map<string, number>();
    for (const l of leads) sellers.set(l.sellerName ?? 'Sem vendedor', (sellers.get(l.sellerName ?? 'Sem vendedor') ?? 0) + 1);
    const converted = await this.prisma.person.count({ where: { isLead: false, becameClientAt: { not: null } } });
    const withQuotes = leads.filter((l) => byLead.has(l.id)).length;
    return {
      total: leads.length, active: leads.filter((l) => l.isActive).length, converted, withQuotes, withoutQuotes: leads.length - withQuotes,
      pipelineValue: [...byLead.values()].reduce((s, v) => s + v.value, 0), withoutSeller: leads.filter((l) => !l.sellerName).length,
      physical: leads.filter((l) => l.type === 'F').length, legal: leads.filter((l) => l.type === 'J').length,
      bySeller: [...sellers.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6),
    };
  }

  /** Clientes e leads para seleção (orçamentos, ações de venda): busca por nome, apelido ou documento. */
  async clientOptions(q?: string) {
    const term = q?.trim();
    const digits = (term ?? '').replace(/D/g, '');
    const rows = await this.prisma.person.findMany({
      where: { isActive: true, OR: [{ isClient: true }, { isLead: true }], ...(term ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { nickname: { contains: term, mode: 'insensitive' } }, ...(digits ? [{ document: { contains: digits } }] : [])] } : {}) },
      select: { id: true, name: true, nickname: true, document: true, isLead: true, type: true, sellerName: true },
      orderBy: { name: 'asc' },
      take: 40,
    });
    return rows;
  }

  async convertLead(id: string) {
    const person = await this.get(id);
    if (!person.isLead) throw new BadRequestException('Esta pessoa já é um cliente.');
    return this.prisma.person.update({ where: { id }, data: { isLead: false, isClient: true, becameClientAt: new Date() } });
  }

  async setActive(id: string, isActive: boolean) {
    await this.get(id);
    return this.prisma.person.update({ where: { id }, data: { isActive } });
  }

  async remove(id: string) {
    await this.get(id);
    const quotes = await this.prisma.quote.count({ where: { personId: id } });
    if (quotes > 0) throw new ConflictException(`Possui ${quotes} orçamento(s) e não pode ser excluído. Inative o cadastro.`);
    await this.prisma.person.delete({ where: { id } });
    return { ok: true };
  }
}
