import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ALL_PERMISSIONS = ['inicio', 'controle_acesso'];

async function main() {
  for (const item of [
    { key: 'inicio', label: 'Início', href: '/home', section: 'main' },
    { key: 'administrativo', label: 'Administrativo', href: null, section: 'group' },
    { key: 'controle_acesso', label: 'Usuários e Permissões', href: '/access-control', section: 'admin' },
    { key: 'log_acesso', label: 'Log de acesso', href: '/access-logs', section: 'admin', sortOrder: 1 },
    { key: 'dados_empresa', label: 'Dados da empresa', href: '/company', section: 'admin', sortOrder: 2 },
  ]) await prisma.sidebarItem.upsert({ where: { key: item.key }, update: {}, create: item });

  const passwordHash = await bcrypt.hash('123456', 10);

  await prisma.user.upsert({
    where: { email: 'thallysmouraof@gmail.com' },
    update: { role: 'ADMIN', status: 'ACTIVE', permissions: ALL_PERMISSIONS },
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
