// Importa endereço e contatos das pessoas a partir do relatório do eugestor (prisma/data/pessoas-relatorio.txt, fora do git).
// Uso: node prisma/import-pessoas-relatorio.mjs
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';

const prisma = new PrismaClient();
const digits = (s) => (s ?? '').replace(/\D/g, '');
const lines = fs.readFileSync(new URL('./data/pessoas-relatorio.txt', import.meta.url), 'utf8').split('\n').filter(Boolean);
const people = await prisma.person.findMany({ select: { id: true, name: true, document: true, type: true, rg: true, stateRegistration: true, municipalRegistration: true, phone: true } });
const used = new Set();
let updated = 0;
const unmatched = [];

function parseContacts(raw) {
  if (!raw) return [];
  return raw.split('~').map((seg) => {
    const [c0 = '', c1 = '', c2 = '', c3 = ''] = seg.split(';');
    const all = [c0, c1, c2, c3];
    const phone = all.join(' ').match(/\(\d{2}\)\s?[\d.-]+/)?.[0] ?? '';
    const email = all.find((t) => t.includes('@')) ?? '';
    const type = [c1, c2, c3].find((t) => t && !t.includes('@') && !/\(\d{2}\)/.test(t)) ?? '';
    const name = c0.replace(phone, '').trim();
    return { name, phone, email, type };
  }).filter((c) => c.name || c.phone || c.email);
}

for (const line of lines) {
  const [name, doc, rg, tel, im, addr, contacts] = line.split('|');
  const key = name.trim().toLowerCase();
  const candidates = people.filter((p) => p.name.replace(/&amp;/g, '&').trim().toLowerCase() === key && !used.has(p.id));
  const match = candidates.find((p) => doc && digits(p.document) === digits(doc)) ?? (doc ? null : candidates[0]) ?? candidates.find((p) => !digits(p.document));
  if (!match) { unmatched.push(name); continue; }
  used.add(match.id);
  const data = { address: addr || null, contacts: parseContacts(contacts) };
  if (tel) data.phone = tel;
  if (im) data.municipalRegistration = im;
  if (rg) { if (match.type === 'F') data.rg = rg; else data.stateRegistration = rg; }
  await prisma.person.update({ where: { id: match.id }, data });
  updated++;
}
console.log(`atualizadas: ${updated} de ${lines.length}; sem correspondência: ${unmatched.length}`, unmatched.slice(0, 10));
await prisma.$disconnect();
