import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ALL_PERMISSIONS = ['inicio', 'controle_acesso'];

async function main() {
  for (const item of [
    { key: 'inicio', label: 'Início', href: '/home', section: 'main' },
    { key: 'administrativo', label: 'Governança', href: null, section: 'group' },
    { key: 'controle_acesso', label: 'Equipe e Permissões', href: '/access-control', section: 'admin' },
    { key: 'log_acesso', label: 'Log de acesso', href: '/access-logs', section: 'admin', sortOrder: 1 },
    { key: 'dados_empresa', label: 'Dados da empresa', href: '/company', section: 'admin', sortOrder: 2 },
  ]) await prisma.sidebarItem.upsert({ where: { key: item.key }, update: {}, create: item });

  // Dados reais de "Locais de Estoque" puxados da conta Teclive no eugestor.app
  for (const item of [
    { legacyId: 3, description: 'Central', isActive: true, isPrincipal: true },
    { legacyId: 11, description: 'Armário de Clientes', isActive: true, isPrincipal: false },
    { legacyId: 10, description: 'Rua 01 Estante 02', isActive: true, isPrincipal: false },
    { legacyId: 9, description: 'Rua 01 Estante 01', isActive: true, isPrincipal: false },
    { legacyId: 2, description: 'Retorno de Locação/Comodato', isActive: true, isPrincipal: false },
    { legacyId: 1, description: 'Geral', isActive: true, isPrincipal: false },
  ])
    await prisma.stockLocation.upsert({
      where: { legacyId: item.legacyId },
      update: item,
      create: item,
    });

  const passwordHash = await bcrypt.hash('123456', 10);

  await prisma.user.upsert({
    where: { email: 'thallysmouraof@gmail.com' },
    // Não sobrescreve "permissions" num update: o admin pode ter ganhado acesso a
    // itens de sidebar criados depois (ex.: Estoque) e o seed não deve revogá-los.
    update: { role: 'ADMIN', status: 'ACTIVE' },
    create: {
      email: 'thallysmouraof@gmail.com',
      passwordHash,
      name: 'Thallys Moura',
      role: 'ADMIN',
      status: 'ACTIVE',
      permissions: ALL_PERMISSIONS,
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
