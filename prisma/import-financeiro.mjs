// Importa o financeiro do eugestor (prisma/data/contas-*.txt, categorias.txt — fora do git). Uso: node prisma/import-financeiro.mjs
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';

const prisma = new PrismaClient();
const read = (f) => fs.readFileSync(new URL(`./data/${f}`, import.meta.url), 'utf8').split('\n').filter(Boolean);
const money = (s) => Number(s.replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
const date = (s) => { const [d, m, y] = s.split('/').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };

// Contas de caixa (saldos de 28/10/2026) e movimentos do Banco Inter.
const cash = [['Caixa', 'Conta Comum', 300], ['Banco Inter', 'Conta Corrente', 12168.89], ['Banco Itaú', 'Conta Corrente', -2930.51], ['Banco Santander', 'Conta Corrente', 7140.87], ['Banco Itaú - Aplicação', 'Conta Corrente', 12292.81], ['Infinite Pay', 'Conta Corrente', 0]];
const movements = [
  ['22/10/2026', 'Luan Vieira', '#000471/1 Empréstimo - Empréstimo realizado no dia 09/09 para completar caixa', -3138.10],
  ['21/10/2026', 'TRISEVEN SERVICOS DE TERCEIRIZACAO LTDA (TRISEVEN SERVICOS E QUALIDADE DE VIDA)', "#000270/1 Faturamento do Contrato '000007/2026' - mês 09/2026", 2044.20],
  ['15/10/2026', 'T S Industria de Etiquetas e Comercio de Equipamentos de Informatica LTDA (T S Suprimentos Industriais)', '#000043/3 Adiantamento da ordem de serviço #32', 9805.00],
  ['14/10/2026', 'Mariner Nautica LTDA', "#000269/1 Faturamento do Contrato '000006/2026' - mês 09/2026", 80.00],
  ['14/10/2026', 'Condominio Acqua Avenida Das Torres', '#000274/1 Duplicata referente a Fatura Nº: 104', 800.00],
  ['14/10/2026', 'Condominio Equilibrium', "#000265/1 Faturamento do Contrato '000002/2026' - mês 09/2026", 80.00],
  ['13/10/2026', 'Condominio Residencial Villa Verde i', "#000267/1 Faturamento do Contrato '000004/2026' - mês 09/2026", 80.00],
  ['08/10/2026', 'Condomínio Residencial Vincitore', "#000266/1 Faturamento do Contrato '000003/2026' - mês 09/2026", 340.48],
  ['08/10/2026', 'Itaú Unibanco Holding S.A.', '#000024/4 PRONAMP', -969.29],
  ['07/10/2026', 'Condominio Acqua Avenida Das Torres', "#000264/1 Faturamento do Contrato '000001/2026' - mês 09/2026", 1361.92],
  ['06/10/2026', 'Transferência de caixa', 'Transf. Banco Inter para Banco Itaú', -200.00],
];
if ((await prisma.cashAccount.count()) === 0) {
  const sum = movements.reduce((s, m) => s + m[3], 0);
  for (const [name, type, balance] of cash) {
    const c = await prisma.cashAccount.create({ data: { name, type, opening: name === 'Banco Inter' ? Math.round((balance - sum) * 100) / 100 : balance } });
    if (name === 'Banco Inter') await prisma.cashMovement.createMany({ data: movements.map(([d, p, desc, v]) => ({ cashAccountId: c.id, date: date(d), personName: p, description: desc, value: v })) });
  }
}

if ((await prisma.finCategory.count()) === 0) {
  let kind = 'D', order = 0;
  for (const kindRoot of ['D', 'R']) await prisma.finCategory.create({ data: { kind: kindRoot, name: kindRoot === 'D' ? 'Despesas' : 'Receitas', level: 1, sortOrder: 0 } });
  const roots = Object.fromEntries((await prisma.finCategory.findMany({ where: { level: 1 } })).map((c) => [c.kind, c.id]));
  const stack = {};
  for (const line of read('categorias.txt')) {
    if (line === '#RECEITAS') { kind = 'R'; for (const k of Object.keys(stack)) delete stack[k]; continue; }
    const [lv, name] = line.split('|'); const level = Number(lv);
    const parentId = level === 2 ? roots[kind] : stack[level - 1];
    const c = await prisma.finCategory.create({ data: { kind, name, level, parentId, sortOrder: order++ } });
    stack[level] = c.id;
  }
}

if ((await prisma.finAccount.count()) === 0) {
  for (const [kind, file] of [['P', 'contas-pagar.txt'], ['R', 'contas-receber.txt']]) {
    for (const line of read(file)) {
      const f = line.split('|');
      const due = date(f[0]);
      let name = f[1].trim(); const sub = f[2].trim();
      const paidFlag = /Pago|Recebido/.test(f[f.length - 1]);
      const vals = f.slice(3, f.length - 1).map(money);
      const invoice = name.match(/\s*Fatura:\s*(\d+)\s*$/); name = name.replace(/\s*Fatura:\s*\d+\s*$/, '');
      name = name.replace(/Parcialmente$/, '');
      const inst = name.match(/\s(\d+\/\d+)$/); name = name.replace(/\s\d+\/\d+$/, '').trim();
      const m = sub.match(/^(\d{6})\s*-\s*(.*)$/);
      await prisma.finAccount.create({ data: {
        kind, number: m ? m[1] : null, dueDate: due, personName: name, installment: inst ? inst[1] : null, description: m ? m[2] : sub, value: vals[0], paidValue: paidFlag ? (vals[1] ?? vals[0]) : null,
        status: paidFlag ? 'LIQUIDADA' : 'ABERTA', settledAt: paidFlag ? due : null, invoiceNumber: invoice ? Number(invoice[1]) : null,
      } });
    }
  }
}
if ((await prisma.resultCenter.count()) === 0) await prisma.resultCenter.create({ data: { name: 'PROJETO BRIE TO ME' } });
console.log({ contas: await prisma.finAccount.count(), categorias: await prisma.finCategory.count(), caixa: await prisma.cashAccount.count(), mov: await prisma.cashMovement.count() });
await prisma.$disconnect();
