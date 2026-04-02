import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import axios from 'axios';

/**
 * Worker cron para alertas de tarefas:
 * 1. A cada 10 min: verifica tarefas vencendo nos próximos 30 min → WhatsApp + Socket
 * 2. 8h e 14h Seg-Sex: verifica tarefas vencidas → WhatsApp de alerta
 */
@Injectable()
export class TaskAlertsCronService {
  private readonly logger = new Logger(TaskAlertsCronService.name);

  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  // ─── A cada 10 min: tarefas prestes a vencer (próximos 30 min) ────────

  @Cron('*/10 * * * *', { timeZone: 'America/Maceio' })
  async checkDueSoon() {
    try {
      const now = new Date();
      const thirtyMinFromNow = new Date(now.getTime() + 30 * 60 * 1000);

      const dueSoon = await this.prisma.task.findMany({
        where: {
          status: { in: ['A_FAZER', 'EM_PROGRESSO'] },
          due_at: { gte: now, lte: thirtyMinFromNow },
        },
        include: {
          assigned_user: { select: { id: true, name: true, phone: true } },
          lead: { select: { name: true } },
          legal_case: { select: { case_number: true } },
        },
      });

      if (dueSoon.length === 0) return;

      this.logger.log(`[TASK-ALERTS] ${dueSoon.length} tarefa(s) vencendo nos próximos 30 min`);

      for (const task of dueSoon) {
        if (!task.assigned_user?.phone) continue;

        // Anti-spam: verificar se já notificou nas últimas 2h
        const alreadySent = await this.wasAlertSentRecently(task.id, 'TASK_DUE_SOON', 2);
        if (alreadySent) continue;

        const dueTime = task.due_at!.toLocaleTimeString('pt-BR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' });
        const firstName = task.assigned_user.name.split(' ')[0];

        const msg =
          `⏰ *Tarefa vencendo em breve!*\n\n` +
          `Olá, ${firstName}!\n\n` +
          `📋 *${task.title}*\n` +
          `⏰ Vence às *${dueTime}*\n` +
          (task.lead?.name ? `👤 Cliente: ${task.lead.name}\n` : '') +
          (task.legal_case?.case_number ? `📁 Processo: ${task.legal_case.case_number}\n` : '') +
          `\nAcesse o sistema para atualizar o status.\n\n` +
          `_Alerta automático do CRM Jurídico_`;

        await this.sendWhatsApp(task.assigned_user.phone, msg);
        await this.logAlert(task.id, 'TASK_DUE_SOON', task.assigned_user.id);
        this.logger.log(`[TASK-ALERTS] Lembrete enviado para ${task.assigned_user.name} — tarefa: ${task.title}`);
      }
    } catch (e: any) {
      this.logger.error(`[TASK-ALERTS] Erro no check due soon: ${e.message}`);
    }
  }

  // ─── 8h e 14h Seg-Sex: tarefas vencidas ─────────────────────────────

  @Cron('0 8,14 * * 1-6', { timeZone: 'America/Maceio' })
  async checkOverdue() {
    try {
      const now = new Date();

      const overdue = await this.prisma.task.findMany({
        where: {
          status: { in: ['A_FAZER', 'EM_PROGRESSO'] },
          due_at: { lt: now },
        },
        include: {
          assigned_user: { select: { id: true, name: true, phone: true } },
          lead: { select: { name: true } },
          legal_case: { select: { case_number: true } },
        },
        orderBy: { due_at: 'asc' },
        take: 50,
      });

      if (overdue.length === 0) return;

      this.logger.log(`[TASK-ALERTS] ${overdue.length} tarefa(s) vencida(s)`);

      // Agrupar por usuário responsável
      const byUser = new Map<string, { user: any; tasks: typeof overdue }>();
      for (const task of overdue) {
        const userId = task.assigned_user?.id;
        if (!userId || !task.assigned_user?.phone) continue;
        if (!byUser.has(userId)) byUser.set(userId, { user: task.assigned_user, tasks: [] });
        byUser.get(userId)!.tasks.push(task);
      }

      for (const [userId, group] of byUser.entries()) {
        // Anti-spam: máximo 1 alerta overdue por usuário a cada 6h
        const alreadySent = await this.wasAlertSentRecently(userId, 'TASK_OVERDUE_BATCH', 6);
        if (alreadySent) continue;

        const { user, tasks } = group;
        const firstName = user.name.split(' ')[0];
        const count = tasks.length;

        const taskList = tasks.slice(0, 5).map((t, i) => {
          const hoursAgo = Math.round((now.getTime() - new Date(t.due_at!).getTime()) / 3600000);
          return `${i + 1}. *${t.title}* (${hoursAgo > 24 ? `${Math.round(hoursAgo / 24)}d` : `${hoursAgo}h`} atraso)`;
        }).join('\n');

        const msg =
          `🚨 *${count} Tarefa(s) Vencida(s)!*\n\n` +
          `Olá, ${firstName}!\n\n` +
          `Você tem tarefas pendentes que já passaram do prazo:\n\n` +
          `${taskList}` +
          (count > 5 ? `\n... e mais ${count - 5} tarefa(s)` : '') +
          `\n\nAcesse o sistema para atualizar.\n\n` +
          `_Alerta automático do CRM Jurídico_`;

        await this.sendWhatsApp(user.phone, msg);
        await this.logAlert(userId, 'TASK_OVERDUE_BATCH', userId);
        this.logger.log(`[TASK-ALERTS] Alerta overdue enviado para ${user.name} (${count} tarefas)`);
      }
    } catch (e: any) {
      this.logger.error(`[TASK-ALERTS] Erro no check overdue: ${e.message}`);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private async sendWhatsApp(phone: string, text: string): Promise<void> {
    try {
      const { apiUrl, apiKey } = await this.settings.getEvolutionConfig();
      if (!apiUrl) return;
      const instance = process.env.EVOLUTION_INSTANCE_NAME || 'whatsapp';
      const cleanPhone = phone.replace(/\D/g, '');
      await axios.post(
        `${apiUrl}/message/sendText/${instance}`,
        { number: cleanPhone, text },
        { headers: { apikey: apiKey }, timeout: 15000 },
      );
    } catch (e: any) {
      this.logger.warn(`[TASK-ALERTS] Falha WhatsApp para ${phone}: ${e.message}`);
    }
  }

  private async wasAlertSentRecently(referenceId: string, type: string, hoursAgo: number): Promise<boolean> {
    const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    const existing = await this.prisma.auditLog.findFirst({
      where: { entity: 'TASK_ALERT', entity_id: referenceId, action: type, created_at: { gte: cutoff } },
    });
    return !!existing;
  }

  private async logAlert(referenceId: string, type: string, userId: string): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: { entity: 'TASK_ALERT', entity_id: referenceId, action: type, meta_json: { user_id: userId, sent_at: new Date().toISOString() } },
      });
    } catch {}
  }
}
