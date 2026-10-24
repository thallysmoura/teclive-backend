// Importação pontual do módulo Operacional do eugestor (prisma/data/operacional.json, fora do git). Idempotente.
import fs from "fs";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const d = JSON.parse(fs.readFileSync(new URL("./data/operacional.json", import.meta.url), "utf8"));
const money = (v) => (v == null ? 0 : Number(v));
const date = (v) => (v ? new Date(v) : null);
const minutes = (t) => (t ? (t.hora ?? 0) * 60 + (t.minuto ?? 0) : 0);

for (const c of d.lookups.causas) await prisma.opCause.upsert({ where: { legacyId: c.causaId }, create: { legacyId: c.causaId, description: c.descricao, isActive: c.isAtivo }, update: { description: c.descricao, isActive: c.isAtivo } });
for (const c of d.lookups.solucoes) await prisma.opSolution.upsert({ where: { legacyId: c.solucaoId }, create: { legacyId: c.solucaoId, description: c.descricao, isActive: c.isAtivo }, update: { description: c.descricao, isActive: c.isAtivo } });
for (const c of d.lookups.defeitos) {
  const data = { description: c.descricao, serviceMinutes: minutes(c.prazoAtendimento), closingMinutes: minutes(c.previsaoFechamento), isActive: c.isAtivo };
  await prisma.opDefect.upsert({ where: { legacyId: c.defeitoId }, create: { legacyId: c.defeitoId, ...data }, update: data });
}
for (const q of d.lookups.questionarios) {
  const data = { title: q.titulo, description: q.descricao, questionCount: q.quantidadePerguntas ?? 0, isActive: q.isAtivo };
  await prisma.opQuestionnaire.upsert({ where: { legacyId: q.questionarioTemplateId }, create: { legacyId: q.questionarioTemplateId, ...data }, update: data });
}

const people = new Map((await prisma.person.findMany({ select: { id: true, legacyId: true } })).map((p) => [p.legacyId, p.id]));
let missingPeople = 0;
for (const o of d.list) {
  const x = d.details[o.ordemServicoId];
  const p = x.pessoa;
  if (!people.has(p.pessoaId)) missingPeople++;
  const detail = {
    contato: x.contato, vendedores: x.vendedores, avisos: x.avisosVigentes, duracaoMinutos: x.duracaoTotalAtendimentosDaOrdemServico?.duracaoTotalEmMinutos ?? 0,
    adiantamentos: x.adiantamentos, atendimentos: x.atendimentosDaOrdemServico?.lista ?? [], eventos: x.resumoDeEventosDaOrdemServico, pendencias: x.pendencias,
    servicos: x.servicosDaOrdemServico?.lista ?? [], produtos: x.produtosDaOrdemServico?.lista ?? [], produtosARetirar: x.produtosARetirar?.lista ?? [],
    totais: { servicos: x.totaisDosServicosDaOrdemServico, produtos: x.totaisDosProdutoDaOrdemServico },
    anexos: x.anexos?.lista ?? [], historico: x.historico?.lista ?? [], cobranca: x.dadosCobranca, fechamento: x.dadosFechamento, questionarios: x.questionarios ?? [], contrato: x.contrato,
  };
  const data = {
    number: o.numeroOrdemServico, type: x.tipo, purpose: o.finalidade, status: o.statusOrdemServico, defectName: x.defeito?.descricao ?? o.defeito,
    personId: people.get(p.pessoaId) ?? null, personName: p.nomeRazao, personNickname: p.apelidoFantasia, personType: p.tipoPessoa ?? "F",
    address: x.endereco ?? undefined, contact: x.contato ?? undefined, openedBy: x.abertoPor ?? "—",
    openedAt: date(o.dataAbertura), closedAt: date(o.dataFechamento), cancelledAt: date(o.dataCancelamento), interruptedAt: date(o.dataInterrupcao),
    scheduleStart: date(o.dataPrevisaoAtendimento), scheduleEnd: date(o.dataPrevisaoFechamento),
    technicians: (x.tecnicos ?? []).map((t) => t.nomeRazao), sellers: (x.vendedores ?? []).map((v) => v.nomeRazao), quoteNumbers: o.numerosOrcamentosVinculados ?? [],
    technicalSheet: x.fichaTecnica, totalServices: money(x.totaisDosServicosDaOrdemServico?.liquido), totalProducts: money(x.totaisDosProdutoDaOrdemServico?.liquido),
    causeName: x.dadosFechamento?.causa?.descricao ?? null, solutionName: x.dadosFechamento?.solucao?.descricao ?? null,
    paymentMethod: x.dadosCobranca?.formaPagamento?.descricao ?? null, installments: x.dadosCobranca?.quantidadeParcelas ?? null, detail,
  };
  await prisma.serviceOrder.upsert({ where: { legacyId: o.ordemServicoId }, create: { legacyId: o.ordemServicoId, ...data }, update: data });
}
console.log("ok; OS:", d.list.length, "| clientes sem cadastro local:", missingPeople);
await prisma.$disconnect();
