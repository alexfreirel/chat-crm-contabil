import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TaskRecurringService {
  private readonly logger = new Logger(TaskRecurringService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Todo dia 1 às 2h: gera instâncias mensais das tarefas com recorrência infinita.
   * Tarefas-pai: recorrente=true, recorrencia_meses=null, recorrencia_pai_id=null.
   */
  @Cron('0 2 1 * *', { timeZone: 'America/Sao_Paulo' })
  async generateRecurringTasks() {
    try {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      const parents = await this.prisma.task.findMany({
        where: {
          recorrente: true,
          recorrencia_meses: null,
          recorrencia_pai_id: null,
          status: { notIn: ['CANCELADA'] },
        },
      });

      if (parents.length === 0) return;

      this.logger.log(`[TASK-RECORRENTE] Verificando ${parents.length} tarefa(s) recorrente(s)`);

      let geradas = 0;

      for (const parent of parents) {
        const startOfMonth = new Date(currentYear, currentMonth, 1);
        const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);

        // Verifica se já foi gerada neste mês
        const existing = await this.prisma.task.findFirst({
          where: {
            recorrencia_pai_id: parent.id,
            due_at: { gte: startOfMonth, lte: endOfMonth },
          },
        });

        if (existing) continue;

        // Calcula due_at para este mês usando o dia original
        const dia = parent.recorrencia_dia || 1;
        const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
        const dueAt = new Date(currentYear, currentMonth, Math.min(dia, lastDay));

        await this.prisma.task.create({
          data: {
            title: parent.title,
            description: parent.description,
            lead_id: parent.lead_id,
            conversation_id: parent.conversation_id,
            cliente_contabil_id: parent.cliente_contabil_id,
            assigned_user_id: parent.assigned_user_id,
            due_at: dueAt,
            tenant_id: parent.tenant_id,
            status: 'A_FAZER',
            setor: parent.setor,
            recorrente: false,
            recorrencia_pai_id: parent.id,
            recorrencia_dia: parent.recorrencia_dia,
          },
        });

        geradas++;
        this.logger.log(`[TASK-RECORRENTE] Gerada: "${parent.title}" | venc. ${dueAt.toLocaleDateString('pt-BR')}`);
      }

      if (geradas > 0) {
        this.logger.log(`[TASK-RECORRENTE] ${geradas} tarefa(s) gerada(s) para ${currentMonth + 1}/${currentYear}`);
      }
    } catch (e: any) {
      this.logger.error(`[TASK-RECORRENTE] Erro: ${e.message}`);
    }
  }
}
