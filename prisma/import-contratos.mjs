// Importa os contratos do eugestor (prisma/data/contratos.txt, fora do git). Uso: node prisma/import-contratos.mjs
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';

const prisma = new PrismaClient();
const lines = fs.readFileSync(new URL('./data/contratos.txt', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => l.split('|'));
const bool = (v) => v === 'true';

for (const [, id, desc, active, pre, portal] of lines.filter((l) => l[0] === 'FP')) {
  await prisma.paymentMethod.upsert({ where: { legacyId: Number(id) }, update: { description: desc }, create: { legacyId: Number(id), description: desc, isActive: bool(active), preRegistered: bool(pre), showOnPortal: bool(portal) } });
}
for (const [, id, desc, active] of lines.filter((l) => l[0] === 'GF')) {
  await prisma.billingGroup.upsert({ where: { legacyId: Number(id) }, update: { description: desc }, create: { legacyId: Number(id), description: desc, isActive: bool(active) } });
}

const methods = new Map((await prisma.paymentMethod.findMany()).map((m) => [m.legacyId, m.id]));
const groups = new Map((await prisma.billingGroup.findMany()).map((g) => [g.legacyId, g.id]));
let contracts = 0, invoices = 0, products = 0, history = 0;
const invoiceIds = new Map();

for (const l of lines.filter((x) => x[0] === 'C')) {
  const [, id, number, modality, status, obs, pid, name, doc, ptype, seller, gid, , day, dueType, fid, , start, end, idx, allow, penalty, gross, net] = l;
  const person = await prisma.person.findFirst({ where: { OR: [{ legacyId: Number(pid) }, { document: doc }] }, select: { id: true } });
  const data = {
    number, modality: Number(modality), status: Number(status), observation: obs || null, personId: person?.id ?? null, personName: name, personDocument: doc || null, personType: ptype || 'J', sellerName: seller || null,
    billingGroupId: groups.get(Number(gid)) ?? null, paymentMethodId: methods.get(Number(fid)) ?? null, billingDay: Number(day), dueType: dueType ? Number(dueType) : null,
    startDate: new Date(`${start}T12:00:00`), endDate: end ? new Date(`${end}T12:00:00`) : null, adjustIndex: idx ? Number(idx) : null, allowAdjust: bool(allow), penaltyPercent: Number(penalty || 0), totalGross: Number(gross || 0), totalNet: Number(net || 0), createdBy: 'Importado do eugestor',
  };
  const c = await prisma.contract.upsert({ where: { legacyId: Number(id) }, update: data, create: { legacyId: Number(id), ...data } });
  contracts++;
  await prisma.contractHistory.deleteMany({ where: { contractId: c.id } });
  for (const f of lines.filter((x) => x[0] === 'F' && x[1] === id)) {
    const [, , fid2, fdesc, ftype, fval, fqty, canceled, taxPending, title, street, num, district, cep, city, uf, comp] = f;
    const inv = await prisma.contractInvoice.upsert({
      where: { legacyId: Number(fid2) },
      update: { description: fdesc, netValue: Number(fval), serviceCount: Number(fqty), canceled: bool(canceled), taxPending: bool(taxPending), address: { title, street, number: num, district, zip: cep, city, state: uf, complement: comp } },
      create: { legacyId: Number(fid2), contractId: c.id, description: fdesc, type: Number(ftype), netValue: Number(fval), serviceCount: Number(fqty), canceled: bool(canceled), taxPending: bool(taxPending), address: { title, street, number: num, district, zip: cep, city, state: uf, complement: comp } },
    });
    invoiceIds.set(fid2, inv.id);
    invoices++;
    await prisma.contractProduct.deleteMany({ where: { invoiceId: inv.id } });
    for (const p of lines.filter((x) => x[0] === 'P' && x[1] === fid2)) {
      const [, , pid2, pdesc, ident, unit, sale, rent, grat, war] = p;
      await prisma.contractProduct.create({ data: { invoiceId: inv.id, productLegacyId: Number(pid2), description: pdesc, identifier: ident || null, unitMeasure: Number(unit), balanceSale: Number(sale), balanceRental: Number(rent), balanceGratuity: Number(grat), balanceWarranty: Number(war) } });
      products++;
    }
  }
  for (const h of lines.filter((x) => x[0] === 'H' && x[1] === id)) {
    const [, , at, text, isLog, user] = h;
    await prisma.contractHistory.create({ data: { contractId: c.id, at: new Date(at), description: text, isLog: bool(isLog), userName: user } });
    history++;
  }
}
console.log({ contracts, invoices, products, history });
await prisma.$disconnect();
