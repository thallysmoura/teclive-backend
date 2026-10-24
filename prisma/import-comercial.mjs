// Importação pontual do módulo Comercial do eugestor (prisma/data/comercial.json, fora do git). Idempotente.
import fs from "fs";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const d = JSON.parse(fs.readFileSync(new URL("./data/comercial.json", import.meta.url), "utf8"));
const digits = (v) => (v ?? "").replace(/\D/g, "") || null;
const money = (v) => (v == null ? 0 : Number(v));

// 1) Leads viram pessoas com isLead = true
for (const l of d.leads) {
  const data = {
    type: l.tipoPessoa, document: digits(l.cpfCnpj), name: l.nomeRazao.trim(), nickname: l.apelidoFantasia, isClient: false, isLead: true,
    sellerName: l.nomeVendedor, becameClientAt: l.dataVirouCliente ? new Date(l.dataVirouCliente) : null, isActive: l.isAtivo,
  };
  await prisma.person.upsert({ where: { legacyId: l.pessoaId }, create: { legacyId: l.pessoaId, ...data }, update: data });
}

// 2) Clientes citados em orçamentos que ainda não existem (cadastro mínimo)
const known = new Map((await prisma.person.findMany({ select: { id: true, legacyId: true } })).map((p) => [p.legacyId, p.id]));
for (const o of d.orcamentos) {
  const p = o.pessoa;
  if (!p || known.has(p.pessoaId)) continue;
  const created = await prisma.person.create({
    data: { legacyId: p.pessoaId, type: p.tipoPessoa, document: digits(p.cpfCnpj), name: p.nomeRazao.trim(), nickname: p.apelidoFantasia, identifier: p.identificador, isClient: !p.lead, isLead: !!p.lead, isActive: !!p.lead },
  });
  known.set(p.pessoaId, created.id);
}

// 3) Orçamentos com itens, formas de pagamento e histórico
let mismatches = 0;
for (const o of d.orcamentos) {
  const p = o.pessoa;
  const items = [];
  let order = 0;
  const push = (kind, row, base) => items.push({ kind, sortOrder: order++, ...base });
  for (const s of o.servicosDoOrcamento.lista) {
    push("SERVICE", s, { description: s.servico.descricao, unit: "UN", quantity: s.quantidade, unitValue: money(s.valores?.unitario), discountValue: money(s.valores?.desconto?.valor), discountPercent: money(s.valores?.desconto?.percentual), total: money(s.valores?.total), cost: money(s.servico.custo), rental: false });
  }
  for (const r of o.produtosDoOrcamento.lista) {
    push("PRODUCT", r, { description: r.produto.descricao, identifier: r.produto.identificador, unit: "UN", quantity: r.quantidade, unitValue: money(r.valores?.unitario), discountValue: money(r.valores?.desconto?.valor), discountPercent: money(r.valores?.desconto?.percentual), total: money(r.valores?.total), cost: money(r.produto.custo), rental: !!r.locado });
  }
  for (const r of o.servicosRecorrentesOrcamento.lista) {
    push("RECURRING", r, { description: r.servico.descricao, unit: "UN", quantity: 1, unitValue: money(r.valorTotal), total: money(r.valorTotal) });
  }
  const sum = items.filter((i) => i.kind !== "RECURRING").reduce((s, i) => s + i.total, 0);
  if (Math.abs(sum - money(o.list.valorTotal)) > 0.01) mismatches++;

  const data = {
    legacyId: o.orcamentoId, number: o.numeroOrcamento, title: o.titulo, personId: p ? known.get(p.pessoaId) : null,
    personName: p?.nomeRazao ?? "—", personNickname: p?.apelidoFantasia ?? null, personDocument: digits(p?.cpfCnpj), personType: p?.tipoPessoa ?? "F", personIsLead: !!p?.lead,
    sellerName: o.vendedor?.nomeRazao ?? null, status: o.status, purpose: o.finalidade, modality: o.modalidade,
    openedAt: new Date(o.dataAbertura), validUntil: new Date(o.dataValidade), wonAt: o.dataGanho ? new Date(o.dataGanho) : null, releasedAt: o.dataLiberacao ? new Date(o.dataLiberacao) : null,
    cancelledAt: o.dataCancelamento ? new Date(o.dataCancelamento) : null, refusalReason: o.descricaoMotivoRecusa, technicalSheet: o.fichaTecnica, notes: o.observacao, showNotes: !!o.exibirObservacao,
    contactName: o.contato?.nome ?? null, contactEmail: o.contato?.email ?? null, contactPhone: o.contato?.telefone ?? null, address: o.endereco ?? undefined, openedBy: o.list.nomeUsuarioAbertura ?? "—", createdAt: new Date(o.dataAbertura),
  };
  const quote = await prisma.quote.upsert({ where: { legacyId: o.orcamentoId }, create: data, update: data });
  await prisma.quoteItem.deleteMany({ where: { quoteId: quote.id } });
  await prisma.quotePayment.deleteMany({ where: { quoteId: quote.id } });
  await prisma.quoteHistory.deleteMany({ where: { quoteId: quote.id } });
  if (items.length) await prisma.quoteItem.createMany({ data: items.map((i) => ({ ...i, quoteId: quote.id })) });
  const payments = o.propostasPagamento.map((pg) => ({ quoteId: quote.id, method: pg.formaPagamento?.descricao ?? "—", installments: pg.parcelas ?? 1, total: money(pg.valorTotal), selected: !!pg.selecionada }));
  if (payments.length) await prisma.quotePayment.createMany({ data: payments });
  const history = o.historico.lista.map((h) => ({ quoteId: quote.id, userName: h.nomeUsuario ?? "—", description: h.descricao, at: new Date(h.dataHora) }));
  if (history.length) await prisma.quoteHistory.createMany({ data: history });
}

// 4) Modelos de orçamento
for (const m of d.modelos) {
  await prisma.quoteModel.upsert({ where: { legacyId: m.modeloOrcamentoId }, create: { legacyId: m.modeloOrcamentoId, description: m.descricao }, update: { description: m.descricao } });
}
console.log("ok; totais divergentes do listado:", mismatches);
await prisma.$disconnect();
