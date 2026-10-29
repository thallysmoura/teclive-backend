import type { Prisma, PrismaClient } from '@prisma/client';

const num = (v: unknown) => Number(v ?? 0);
const OS_TYPES: Record<number, string> = { 1: 'Instalação', 2: 'Cancelamento', 3: 'Manutenção Corretiva', 4: 'Manutenção Preventiva' };
type Item = { faturado?: boolean; faturaNumero?: number; motivoNaoCobrar?: number | null; valores?: { total?: number } };
export type BillingRow = { key: string; orderId: string; number: number; personName: string; address: unknown; openedAt: Date; closedAt: Date | null; typeLabel: string; kind: 'S' | 'P'; motivo: number; value: number };

export const itemsOf = (detail: unknown, kind: 'S' | 'P'): Item[] => ((detail ?? {}) as { servicos?: Item[]; produtos?: Item[] })[kind === 'S' ? 'servicos' : 'produtos'] ?? [];

/**
 * Linhas "a faturar" das OS fechadas: serviços (cobrados) e produtos agrupados por motivo (produtos, garantia, bonificação, locação),
 * somando só os itens que ainda não foram faturados — o mesmo critério do Andamento Operacional do eugestor.
 */
export async function pendingBillingRows(prisma: PrismaClient, filter: { from?: Date; to?: Date; person?: string; osType?: number } = {}): Promise<BillingRow[]> {
  const where: Prisma.ServiceOrderWhereInput = { status: { in: [4, 5, 6] }, ...(filter.from || filter.to ? { closedAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } } : {}), ...(filter.osType ? { type: filter.osType } : {}), ...(filter.person ? { OR: [{ personName: { contains: filter.person, mode: 'insensitive' } }, { personNickname: { contains: filter.person, mode: 'insensitive' } }] } : {}) };
  const orders = await prisma.serviceOrder.findMany({ where, orderBy: [{ closedAt: 'desc' }, { number: 'desc' }], select: { id: true, number: true, type: true, personName: true, personNickname: true, address: true, openedAt: true, closedAt: true, detail: true } });
  const rows: BillingRow[] = [];
  for (const o of orders) {
    const base = { orderId: o.id, number: o.number, personName: o.personNickname || o.personName, address: o.address, openedAt: o.openedAt, closedAt: o.closedAt, typeLabel: OS_TYPES[o.type] ?? '—' };
    const sv = itemsOf(o.detail, 'S').filter((i) => !i.faturado && !i.motivoNaoCobrar);
    const svTotal = sv.reduce((s, i) => s + num(i.valores?.total), 0);
    if (svTotal > 0) rows.push({ ...base, key: `${o.id}:S:0`, kind: 'S', motivo: 0, value: Math.round(svTotal * 100) / 100 });
    const groups = new Map<number, number>();
    for (const i of itemsOf(o.detail, 'P').filter((x) => !x.faturado)) groups.set(i.motivoNaoCobrar ?? 0, (groups.get(i.motivoNaoCobrar ?? 0) ?? 0) + num(i.valores?.total));
    for (const [motivo, v] of [...groups.entries()].sort((a, b) => b[0] - a[0])) if (v > 0) rows.push({ ...base, key: `${o.id}:P:${motivo}`, kind: 'P', motivo, value: Math.round(v * 100) / 100 });
  }
  return rows;
}

/** Marca como faturados os itens de uma linha, guardando o número da fatura para o estorno. */
export function flagItems(detail: unknown, kind: 'S' | 'P', motivo: number, invoiceNumber: number): number {
  let total = 0;
  for (const i of itemsOf(detail, kind)) {
    if (!i.faturado && (kind === 'S' ? !i.motivoNaoCobrar : (i.motivoNaoCobrar ?? 0) === motivo)) { i.faturado = true; i.faturaNumero = invoiceNumber; total += num(i.valores?.total); }
  }
  return total;
}

/** Desfaz a marcação dos itens faturados por uma fatura (cancelamento). */
export function unflagInvoice(detail: unknown, invoiceNumber: number) {
  for (const kind of ['S', 'P'] as const) for (const i of itemsOf(detail, kind)) if (i.faturaNumero === invoiceNumber) { delete i.faturado; delete i.faturaNumero; }
}
