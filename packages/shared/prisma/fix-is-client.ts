/**
 * Migração pontual: seta is_client=true em todos os leads que têm ao menos
 * um ClienteContabil (independente de archived), garantindo que já apareçam
 * na aba Clientes do inbox ao entrar em contato via WhatsApp.
 *
 * Executar uma única vez:
 *   cd packages/shared
 *   npx ts-node prisma/fix-is-client.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Busca todos os lead_ids distintos em clientes_contabil
  const rows = await prisma.clienteContabil.findMany({
    where: { archived: false },
    select: { lead_id: true },
    distinct: ['lead_id'],
  });

  const leadIds = rows.map((r) => r.lead_id);
  console.log(`Encontrados ${leadIds.length} leads com ClienteContabil ativo.`);

  if (leadIds.length === 0) {
    console.log('Nenhum lead para atualizar.');
    return;
  }

  // Atualiza apenas os que ainda não têm is_client=true
  const result = await prisma.lead.updateMany({
    where: {
      id: { in: leadIds },
      is_client: false,
    },
    data: {
      is_client: true,
      became_client_at: new Date(),
    },
  });

  console.log(`✅ ${result.count} lead(s) atualizado(s) com is_client=true.`);
}

main()
  .catch((e) => {
    console.error('❌ Erro ao executar migração:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
