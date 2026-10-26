import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AiService } from '../ai/ai.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Relatório personalizado com IA, sem deixar a IA mexer no banco: ela só ESCOLHE um conjunto de dados
 * do catálogo abaixo e os filtros; a consulta é montada e executada aqui, com campos permitidos.
 * Pedido que não bate com nenhum dado do catálogo volta como "não encontrei".
 */

type Raw = Record<string, any>;
type Col = { label: string; w: number; align?: 'right' | 'center'; get: (r: Raw) => string; sort?: (r: Raw) => number | string };

const brl = (v: unknown) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (v: unknown) => (v ? new Date(v as string).toLocaleDateString('pt-BR') : '');
const time = (v: unknown) => (v ? new Date(v as string).getTime() : 0);
const num = (n: number) => `${String(Math.floor(n / 1000)).padStart(3, '0')}.${String(n % 1000).padStart(3, '0')}`;
const month = (v: unknown) => { const d = new Date(v as string); return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
const monthKey = (v: unknown) => { const d = new Date(v as string); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

const OS_STATUS: Record<number, string> = { 0: 'Aberta', 1: 'Em atraso', 2: 'Cancelada', 3: 'Interrompida', 4: 'Fechada', 5: 'Faturada', 6: 'Faturada Parcialmente', 7: 'Aguardando Aprovação', 8: 'Em Atendimento' };
const OS_TYPE: Record<number, string> = { 1: 'Instalação', 2: 'Cancelamento', 3: 'Manutenção Corretiva', 4: 'Manutenção Preventiva' };
const QUOTE_STATUS: Record<number, string> = { 1: 'Cancelado', 2: 'Recusado', 3: 'Aberto', 4: 'Liberado', 6: 'Vencido', 7: 'OS Aberta', 8: 'Concluído' };
const inverse = (m: Record<number, string>, label?: string) => Object.entries(m).find(([, v]) => v.toLowerCase() === String(label ?? '').toLowerCase())?.[0];

type Dataset = { label: string; defaults: string[]; cols: Record<string, Col>; groups: Record<string, { label: string; key: (r: Raw) => string | string[]; order?: (a: string, b: string) => number }>; money?: (r: Raw) => number };

const DATASETS: Record<string, Dataset> = {
  pessoas: {
    label: 'Pessoas',
    defaults: ['name', 'document', 'phone', 'email'],
    cols: {
      name: { label: 'Nome', w: 200, get: (r) => r.name, sort: (r) => String(r.name).toLowerCase() },
      document: { label: 'CPF/CNPJ', w: 110, get: (r) => r.document ?? '' },
      type: { label: 'Tipo', w: 60, align: 'center', get: (r) => (r.type === 'J' ? 'Jurídica' : 'Física') },
      phone: { label: 'Telefone', w: 100, get: (r) => r.phone ?? '' },
      email: { label: 'E-mail', w: 160, get: (r) => r.email ?? '' },
      address: { label: 'Endereço', w: 260, get: (r) => r.address ?? '' },
      sellerName: { label: 'Vendedor', w: 120, get: (r) => r.sellerName ?? '' },
      active: { label: 'Situação', w: 60, align: 'center', get: (r) => (r.isActive ? 'Ativo' : 'Inativo') },
      createdAt: { label: 'Cadastro', w: 80, align: 'center', get: (r) => date(r.createdAt), sort: (r) => time(r.createdAt) },
      roles: { label: 'Papéis', w: 140, get: (r) => [r.isClient && 'Cliente', r.isSupplier && 'Fornecedor', r.isEmployee && 'Funcionário', r.isSeller && 'Vendedor', r.isCarrier && 'Transportador', r.isTechnician && 'Técnico', r.isLead && 'Lead'].filter(Boolean).join(', ') },
    },
    groups: {
      type: { label: 'Tipo de pessoa', key: (r) => (r.type === 'J' ? 'Jurídica' : 'Física') },
      role: { label: 'Papel', key: (r) => [r.isClient && 'Cliente', r.isSupplier && 'Fornecedor', r.isEmployee && 'Funcionário', r.isSeller && 'Vendedor', r.isCarrier && 'Transportador', r.isTechnician && 'Técnico', r.isLead && 'Lead'].filter(Boolean) as string[] },
      active: { label: 'Situação', key: (r) => (r.isActive ? 'Ativo' : 'Inativo') },
      seller: { label: 'Vendedor', key: (r) => r.sellerName || 'Sem vendedor' },
      month: { label: 'Mês de cadastro', key: (r) => monthKey(r.createdAt), order: (a, b) => (a < b ? -1 : 1) },
    },
  },
  orcamentos: {
    label: 'Orçamentos',
    defaults: ['number', 'personName', 'sellerName', 'status', 'openedAt'],
    cols: {
      number: { label: 'Nº', w: 60, get: (r) => num(r.number), sort: (r) => r.number },
      title: { label: 'Título', w: 160, get: (r) => r.title ?? '' },
      personName: { label: 'Cliente', w: 200, get: (r) => r.personName },
      sellerName: { label: 'Vendedor', w: 120, get: (r) => r.sellerName ?? '' },
      status: { label: 'Situação', w: 90, get: (r) => QUOTE_STATUS[r.status] ?? String(r.status) },
      openedAt: { label: 'Abertura', w: 80, align: 'center', get: (r) => date(r.openedAt), sort: (r) => time(r.openedAt) },
      validUntil: { label: 'Validade', w: 80, align: 'center', get: (r) => date(r.validUntil), sort: (r) => time(r.validUntil) },
      wonAt: { label: 'Ganho em', w: 80, align: 'center', get: (r) => date(r.wonAt), sort: (r) => time(r.wonAt) },
    },
    groups: {
      seller: { label: 'Vendedor', key: (r) => r.sellerName || 'Sem vendedor' },
      status: { label: 'Situação', key: (r) => QUOTE_STATUS[r.status] ?? String(r.status) },
      month: { label: 'Mês de abertura', key: (r) => monthKey(r.openedAt), order: (a, b) => (a < b ? -1 : 1) },
    },
  },
  ordens: {
    label: 'Ordens de serviço',
    defaults: ['number', 'personName', 'type', 'status', 'openedAt'],
    money: (r) => Number(r.totalServices ?? 0) + Number(r.totalProducts ?? 0),
    cols: {
      number: { label: 'Nº', w: 60, get: (r) => num(r.number), sort: (r) => r.number },
      personName: { label: 'Cliente', w: 200, get: (r) => r.personName },
      type: { label: 'Tipo', w: 110, get: (r) => OS_TYPE[r.type] ?? String(r.type) },
      status: { label: 'Situação', w: 100, get: (r) => OS_STATUS[r.status] ?? String(r.status) },
      defectName: { label: 'Defeito', w: 130, get: (r) => r.defectName ?? '' },
      causeName: { label: 'Causa', w: 130, get: (r) => r.causeName ?? '' },
      solutionName: { label: 'Solução', w: 130, get: (r) => r.solutionName ?? '' },
      openedAt: { label: 'Abertura', w: 80, align: 'center', get: (r) => date(r.openedAt), sort: (r) => time(r.openedAt) },
      closedAt: { label: 'Fechamento', w: 80, align: 'center', get: (r) => date(r.closedAt), sort: (r) => time(r.closedAt) },
      scheduleEnd: { label: 'Prazo', w: 80, align: 'center', get: (r) => date(r.scheduleEnd), sort: (r) => time(r.scheduleEnd) },
      total: { label: 'Valor', w: 90, align: 'right', get: (r) => brl(Number(r.totalServices ?? 0) + Number(r.totalProducts ?? 0)), sort: (r) => Number(r.totalServices ?? 0) + Number(r.totalProducts ?? 0) },
    },
    groups: {
      status: { label: 'Situação', key: (r) => OS_STATUS[r.status] ?? String(r.status) },
      type: { label: 'Tipo', key: (r) => OS_TYPE[r.type] ?? String(r.type) },
      month: { label: 'Mês de abertura', key: (r) => monthKey(r.openedAt), order: (a, b) => (a < b ? -1 : 1) },
      defect: { label: 'Defeito', key: (r) => r.defectName || 'Não informado' },
      cause: { label: 'Causa', key: (r) => r.causeName || 'Não informada' },
      solution: { label: 'Solução', key: (r) => r.solutionName || 'Não informada' },
    },
  },
  produtos: {
    label: 'Produtos',
    defaults: ['description', 'brand', 'productGroup', 'salePrice'],
    cols: {
      description: { label: 'Produto', w: 240, get: (r) => r.description, sort: (r) => String(r.description).toLowerCase() },
      brand: { label: 'Marca', w: 100, get: (r) => r.brand },
      productGroup: { label: 'Grupo', w: 110, get: (r) => r.productGroup },
      unit: { label: 'Un.', w: 40, align: 'center', get: (r) => r.unit },
      costPrice: { label: 'Custo', w: 80, align: 'right', get: (r) => (r.costPrice == null ? '' : brl(r.costPrice)), sort: (r) => Number(r.costPrice ?? 0) },
      salePrice: { label: 'Venda', w: 80, align: 'right', get: (r) => (r.salePrice == null ? '' : brl(r.salePrice)), sort: (r) => Number(r.salePrice ?? 0) },
      margin: { label: 'Margem', w: 60, align: 'right', get: (r) => (r.margin == null ? '' : `${Number(r.margin).toLocaleString('pt-BR')}%`), sort: (r) => Number(r.margin ?? 0) },
      active: { label: 'Situação', w: 60, align: 'center', get: (r) => (r.isActive ? 'Ativo' : 'Inativo') },
    },
    groups: {
      brand: { label: 'Marca', key: (r) => r.brand || 'Sem marca' },
      group: { label: 'Grupo', key: (r) => r.productGroup || 'Sem grupo' },
      active: { label: 'Situação', key: (r) => (r.isActive ? 'Ativo' : 'Inativo') },
    },
  },
};

DATASETS.estoque = {
  label: 'Estoque (saldo por produto e local)',
  defaults: ['description', 'location', 'quantity', 'unit', 'value'],
  money: (r) => Number(r.quantity ?? 0) * Number(r.costPrice ?? 0),
  cols: {
    description: { label: 'Produto', w: 230, get: (r) => r.description, sort: (r) => String(r.description).toLowerCase() },
    brand: { label: 'Marca', w: 90, get: (r) => r.brand },
    productGroup: { label: 'Grupo', w: 100, get: (r) => r.productGroup },
    location: { label: 'Local', w: 120, get: (r) => r.location },
    unit: { label: 'Un.', w: 40, align: 'center', get: (r) => r.unit },
    quantity: { label: 'Saldo', w: 70, align: 'right', get: (r) => Number(r.quantity ?? 0).toLocaleString('pt-BR'), sort: (r) => Number(r.quantity ?? 0) },
    costPrice: { label: 'Custo', w: 80, align: 'right', get: (r) => (r.costPrice == null ? '' : brl(r.costPrice)), sort: (r) => Number(r.costPrice ?? 0) },
    salePrice: { label: 'Venda', w: 80, align: 'right', get: (r) => (r.salePrice == null ? '' : brl(r.salePrice)), sort: (r) => Number(r.salePrice ?? 0) },
    value: { label: 'Valor', w: 100, align: 'right', get: (r) => brl(Number(r.quantity ?? 0) * Number(r.costPrice ?? 0)), sort: (r) => Number(r.quantity ?? 0) * Number(r.costPrice ?? 0) },
  },
  groups: {
    location: { label: 'Local de estoque', key: (r) => r.location || 'Sem local' },
    brand: { label: 'Marca', key: (r) => r.brand || 'Sem marca' },
    group: { label: 'Grupo', key: (r) => r.productGroup || 'Sem grupo' },
  },
};

DATASETS.empresa = { label: 'Dados da empresa', defaults: [], cols: {}, groups: {} };

const CATALOG = `Conjuntos de dados disponíveis (use APENAS estes nomes de campo, filtro e agrupamento):
pessoas — campos: name,document,type,phone,email,address,sellerName,active,createdAt,roles. filtros: role(client|supplier|employee|seller|carrier|technician|lead), type(F|J), active(true|false), from/to(data de cadastro YYYY-MM-DD), q(texto no nome). agrupar: type,role,active,seller,month.
orcamentos — campos: number,title,personName,sellerName,status,openedAt,validUntil,wonAt. filtros: seller(texto), status(Cancelado|Recusado|Aberto|Liberado|Vencido|OS Aberta|Concluído), from/to(data de abertura), q(texto no cliente ou título). agrupar: seller,status,month.
ordens — campos: number,personName,type,status,defectName,causeName,solutionName,openedAt,closedAt,scheduleEnd,total. filtros: status(Aberta|Em atraso|Cancelada|Interrompida|Fechada|Faturada|Faturada Parcialmente|Aguardando Aprovação|Em Atendimento), type(Instalação|Cancelamento|Manutenção Corretiva|Manutenção Preventiva), from/to(data de abertura), q(texto no cliente). agrupar: status,type,month,defect,cause,solution.
produtos — campos: description,brand,productGroup,unit,costPrice,salePrice,margin,active. filtros: brand(texto), group(texto), active(true|false), q(texto na descrição). agrupar: brand,group,active.
estoque — saldo atual de cada produto em cada local (use para "itens de estoque", "saldo", "produtos sem saldo/negativos", "valor em estoque"). campos: description,brand,productGroup,location,unit,quantity,costPrice,salePrice,value. filtros: balance(negative|zero|positive), location(texto), brand(texto), group(texto), q(texto no produto). agrupar: location,brand,group.
empresa — dados cadastrais da própria empresa (razão social, nome fantasia, CNPJ, endereço, telefone, e-mail, inscrições, regime tributário, CNAE, contador). sem filtros nem agrupamento.
Obs.: "produtos" é o cadastro (preço, marca); "estoque" é a quantidade em estoque.`;

const cache = new Map<string, { at: number; value: unknown }>();

@Injectable()
export class ReportsAiService {
  constructor(private readonly ai: AiService, private readonly prisma: PrismaService) {}

  async generate(userId: string, request: string) {
    const text = request.replace(/\s+/g, ' ').trim().slice(0, 500);
    if (text.length < 8) throw new BadRequestException('Descreva o relatório que você quer (pelo menos uma frase curta).');
    const key = createHash('sha256').update(text.toLowerCase()).digest('hex');
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value; // mesmo pedido em 10 min: sem gastar IA de novo

    const today = new Date().toISOString().slice(0, 10);
    const system = `Você transforma pedidos de relatório em uma consulta estruturada. Hoje é ${today}. Responda SÓ um JSON.\n${CATALOG}\nFormato: {"found":true,"dataset":"...","title":"título curto do relatório","filters":{...},"groupBy":"opcional","columns":["campos opcionais"],"sort":{"field":"campo","dir":"asc|desc"},"limit":número opcional}.\nSe o pedido NÃO puder ser atendido com esses dados (assunto que não existe neles), responda {"found":false,"message":"1 frase explicando que não encontrou essa informação e quais dados existem (pessoas, orçamentos, ordens de serviço, produtos, estoque, dados da empresa)"}.\nDatas relativas (este mês, ano passado...) viram from/to em YYYY-MM-DD. Não invente filtros fora da lista.`;
    const result = await this.ai.chat([{ role: 'system', content: system }, { role: 'user', content: text }], { json: true, temperature: 0, maxTokens: 350, feature: 'relatorio-personalizado', userId });
    let plan: Raw;
    try { plan = JSON.parse(result.text); } catch { throw new BadRequestException('Não consegui entender o pedido. Tente reescrever com mais detalhes.'); }

    let value: unknown;
    if (!plan.found || !DATASETS[plan.dataset]) {
      value = { found: false, message: typeof plan.message === 'string' && plan.message ? plan.message : 'Não encontrei essa informação nos dados do sistema. Tenho pessoas, orçamentos, ordens de serviço, produtos, estoque e dados da empresa.' };
    } else {
      value = { found: true, report: await this.run(userId, text, plan) };
    }
    cache.set(key, { at: Date.now(), value });
    return value;
  }

  private range(f: Raw, field: string) {
    const out: Raw = {};
    const from = f?.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from) ? new Date(`${f.from}T00:00:00`) : null;
    const to = f?.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to) ? new Date(`${f.to}T23:59:59.999`) : null;
    if (from) out.gte = from;
    if (to) out.lte = to;
    return Object.keys(out).length ? { [field]: out } : {};
  }

  private async fetch(dataset: string, f: Raw): Promise<Raw[]> {
    const ci = (v: unknown) => ({ contains: String(v), mode: 'insensitive' as const });
    if (dataset === 'pessoas') {
      const roles: Record<string, string> = { client: 'isClient', supplier: 'isSupplier', employee: 'isEmployee', seller: 'isSeller', carrier: 'isCarrier', technician: 'isTechnician', lead: 'isLead' };
      return this.prisma.person.findMany({ where: { ...(f.role && roles[f.role] ? { [roles[f.role]]: true } : {}), ...(f.type === 'F' || f.type === 'J' ? { type: f.type } : {}), ...(f.active === true || f.active === false || f.active === 'true' || f.active === 'false' ? { isActive: f.active === true || f.active === 'true' } : {}), ...(f.q ? { name: ci(f.q) } : {}), ...this.range(f, 'createdAt') }, orderBy: { name: 'asc' }, take: 5000 });
    }
    if (dataset === 'orcamentos') {
      const st = inverse(QUOTE_STATUS, f.status);
      return this.prisma.quote.findMany({ where: { ...(f.seller ? { sellerName: ci(f.seller) } : {}), ...(st ? { status: Number(st) } : {}), ...(f.q ? { OR: [{ personName: ci(f.q) }, { title: ci(f.q) }] } : {}), ...this.range(f, 'openedAt') }, orderBy: { number: 'desc' }, take: 5000 });
    }
    if (dataset === 'ordens') {
      const st = inverse(OS_STATUS, f.status);
      const tp = inverse(OS_TYPE, f.type);
      return this.prisma.serviceOrder.findMany({ where: { ...(st ? { status: Number(st) } : {}), ...(tp ? { type: Number(tp) } : {}), ...(f.q ? { personName: ci(f.q) } : {}), ...this.range(f, 'openedAt') }, orderBy: { number: 'desc' }, take: 5000, select: { number: true, personName: true, type: true, status: true, defectName: true, causeName: true, solutionName: true, openedAt: true, closedAt: true, scheduleEnd: true, totalServices: true, totalProducts: true } });
    }
    if (dataset === 'estoque') {
      const rows = await this.prisma.stockProductBalance.findMany({
        where: {
          ...(f.balance === 'negative' ? { quantity: { lt: 0 } } : f.balance === 'zero' ? { quantity: 0 } : f.balance === 'positive' ? { quantity: { gt: 0 } } : {}),
          ...(f.location ? { location: { description: ci(f.location) } } : {}),
          product: { isActive: true, ...(f.brand ? { brand: ci(f.brand) } : {}), ...(f.group ? { productGroup: ci(f.group) } : {}), ...(f.q ? { description: ci(f.q) } : {}) },
        },
        include: { product: { select: { description: true, brand: true, productGroup: true, unit: true, costPrice: true, salePrice: true } }, location: { select: { description: true } } },
        take: 5000,
      });
      return rows.map((b) => ({ ...b.product, location: b.location.description, quantity: b.quantity }));
    }
    return this.prisma.stockProduct.findMany({ where: { ...(f.brand ? { brand: ci(f.brand) } : {}), ...(f.group ? { productGroup: ci(f.group) } : {}), ...(f.active === true || f.active === false || f.active === 'true' || f.active === 'false' ? { isActive: f.active === true || f.active === 'true' } : {}), ...(f.q ? { description: ci(f.q) } : {}) }, orderBy: { description: 'asc' }, take: 5000 });
  }

  private async company(userId: string, request: string, plan: Raw) {
    const [c, user] = await Promise.all([this.prisma.companyProfile.findFirst(), this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } })]);
    const d = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');
    const cnpj = d(c?.cnpj).replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    const cep = d(c?.postalCode).replace(/(\d{5})(\d{3})/, '$1-$2');
    const phone = (v: string | null | undefined) => { const n = d(v); return n.length === 11 ? n.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3') : n.length === 10 ? n.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3') : (v ?? ''); };
    const v = (x: string | null | undefined) => x || '-';
    const address = c ? [`${c.street}, ${c.number}`, c.complement, c.district, `${c.city} - ${c.state}`, cep].filter(Boolean).join(' · ') : '-';
    const rows: [string, string][] = c ? [['Razão social', v(c.legalName)], ['Nome fantasia', v(c.tradeName)], ['CNPJ', v(cnpj)], ['Endereço', address], ['Telefone', v(phone(c.phone))], ['E-mail', v(c.email)], ['Inscrição estadual', v(c.stateRegistration)], ['Inscrição municipal', v(c.municipalRegistration)], ['Inscrição substituta', v(c.substituteRegistration)], ['Regime tributário', v(c.taxRegime)], ['CNAE', v(c.cnae)], ['Contador', c.accountantEnabled ? `${v(c.accountantName)} · ${v(phone(c.accountantPhone))} · ${v(c.accountantEmail)} · CRC ${v(c.accountantCrc)}` : 'Não informado']] : [];
    return {
      title: String(plan.title || 'Dados da Empresa').slice(0, 80),
      company: c?.legalName || c?.tradeName || 'Teclive',
      generatedBy: user?.name ?? '',
      generatedAt: new Date().toISOString(),
      filters: [['Pedido:', request.length > 70 ? `${request.slice(0, 67)}...` : request], ['Dados:', 'Dados da empresa']],
      sections: [{ title: 'Dados cadastrais da empresa', columns: [{ label: 'Informação', width: 200 }, { label: 'Valor', width: 489 }], rows, ...(rows.length ? {} : { note: 'Os dados da empresa ainda não foram preenchidos em Configurações.' }) }],
    };
  }

  private async run(userId: string, request: string, plan: Raw) {
    if (plan.dataset === 'empresa') return this.company(userId, request, plan);
    const ds = DATASETS[plan.dataset];
    const filters: Raw = plan.filters && typeof plan.filters === 'object' ? plan.filters : {};
    const [rows, user, company] = await Promise.all([this.fetch(plan.dataset, filters), this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }), this.prisma.companyProfile.findFirst({ select: { legalName: true, tradeName: true } })]);
    const desc = Object.entries(filters).filter(([, v]) => v !== null && v !== '' && v !== undefined).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'sem filtros';
    const base = {
      title: String(plan.title || `Relatório de ${ds.label}`).slice(0, 80),
      company: company?.legalName || company?.tradeName || 'Teclive',
      generatedBy: user?.name ?? '',
      generatedAt: new Date().toISOString(),
      filters: [['Pedido:', request.length > 70 ? `${request.slice(0, 67)}...` : request], ['Dados:', ds.label], ['Filtros:', desc.length > 70 ? `${desc.slice(0, 67)}...` : desc], ['Registros:', rows.length.toLocaleString('pt-BR')]],
    };

    const sections: Raw[] = [];
    const group = plan.groupBy && ds.groups[plan.groupBy] ? ds.groups[plan.groupBy] : null;
    if (group) {
      const map = new Map<string, { count: number; value: number }>();
      for (const r of rows) {
        const keys = ([] as string[]).concat(group.key(r));
        for (const k of keys) { const cur = map.get(k) ?? { count: 0, value: 0 }; cur.count += 1; cur.value += ds.money ? ds.money(r) : 0; map.set(k, cur); }
      }
      const entries = [...map.entries()].sort((a, b) => (group.order ? group.order(a[0], b[0]) : b[1].count - a[1].count));
      const label = (k: string) => (/^\d{4}-\d{2}$/.test(k) ? month(`${k}-01T12:00:00`) : k);
      const withValue = !!ds.money;
      sections.push({
        title: `${ds.label} por ${group.label.toLowerCase()}`,
        summary: [['Total de registros', rows.length.toLocaleString('pt-BR')], ['Grupos', entries.length.toLocaleString('pt-BR')]],
        columns: withValue ? [{ label: group.label, width: 389 }, { label: 'Quantidade', width: 140, align: 'right' }, { label: 'Valor', width: 160, align: 'right' }] : [{ label: group.label, width: 489 }, { label: 'Quantidade', width: 200, align: 'right' }],
        rows: entries.slice(0, 500).map(([k, v]) => (withValue ? [label(k), v.count.toLocaleString('pt-BR'), brl(v.value)] : [label(k), v.count.toLocaleString('pt-BR')])),
      });
    } else {
      const wanted = (Array.isArray(plan.columns) ? plan.columns : []).filter((c: string) => ds.cols[c]);
      const keys: string[] = wanted.length ? wanted : ds.defaults;
      const limit = Math.min(Math.max(Number(plan.limit) || 200, 1), 500);
      let list = rows;
      const sortKey = plan.sort?.field && ds.cols[plan.sort.field]?.sort ? plan.sort.field : null;
      if (sortKey) { const f = ds.cols[sortKey].sort!; const dir = plan.sort.dir === 'desc' ? -1 : 1; list = [...rows].sort((a, b) => { const x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; }); }
      const total = keys.reduce((s, k) => s + ds.cols[k].w, 0);
      const widths = keys.map((k) => Math.floor((ds.cols[k].w / total) * 689));
      widths[0] += 689 - widths.reduce((s, w) => s + w, 0);
      sections.push({
        title: `${ds.label}${list.length > limit ? ` (primeiros ${limit} de ${list.length})` : ''}`,
        summary: [['Registros encontrados', rows.length.toLocaleString('pt-BR')]],
        columns: keys.map((k, i) => ({ label: ds.cols[k].label, width: widths[i], align: ds.cols[k].align })),
        rows: list.slice(0, limit).map((r) => keys.map((k) => ds.cols[k].get(r))),
        ...(rows.length === 0 ? { note: 'Nenhum registro encontrado com esses filtros.' } : {}),
      });
    }
    return { ...base, sections };
  }
}
