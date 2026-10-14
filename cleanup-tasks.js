// Exclui TODAS as tarefas (e comentários/checklists/adiamentos em cascata).
// Uso (dentro do container da API): node cleanup-tasks.js --confirm
const { PrismaClient } = require('./node_modules/.prisma/client');
const prisma = new PrismaClient();

async function main() {
  const total = await prisma.task.count();
  console.log(`Tarefas encontradas: ${total}`);
  if (!process.argv.includes('--confirm')) {
    console.log('Nada foi excluído. Rode novamente com --confirm para apagar.');
    return;
  }
  const res = await prisma.task.deleteMany({});
  console.log(`Tarefas excluídas: ${res.count}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
