import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from '../gateway/chat.gateway';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private chatGateway: ChatGateway,
  ) {}

  async findAll() {
    return this.prisma.task.findMany({
      include: {
        lead: true,
        assigned_user: true,
        _count: { select: { comments: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async create(data: {
    title: string;
    description?: string;
    lead_id?: string;
    conversation_id?: string;
    legal_case_id?: string;
    assigned_user_id?: string;
    due_at?: Date;
    tenant_id?: string;
  }) {
    return this.prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        lead_id: data.lead_id,
        conversation_id: data.conversation_id,
        legal_case_id: data.legal_case_id,
        assigned_user_id: data.assigned_user_id,
        due_at: data.due_at ? new Date(data.due_at) : null,
        tenant_id: data.tenant_id,
        status: 'A_FAZER',
      },
    });
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.task.update({
      where: { id },
      data: { status },
    });
  }

  async update(id: string, data: {
    title?: string;
    description?: string;
    status?: string;
    due_at?: Date | null;
    assigned_user_id?: string | null;
  }) {
    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.due_at !== undefined) updateData.due_at = data.due_at ? new Date(data.due_at) : null;
    if (data.assigned_user_id !== undefined) updateData.assigned_user_id = data.assigned_user_id;

    return this.prisma.task.update({
      where: { id },
      data: updateData,
    });
  }

  // ─── Legal Case Tasks ──────────────────────────────────────────

  async findByLegalCase(legalCaseId: string) {
    return this.prisma.task.findMany({
      where: { legal_case_id: legalCaseId },
      include: {
        assigned_user: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  // ─── Task Comments ─────────────────────────────────────────────

  async addComment(taskId: string, userId: string, text: string) {
    const comment = await this.prisma.taskComment.create({
      data: { task_id: taskId, user_id: userId, text },
      include: { user: { select: { id: true, name: true } } },
    });

    // Notificar o atribuído da tarefa (se for diferente de quem comentou)
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { assigned_user_id: true },
    });
    if (task?.assigned_user_id && task.assigned_user_id !== userId) {
      try {
        this.chatGateway.emitTaskComment(task.assigned_user_id, {
          taskId,
          text,
          fromUserName: comment.user.name,
        });
      } catch {}
    }

    return comment;
  }

  async findComments(taskId: string) {
    return this.prisma.taskComment.findMany({
      where: { task_id: taskId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { created_at: 'asc' },
    });
  }
}
