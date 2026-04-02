import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando o Seed do Banco de Dados...');

  const tenant = await prisma.tenant.upsert({
    where: { id: '00000000-0000-0000-0000-000000000000' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000000',
      name: 'Escritório Padrão',
    },
  });

  const passwordHash = await argon2.hash('Lustosa080686');

  const admin = await prisma.user.upsert({
    where: { email: 'lustosa.lima@outlook.com' },
    update: { password_hash: passwordHash, role: 'ADMIN' },
    create: {
      email: 'lustosa.lima@outlook.com',
      name: 'Admin Master',
      role: 'ADMIN',
      password_hash: passwordHash,
      tenant_id: tenant.id
    },
  });

  console.log('Seed completo ✅');
  console.log('Usuário: lustosa.lima@outlook.com | Senha: Lustosa080686');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
