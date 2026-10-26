import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

const n = (v: unknown) => Number(v ?? 0);
const PAGE = 20;
const ymd = (d: Date) => d.toLocaleDateString('pt-BR');

type ContractInput = {
  personId?: string; billingDay?: number; paymentMethodId?: string | null; billingGroupId?: string | null; sellerName?: string | null; number?: string;
  startDate?: string; endDate?: string | null; observation?: string | null; adjustIndex?: number | null; allowAdjust?: boolean; penaltyPercent?: number; dueType?: number | null; status?: number;
};
type InvoiceInput = { description?: string; netValue?: number; serviceCount?: number; address?: Record<string, string> | null };

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async lookups() {
    const [paymentMethods, billingGroups, sellers] = await Promise.all([
      this.prisma.paymentMethod.findMany({ where: { isActive: true }, orderBy: { legacyId: 'asc' }, select: { id: true, description: true } }),
      this.prisma.billingGroup.findMany({ where: { isActive: true }, orderBy: { description: 'asc' }, select: { id: true, description: true } }),
      this.prisma.person.findMany({ where: { isSeller: true, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    ]);
    return { paymentMethods, billingGroups, sellers };
  }

  async list(q: { q?: string; status?: number[]; page?: number; orderBy?: string; desc?: boolean }) {
    const term = q.q?.trim();
    const where: Prisma.ContractWhereInput = {
      ...(q.status?.length ? { status: { in: q.status } } : {}),
      ...(term ? { OR: [{ number: { contains: term, mode: 'insensitive' } }, { personName: { contains: term, mode: 'insensitive' } }, { personDocument: { contains: term.replace(/\D/g, '') || '__', mode: 'insensitive' } }] } : {}),
    };
    const order: Record<string, Prisma.ContractOrderByWithRelationInput> = { number: { number: 'asc' }, billingDay: { billingDay: 'asc' }, totalNet: { totalNet: 'asc' } };
    const dir = q.desc === false ? 'asc' : 'desc';
    const key = q.orderBy && order[q.orderBy] ? q.orderBy : 'number';
    const orderBy = { [key]: dir } as Prisma.ContractOrderByWithRelationInput;
    const page = Math.max(1, q.page ?? 1);
    const [rows, total] = await Promise.all([
      this.prisma.contract.findMany({ where, orderBy, skip: (page - 1) * PAGE, take: PAGE, include: { invoices: { select: { canceled: true } } } }),
      this.prisma.contract.count({ where }),
    ]);
    return {
      lista: rows.map((c) => ({ id: c.id, number: c.number, personName: c.personName, personDocument: c.personDocument, personType: c.personType, billingDay: c.billingDay, totalNet: n(c.totalNet), status: c.status, activeInvoices: c.invoices.filter((i) => !i.canceled).length })),
      totalRegistros: total,
      tamanhoPagina: PAGE,
    };
  }

  private async load(id: string) {
    const c = await this.prisma.contract.findUnique({ where: { id }, include: { paymentMethod: true, billingGroup: true, invoices: { orderBy: { createdAt: 'asc' }, include: { products: { orderBy: { description: 'asc' } } } }, history: { orderBy: { at: 'desc' } } } });
    if (!c) throw new NotFoundException('Contrato não encontrado.');
    return c;
  }

  async detail(id: string) {
    const c = await this.load(id);
    return {
      id: c.id, number: c.number, modality: c.modality, status: c.status, observation: c.observation, sellerName: c.sellerName,
      person: { id: c.personId, name: c.personName, document: c.personDocument, type: c.personType },
      billingGroup: c.billingGroup ? { id: c.billingGroup.id, description: c.billingGroup.description } : null,
      paymentMethod: c.paymentMethod ? { id: c.paymentMethod.id, description: c.paymentMethod.description } : null,
      billingDay: c.billingDay, dueType: c.dueType, startDate: c.startDate, endDate: c.endDate,
      adjustIndex: c.adjustIndex, allowAdjust: c.allowAdjust, penaltyPercent: n(c.penaltyPercent),
      totalGross: n(c.totalGross), totalNet: n(c.totalNet),
      invoices: c.invoices.map((i) => ({ id: i.id, description: i.description, type: i.type, netValue: n(i.netValue), serviceCount: i.serviceCount, canceled: i.canceled, taxPending: i.taxPending, address: i.address, products: i.products.map((p) => ({ id: p.id, description: p.description, identifier: p.identifier, unitMeasure: p.unitMeasure, sale: n(p.balanceSale), rental: n(p.balanceRental), gratuity: n(p.balanceGratuity), warranty: n(p.balanceWarranty) })) })),
      history: c.history.map((h) => ({ id: h.id, at: h.at, description: h.description, isLog: h.isLog, userName: h.userName })),
    };
  }

  private async log(contractId: string, text: string, userName: string) {
    await this.prisma.contractHistory.create({ data: { contractId, description: text, userName } });
  }

  private async recalc(contractId: string) {
    const invoices = await this.prisma.contractInvoice.findMany({ where: { contractId, canceled: false }, select: { netValue: true } });
    const sum = invoices.reduce((s, i) => s + n(i.netValue), 0);
    await this.prisma.contract.update({ where: { id: contractId }, data: { totalGross: sum, totalNet: sum } });
  }

  private async nextNumber(year: number) {
    const last = await this.prisma.contract.findMany({ where: { number: { endsWith: `/${year}` } }, select: { number: true } });
    const max = last.reduce((m, c) => Math.max(m, Number(c.number.split('/')[0]) || 0), 0);
    return `${String(max + 1).padStart(6, '0')}/${year}`;
  }

  private dates(input: ContractInput) {
    const start = input.startDate ? new Date(`${input.startDate}T12:00:00`) : undefined;
    const end = input.endDate ? new Date(`${input.endDate}T12:00:00`) : input.endDate === null ? null : undefined;
    if (start && Number.isNaN(start.getTime())) throw new BadRequestException('Data de início inválida.');
    if (end && Number.isNaN(end.getTime())) throw new BadRequestException('Data final inválida.');
    if (start && end && end <= start) throw new BadRequestException('O fim da vigência deve ser depois do início.');
    return { start, end };
  }

  async create(input: ContractInput, userName: string) {
    if (!input.personId) throw new BadRequestException('Selecione o cliente.');
    const person = await this.prisma.person.findUnique({ where: { id: input.personId }, select: { id: true, name: true, document: true, type: true } });
    if (!person) throw new BadRequestException('Cliente não encontrado.');
    const day = Number(input.billingDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) throw new BadRequestException('Informe o dia de vencimento (de 1 a 31).');
    if (!input.paymentMethodId) throw new BadRequestException('Selecione a forma de pagamento.');
    if (!input.billingGroupId) throw new BadRequestException('Selecione o grupo de faturamento.');
    if (!input.startDate) throw new BadRequestException('Informe o início da vigência.');
    const { start, end } = this.dates(input);
    const number = input.number?.trim() || (await this.nextNumber(start!.getFullYear()));
    if (await this.prisma.contract.findUnique({ where: { number } })) throw new BadRequestException('Já existe um contrato com esse número.');
    const c = await this.prisma.contract.create({
      data: { number, personId: person.id, personName: person.name, personDocument: person.document, personType: person.type, billingDay: day, paymentMethodId: input.paymentMethodId, billingGroupId: input.billingGroupId, sellerName: input.sellerName || null, startDate: start!, endDate: end ?? null, observation: input.observation || null, allowAdjust: true, penaltyPercent: 0, createdBy: userName },
      select: { id: true, number: true },
    });
    await this.log(c.id, `Contrato ${c.number} criado por '${userName}'.`, userName);
    return c;
  }

  async update(id: string, input: ContractInput, userName: string) {
    const current = await this.load(id);
    const { start, end } = this.dates(input);
    const data: Prisma.ContractUncheckedUpdateInput = {};
    if (input.billingDay !== undefined) { const d = Number(input.billingDay); if (!Number.isInteger(d) || d < 1 || d > 31) throw new BadRequestException('Dia de vencimento inválido.'); data.billingDay = d; }
    if (input.paymentMethodId !== undefined) data.paymentMethodId = input.paymentMethodId;
    if (input.billingGroupId !== undefined) data.billingGroupId = input.billingGroupId;
    if (input.sellerName !== undefined) data.sellerName = input.sellerName || null;
    if (input.observation !== undefined) data.observation = input.observation || null;
    if (input.adjustIndex !== undefined) data.adjustIndex = input.adjustIndex;
    if (input.allowAdjust !== undefined) data.allowAdjust = !!input.allowAdjust;
    if (input.dueType !== undefined) data.dueType = input.dueType;
    if (input.status !== undefined) data.status = Number(input.status);
    if (input.penaltyPercent !== undefined) { const p = Number(input.penaltyPercent); if (!(p >= 0 && p <= 100)) throw new BadRequestException('A multa deve ficar entre 0% e 100%.'); data.penaltyPercent = p; }
    if (start) { data.startDate = start; if (ymd(start) !== ymd(current.startDate)) await this.log(id, `Início da vigência alterado de ${ymd(current.startDate)} para ${ymd(start)}, por '${userName}'.`, userName); }
    if (end !== undefined) { data.endDate = end; const before = current.endDate ? ymd(current.endDate) : 'indeterminado'; const after = end ? ymd(end) : 'indeterminado'; if (before !== after) await this.log(id, `Fim da vigência alterado de ${before} para ${after}, por '${userName}'.`, userName); }
    if (input.status !== undefined && input.status !== current.status) await this.log(id, `Situação do contrato alterada, por '${userName}'.`, userName);
    await this.prisma.contract.update({ where: { id }, data });
    return this.detail(id);
  }

  async remove(id: string) {
    await this.load(id);
    await this.prisma.contract.delete({ where: { id } });
  }

  async addInvoice(id: string, input: InvoiceInput, userName: string) {
    await this.load(id);
    const description = input.description?.trim();
    if (!description) throw new BadRequestException('Informe a descrição da fatura.');
    const value = n(input.netValue);
    if (value < 0) throw new BadRequestException('O valor da fatura não pode ser negativo.');
    const inv = await this.prisma.contractInvoice.create({ data: { contractId: id, description, netValue: value, serviceCount: Math.max(1, Number(input.serviceCount) || 1), address: (input.address ?? Prisma.JsonNull) as Prisma.InputJsonValue } });
    await this.recalc(id);
    await this.log(id, `Fatura '${description}' adicionada ao contrato por '${userName}'.`, userName);
    return { id: inv.id };
  }

  async updateInvoice(id: string, invoiceId: string, input: InvoiceInput & { canceled?: boolean }, userName: string) {
    const inv = await this.prisma.contractInvoice.findFirst({ where: { id: invoiceId, contractId: id } });
    if (!inv) throw new NotFoundException('Fatura não encontrada.');
    const data: Prisma.ContractInvoiceUpdateInput = {};
    if (input.description !== undefined) { if (!input.description.trim()) throw new BadRequestException('Informe a descrição da fatura.'); data.description = input.description.trim(); }
    if (input.netValue !== undefined) { if (n(input.netValue) < 0) throw new BadRequestException('O valor da fatura não pode ser negativo.'); data.netValue = n(input.netValue); }
    if (input.serviceCount !== undefined) data.serviceCount = Math.max(1, Number(input.serviceCount) || 1);
    if (input.address !== undefined) data.address = (input.address ?? Prisma.JsonNull) as Prisma.InputJsonValue;
    if (input.canceled !== undefined) data.canceled = !!input.canceled;
    await this.prisma.contractInvoice.update({ where: { id: invoiceId }, data });
    await this.recalc(id);
    await this.log(id, `Fatura '${inv.description}' alterada por '${userName}'.`, userName);
    return this.detail(id);
  }

  async removeInvoice(id: string, invoiceId: string, userName: string) {
    const inv = await this.prisma.contractInvoice.findFirst({ where: { id: invoiceId, contractId: id } });
    if (!inv) throw new NotFoundException('Fatura não encontrada.');
    await this.prisma.contractInvoice.delete({ where: { id: invoiceId } });
    await this.recalc(id);
    await this.log(id, `Fatura '${inv.description}' removida do contrato por '${userName}'.`, userName);
  }

  async addProduct(id: string, invoiceId: string, input: { productId?: string; sale?: number; rental?: number; gratuity?: number; warranty?: number }, userName: string) {
    const inv = await this.prisma.contractInvoice.findFirst({ where: { id: invoiceId, contractId: id } });
    if (!inv) throw new NotFoundException('Fatura não encontrada.');
    const product = input.productId ? await this.prisma.stockProduct.findUnique({ where: { id: input.productId }, select: { description: true, identifier: true, legacyId: true } }) : null;
    if (!product) throw new BadRequestException('Selecione o produto.');
    const qty = (v: unknown) => Math.max(0, n(v));
    const total = qty(input.sale) + qty(input.rental) + qty(input.gratuity) + qty(input.warranty);
    if (total <= 0) throw new BadRequestException('Informe ao menos uma quantidade (venda, locação, gratificação ou garantia).');
    await this.prisma.contractProduct.create({ data: { invoiceId, productLegacyId: product.legacyId, description: product.description, identifier: product.identifier, balanceSale: qty(input.sale), balanceRental: qty(input.rental), balanceGratuity: qty(input.gratuity), balanceWarranty: qty(input.warranty) } });
    await this.log(id, `Produto '${product.description}' adicionado ao contrato por '${userName}'.`, userName);
    return this.detail(id);
  }

  async removeProduct(id: string, invoiceId: string, productId: string, userName: string) {
    const p = await this.prisma.contractProduct.findFirst({ where: { id: productId, invoiceId, invoice: { contractId: id } } });
    if (!p) throw new NotFoundException('Produto não encontrado.');
    await this.prisma.contractProduct.delete({ where: { id: productId } });
    await this.log(id, `Produto '${p.description}' removido do contrato por '${userName}'.`, userName);
  }
}
