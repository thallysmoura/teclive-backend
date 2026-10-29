// Importa o faturamento do eugestor (prisma/data/faturas-*.txt, nfse.txt, nfe.txt — fora do git). Uso: node prisma/import-faturamento.mjs
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';

const prisma = new PrismaClient();
const read = (f) => fs.readFileSync(new URL(`./data/${f}`, import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => l.split('|'));
const money = (s) => (s ? Number(s.replace(/\./g, '').replace(',', '.')) : null);
const date = (s) => { const [d, m, y] = s.split('/').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
const baseName = (n) => n.replace(/\s*\(.*\)\s*$/, '').trim();

const people = await prisma.person.findMany({ select: { id: true, name: true } });
const byName = new Map(people.map((p) => [p.name.toLowerCase().replace(/\s+/g, ' ').trim(), p.id]));
const personOf = (n) => byName.get(baseName(n).toLowerCase().replace(/\s+/g, ' ')) ?? null;
const origins = { 'Fatura de ordem de serviço': 'OS', 'Fatura de contrato': 'CONTRATO', 'Fatura avulsa': 'AVULSA' };
const users = { 'Shelda Carolin...': 'Shelda Carolina Barros Ramos', 'Mariana de Fát...': 'Mariana de Fátima' };

let n = 0;
for (const [kind, file] of [['S', 'faturas-servicos.txt'], ['P', 'faturas-produtos.txt']]) {
  for (const [num, name, comp, os, contract, nfse, nfe, by, reg, title, total, cat] of read(file)) {
    const origin = origins[cat] ?? 'AVULSA';
    const data = {
      kind, origin, originRef: origin === 'OS' ? os : origin === 'CONTRATO' ? contract : null, personId: personOf(name), personName: name, competence: comp,
      registeredAt: date(reg), createdBy: users[by] ?? by, total: money(total), titleGenerated: title === '1', status: 'FATURADA', nfseNumber: nfse ? Number(nfse) : null, nfeNumber: nfe || null,
    };
    await prisma.invoice.upsert({ where: { number: Number(num) }, update: data, create: { number: Number(num), ...data } });
    n++;
  }
}
// Faturas citadas nas notas fiscais, mas ausentes da listagem (canceladas ou antigas): ficam como canceladas/sem detalhe.
console.log('faturas', n);

let r = 0;
for (const [rps, name, , , inv, lote, nfse, issued, total, st] of read('nfse.txt')) {
  const data = { invoiceNumber: Number(inv), lote, nfseNumber: Number(nfse), issuedAt: date(issued), personName: name, total: money(total), status: st };
  await prisma.nfseRecord.upsert({ where: { rps: Number(rps) }, update: data, create: { rps: Number(rps), ...data } });
  r++;
}
console.log('nfse', r);

let e = 0;
for (const [num, name, st, issued, label, inv, exit, key, total] of read('nfe.txt')) {
  const data = { personName: name, status: st, issuedAt: date(issued), kindLabel: label, invoiceNumber: inv ? Number(inv) : null, exitDate: exit ? date(exit) : null, accessKey: key, total: total ? money(total) : null };
  await prisma.nfeRecord.upsert({ where: { number: Number(num) }, update: data, create: { number: Number(num), ...data } });
  e++;
}
console.log('nfe', e);

if ((await prisma.returnNote.count()) === 0) {
  await prisma.returnNote.createMany({ data: [
    { number: 364, date: date('08/07/2026'), personName: 'B2A COMERCIO DE MATERIAIS DE TELECOMUNIC (PARA CABOS MATRIZ)', kindLabel: 'Devolução de Compra', originNf: '153127', status: 'Autorizada' },
    { number: null, date: date('08/07/2026'), personName: 'WTT EXPORT. E IMPORT. DE EQUIP. ELETRONICOS LTDA (07 - WMG - Manaus)', kindLabel: 'Devolução de Compra', originNf: '60972', status: 'Cancelada' },
  ] });
}
await prisma.$disconnect();
