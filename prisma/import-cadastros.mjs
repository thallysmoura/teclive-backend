// Importação pontual dos cadastros do eugestor (prisma/data/cadastros.json, fora do git). Idempotente.
import fs from "fs";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const d = JSON.parse(fs.readFileSync(new URL("./data/cadastros.json", import.meta.url), "utf8"));
const UNITS = { 3: ["UN", "Unidade"], 4: ["PC", "Peça"], 13: ["MT", "Metro"], 27: ["KIT", "Kit"], 30: ["PACOTE", "Pacote"] };
const digits = (v) => (v ?? "").replace(/\D/g, "") || null;

const kinds = { marcas: ["brands", "marcaId"], "grupos-produto": ["product-groups", "grupoProdutoId"], "ramos-atividade": ["activity-branches", "ramoAtividadeId"] };
for (const [res, [kind, idKey]] of Object.entries(kinds)) {
  for (const r of d[res]) {
    await prisma.catalogItem.upsert({
      where: { kind_legacyId: { kind, legacyId: r[idKey] } },
      create: { kind, legacyId: r[idKey], description: r.descricao.trim(), isActive: r.isAtivo },
      update: { description: r.descricao.trim(), isActive: r.isAtivo },
    });
  }
}

for (const s of d.servicos) {
  const data = {
    description: s.descricao.trim(), category: s.categoria?.descricao ?? null, modality: s.modalidade, serviceType: s.tipoServico,
    blocksOnDelinquency: !!s.permiteBloqueioPorInadimplencia, cost: s.valores?.custo ?? 0, margin: s.valores?.percentualLucro ?? 50, price: s.valores?.preco ?? 0, isActive: s.isAtivo,
  };
  await prisma.serviceItem.upsert({ where: { legacyId: s.servicoId }, create: { legacyId: s.servicoId, ...data }, update: data });
}

for (const p of d.produtos) {
  const [unit, unitName] = UNITS[p.unidadeMedida] ?? ["UN", "Unidade"];
  const data = {
    description: p.descricao.trim(), brand: p.marca?.descricao ?? "Geral", productGroup: p.grupoProduto?.descricao ?? "Geral", unit, unitName,
    model: p.modelo, alternativeDescription: p.descricaoAlternativa, identifier: p.identificador, supplierCode: p.codigoFornecedor, barcode: p.codigoBarras,
    allowNegativeStock: !!p.estoqueNegativoPermitido, allowRental: !!p.locacaoPermitida, isActive: p.isAtivo,
    costPrice: p.valores?.custo ?? 0, salePrice: p.valores?.preco ?? 0, margin: p.valores?.percentualLucro ?? 50,
  };
  await prisma.stockProduct.upsert({ where: { legacyId: p.produtoId }, create: { legacyId: p.produtoId, ...data }, update: data });
}

for (const p of d.pessoas) {
  const t = p.tipoCadastro ?? {};
  const data = {
    type: p.tipoPessoa, document: digits(p.cpfCnpj), name: p.nomeRazao.trim(), nickname: p.apelidoFantasia, rg: p.rg, identifier: p.identificador,
    isClient: !!t.isCliente, isSupplier: !!t.isFornecedor, isEmployee: !!t.isFuncionario, isTechnician: !!t.isTecnico, isCarrier: !!t.isTransportador, isSeller: !!t.isVendedor,
    taxpayerType: p.dadosTributarios?.tipoContribuinteId ?? null, isFinalConsumer: !!p.dadosTributarios?.isConsumidorFinal,
    municipalRegistration: p.dadosTributarios?.inscricaoMunicipal, stateRegistration: p.dadosTributarios?.inscricaoEstadual,
    email: p.contatoPrincipal?.email ?? null, phone: p.contatoPrincipal?.telefone ?? null, isActive: p.isAtivo, createdAt: new Date(p.dataRegistro + "Z"),
  };
  await prisma.person.upsert({ where: { legacyId: p.pessoaId }, create: { legacyId: p.pessoaId, ...data }, update: data });
}
console.log("ok");
await prisma.$disconnect();
