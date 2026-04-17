import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from '../gateway/chat.gateway';
import { Prisma, Lead } from '@crm/shared';
import { AutomationsService } from '../automations/automations.service';
import { FollowupService } from '../followup/followup.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { effectiveRole, normalizeRoles } from '../common/utils/permissions.util';
import OpenAI from 'openai';

/**
 * Remove o nono dígito de celulares brasileiros.
 * 13 dígitos (55+DD+9+8dig) → 12 dígitos (55+DD+8dig)
 * Ex: 5582999130127 → 558299130127
 */
function to12Digits(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55') && d[4] === '9') {
    return d.slice(0, 4) + d.slice(5);
  }
  return d;
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private prisma: PrismaService,
    private chatGateway: ChatGateway,
    private automationsService: AutomationsService,
    private moduleRef: ModuleRef,
    private googleDriveService: GoogleDriveService,
  ) {}

  async create(data: Prisma.LeadCreateInput): Promise<Lead> {
    if (data.phone) data = { ...data, phone: to12Digits(data.phone) };
    const lead = await this.prisma.lead.create({ data });
    this.automationsService.onNewLead(lead.id, lead.tenant_id ?? undefined).catch(err =>
      this.logger.warn(`onNewLead automation error for lead ${lead.id}: ${err}`),
    );
    return lead;
  }

  async findAll(tenant_id?: string, inbox_id?: string, page?: number, limit?: number, search?: string, stage?: string, userId?: string) {
    const baseWhere: any = tenant_id
      ? { OR: [{ tenant_id }, { tenant_id: null }] }
      : {};

    if (stage) {
      baseWhere.stage = stage;
    } else {
      baseWhere.stage = { not: 'PERDIDO' };
    }

    if (search && search.trim()) {
      const s = search.trim();
      baseWhere.AND = [
        {
          OR: [
            { name: { contains: s, mode: 'insensitive' } },
            { phone: { contains: s } },
            { email: { contains: s, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const where = inbox_id
      ? { ...baseWhere, conversations: { some: { inbox_id } } }
      : baseWhere;

    // ─── Controle de acesso por role (mesmo padrão de conversations) ────
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, inboxes: { select: { id: true } } },
      });

      const userRoles = normalizeRoles(user?.role as any);
      const isAdminUser = userRoles.includes('ADMIN');
      const isAdvogadoUser = userRoles.includes('ADVOGADO') || userRoles.includes('ESPECIALISTA');
      const isOperadorUser = userRoles.includes('OPERADOR') || userRoles.includes('COMERCIAL');
      const userInboxIds = (user?.inboxes ?? []).map((i: any) => i.id);

      if (!isAdminUser) {
        // CRM Pipeline: operador/advogado vê apenas leads explicitamente atribuídos.
        // Diferente do chat inbox (que mostra fila da inbox), aqui só mostra leads
        // onde o usuário é assigned_user, assigned_lawyer, cs_user ou lawyer do caso.
        const orConditions: any[] = [];

        if (isAdvogadoUser) {
          orConditions.push({ conversations: { some: { assigned_accountant_id: userId } } });
        }

        if (isOperadorUser || isAdvogadoUser) {
          orConditions.push({ conversations: { some: { assigned_user_id: userId } } });
          orConditions.push({ cs_user_id: userId });
        }

        // Fallback: se nenhuma condição (ex: assistente), ver só os atribuídos
        if (orConditions.length === 0) {
          orConditions.push({ conversations: { some: { assigned_user_id: userId } } });
        }

        // Combina com AND para manter os filtros de tenant/stage/search
        if (!where.AND) where.AND = [];
        if (!Array.isArray(where.AND)) where.AND = [where.AND];
        where.AND.push({ OR: orConditions });
      }
    }

    const includeOpts = {
      _count: { select: { conversations: true } },
      conversations: {
        where: inbox_id ? { inbox_id } : undefined,
        orderBy: { last_message_at: 'desc' as const },
        take: 1,
        include: {
          messages: { orderBy: { created_at: 'desc' as const }, take: 1 },
          assigned_user: { select: { id: true, name: true } },
          assigned_accountant: { select: { id: true, name: true } },
        },
      },
      calendar_events: {
        where: { start_at: { gte: new Date() } },
        orderBy: { start_at: 'asc' as const },
        take: 3,
        select: { id: true, type: true, title: true, start_at: true },
      },
    };

    if (page && limit) {
      const [data, total] = await this.prisma.$transaction([
        this.prisma.lead.findMany({
          where,
          include: includeOpts,
          orderBy: { created_at: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.lead.count({ where }),
      ]);
      return { data, total, page, limit };
    }

    return this.prisma.lead.findMany({
      where,
      include: includeOpts,
      orderBy: { created_at: 'desc' },
    }) as any;
  }

  async findOne(id: string, tenantId?: string): Promise<Lead | null> {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        memory: true,
        conversations: {
          orderBy: { last_message_at: 'desc' },
          include: {
            assigned_user: { select: { id: true, name: true } },
            assigned_accountant: { select: { id: true, name: true } },
            messages: { orderBy: { created_at: 'desc' }, take: 1 },
          },
        },
        tasks: { orderBy: { created_at: 'desc' }, take: 10 },
        clientes_contabil: {
          where: { archived: false },
          orderBy: { created_at: 'desc' },
          include: {
            accountant: { select: { id: true, name: true } },
          },
        },
        ficha_contabil: true,
        _count: { select: { conversations: true } },
      },
    }) as any;
    if (lead && tenantId && lead.tenant_id && lead.tenant_id !== tenantId) {
      throw new ForbiddenException('Acesso negado a este recurso');
    }
    return lead;
  }

  async upsert(data: Prisma.LeadCreateInput): Promise<Lead> {
    const phone = to12Digits(data.phone);
    const { phone: _phone, name: incomingName, stage: _stage, profile_picture_url: incomingPhoto, ...updateData } = data as any;

    this.logger.debug(`Upsert lead: raw=${data.phone} → stored=${phone}`);

    if (incomingName) {
      await this.prisma.lead.updateMany({
        where: { phone, name: null },
        data: { name: incomingName },
      });
    }

    if (incomingPhoto) {
      updateData.profile_picture_url = incomingPhoto;
    }

    return this.prisma.lead.upsert({
      where: { phone },
      update: updateData,
      create: { ...data, phone },
    });
  }

  async findByPhone(phone: string): Promise<Lead | null> {
    const normalized = to12Digits(phone);
    return this.prisma.lead.findFirst({
      where: { OR: [{ phone: normalized }, { phone }] },
    });
  }

  async checkPhone(phone: string): Promise<{ exists: boolean; lead?: Lead }> {
    const found = await this.findByPhone(phone);
    if (!found) return { exists: false };
    return { exists: true, lead: found };
  }

  async update(id: string, data: { name?: string; email?: string; cpf_cnpj?: string; tags?: string[] }, tenantId?: string): Promise<Lead> {
    if (tenantId) {
      const existing = await this.prisma.lead.findUnique({ where: { id }, select: { tenant_id: true } });
      if (existing?.tenant_id && existing.tenant_id !== tenantId) {
        throw new ForbiddenException('Acesso negado a este recurso');
      }
    }
    return this.prisma.lead.update({ where: { id }, data });
  }

  async updateStatus(id: string, stage: string, tenantId?: string, lossReason?: string, actorId?: string): Promise<Lead> {
    if (tenantId) {
      const existing = await this.prisma.lead.findUnique({ where: { id }, select: { tenant_id: true } });
      if (existing?.tenant_id && existing.tenant_id !== tenantId) {
        throw new ForbiddenException('Acesso negado a este recurso');
      }
    }

    if (stage === 'PERDIDO' && !lossReason) {
      throw new ForbiddenException('Motivo de perda é obrigatório ao marcar como PERDIDO');
    }

    if (stage === 'FINALIZADO') {
      const conv = await this.prisma.conversation.findFirst({
        where: { lead_id: id },
        orderBy: { last_message_at: 'desc' },
        select: { service_type: true, assigned_accountant_id: true },
      });
      if (!conv?.service_type) {
        throw new ForbiddenException('Lead precisa ter tipo de serviço definido para ser finalizado');
      }
    }

    const current = await this.prisma.lead.findUnique({ where: { id }, select: { stage: true } });

    let csUserId: string | undefined;
    if (stage === 'FINALIZADO') {
      const lastConv = await this.prisma.conversation.findFirst({
        where: { lead_id: id },
        orderBy: { last_message_at: 'desc' },
        select: { assigned_user_id: true },
      });
      csUserId = lastConv?.assigned_user_id ?? undefined;
    }

    const lead = await this.prisma.lead.update({
      where: { id },
      data: {
        stage,
        stage_entered_at: new Date(),
        ...(stage === 'PERDIDO' && lossReason ? { loss_reason: lossReason } : {}),
        ...(stage === 'FINALIZADO' ? {
          is_client: true,
          became_client_at: new Date(),
          ...(csUserId ? { cs_user_id: csUserId } : {}),
        } : {}),
      },
    });

    this.prisma.leadStageHistory.create({
      data: {
        lead_id: id,
        from_stage: current?.stage ?? null,
        to_stage: stage,
        actor_id: actorId ?? null,
        loss_reason: lossReason ?? null,
      },
    }).catch(err => this.logger.warn(`Failed to record stage history for lead ${id}: ${err}`));

    this.appendLeadStageToMemory(id, current?.stage ?? null, stage, lossReason ?? null).catch(err =>
      this.logger.warn(`[MEMORY] Falha ao registrar etapa CRM na memória do lead ${id}: ${err}`),
    );

    this.chatGateway.emitConversationsUpdate(tenantId ?? null);

    this.automationsService.onStageChange(id, stage, tenantId).catch(err =>
      this.logger.warn(`onStageChange automation error for lead ${id}: ${err}`),
    );

    try {
      const followupService = this.moduleRef.get(FollowupService, { strict: false });
      if (followupService) {
        followupService.autoEnrollByStage(id, stage).catch((err: Error) =>
          this.logger.warn(`[FOLLOWUP] Auto-enroll falhou: ${err.message}`),
        );
      }
    } catch {
      // FollowupModule pode não estar carregado em contextos de teste
    }

    // Auto-criação de ClienteContabil quando lead atinge FINALIZADO
    if (stage === 'FINALIZADO') {
      try {
        const conv = await this.prisma.conversation.findFirst({
          where: { lead_id: id, assigned_accountant_id: { not: null } },
          orderBy: { last_message_at: 'desc' },
          select: { id: true, assigned_accountant_id: true, tenant_id: true, service_type: true },
        });
        if (conv?.assigned_accountant_id) {
          await this.prisma.clienteContabil.create({
            data: {
              lead_id: id,
              conversation_id: conv.id,
              accountant_id: conv.assigned_accountant_id,
              service_type: conv.service_type ?? 'OUTRO',
              tenant_id: conv.tenant_id ?? undefined,
              stage: 'ONBOARDING',
            },
          });
          this.logger.log(`Auto-created ClienteContabil for lead ${id} → accountant ${conv.assigned_accountant_id}`);
        }
      } catch (err) {
        this.logger.warn(`Failed to auto-create ClienteContabil for lead ${id}: ${err}`);
      }
    }

    return lead;
  }

  async resetMemory(id: string, tenantId?: string): Promise<{ ok: boolean }> {
    if (tenantId) {
      const lead = await this.prisma.lead.findUnique({ where: { id }, select: { tenant_id: true } });
      if (lead?.tenant_id && lead.tenant_id !== tenantId) {
        throw new ForbiddenException('Acesso negado a este recurso');
      }
    }
    await this.prisma.aiMemory.deleteMany({ where: { lead_id: id } });
    return { ok: true };
  }

  async deleteContact(id: string): Promise<{ ok: boolean }> {
    const lead = await this.prisma.lead.findUnique({ where: { id }, select: { id: true } });
    if (!lead) throw new NotFoundException('Contato não encontrado');

    await this.prisma.$transaction(async (tx) => {
      const conversations = await tx.conversation.findMany({ where: { lead_id: id }, select: { id: true } });
      const convIds = conversations.map(c => c.id);

      const clientes = await tx.clienteContabil.findMany({ where: { lead_id: id }, select: { id: true } });
      const clienteIds = clientes.map(c => c.id);

      const messages = convIds.length > 0
        ? await tx.message.findMany({ where: { conversation_id: { in: convIds } }, select: { id: true } })
        : [];
      const msgIds = messages.map(m => m.id);

      const allTasks = await tx.task.findMany({
        where: {
          OR: [
            { lead_id: id },
            ...(clienteIds.length > 0 ? [{ cliente_contabil_id: { in: clienteIds } }] : []),
            ...(convIds.length > 0 ? [{ conversation_id: { in: convIds } }] : []),
          ],
        },
        select: { id: true },
      });
      const taskIds = allTasks.map(t => t.id);

      if (taskIds.length > 0) await tx.taskComment.deleteMany({ where: { task_id: { in: taskIds } } });
      if (clienteIds.length > 0) await tx.clienteEvento.deleteMany({ where: { cliente_id: { in: clienteIds } } });
      if (taskIds.length > 0) await tx.task.deleteMany({ where: { id: { in: taskIds } } });
      if (clienteIds.length > 0) await tx.clienteContabil.deleteMany({ where: { id: { in: clienteIds } } });
      if (msgIds.length > 0) {
        await tx.media.deleteMany({ where: { message_id: { in: msgIds } } });
        await tx.message.deleteMany({ where: { id: { in: msgIds } } });
      }
      if (convIds.length > 0) await tx.conversation.deleteMany({ where: { id: { in: convIds } } });
      await tx.aiMemory.deleteMany({ where: { lead_id: id } });
      await tx.lead.delete({ where: { id } });
    }, { timeout: 30000 });

    this.logger.log(`[deleteContact] Contato ${id} e todos os seus dados foram excluídos.`);
    return { ok: true };
  }

  async getTimeline(leadId: string, tenantId?: string): Promise<any[]> {
    if (tenantId) {
      const lead = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { tenant_id: true } });
      if (lead?.tenant_id && lead.tenant_id !== tenantId) {
        throw new ForbiddenException('Acesso negado a este recurso');
      }
    }

    const [stageHistory, notes, memory] = await Promise.all([
      this.prisma.leadStageHistory.findMany({
        where: { lead_id: leadId },
        orderBy: { created_at: 'desc' },
        take: 100,
        include: { actor: { select: { id: true, name: true } } },
      }),
      this.prisma.leadNote.findMany({
        where: { lead_id: leadId },
        orderBy: { created_at: 'desc' },
        take: 100,
        include: { user: { select: { id: true, name: true } } },
      }),
      this.prisma.aiMemory.findUnique({ where: { lead_id: leadId } }),
    ]);

    let facts: any = {};
    try {
      facts = memory?.facts_json
        ? (typeof memory.facts_json === 'string' ? JSON.parse(memory.facts_json as string) : memory.facts_json)
        : {};
    } catch { facts = {}; }

    const items: any[] = [
      ...stageHistory.map(h => ({
        type: 'stage_change', id: h.id,
        from_stage: h.from_stage, to_stage: h.to_stage,
        actor: (h as any).actor ?? null, loss_reason: h.loss_reason,
        created_at: h.created_at,
      })),
      ...notes.map(n => ({
        type: 'note', id: n.id, text: n.text,
        author: (n as any).user ?? null, created_at: n.created_at,
      })),
      // Etapas do cliente contábil (da AiMemory)
      ...(facts.crm_timeline || []).map((e: any, i: number) => ({
        type: 'service_stage', id: `service_${i}`,
        from_stage: e.from, to_stage: e.to,
        service_type: e.service_type,
        created_at: new Date((e.date || new Date().toISOString().slice(0, 10)) + 'T12:00:00Z'),
      })),
      // Eventos contábeis relevantes (da AiMemory)
      ...(facts.service_events || []).map((ev: any, i: number) => ({
        type: 'service_event', id: `ev_${i}`,
        title: ev.title, description: ev.description,
        created_at: new Date((ev.date || new Date().toISOString().slice(0, 10)) + 'T12:00:00Z'),
      })),
    ];

    return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  async summarizeLead(leadId: string, tenantId?: string): Promise<{ summary: string }> {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        conversations: {
          include: {
            messages: {
              where: { type: 'text' },
              orderBy: { created_at: 'desc' },
              take: 30,
              select: { text: true, direction: true, created_at: true },
            },
          },
          take: 1,
        },
        ficha_contabil: true,
      },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado');
    if (tenantId && lead.tenant_id && lead.tenant_id !== tenantId) {
      throw new ForbiddenException('Acesso negado');
    }

    const conv = lead.conversations?.[0];
    const messages = (conv?.messages ?? []).reverse();
    const messagesText = messages
      .filter((m) => m.text)
      .map((m) => `${m.direction === 'out' ? 'Atendente' : 'Cliente'}: ${m.text}`)
      .join('\n');

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new BadRequestException('API key OpenAI não configurada.');

    const ficha = (lead as any).ficha_contabil;
    const fichaInfo = ficha
      ? `CNPJ: ${ficha.cnpj || '-'} | Regime: ${ficha.regime_tributario || '-'} | Serviços: ${(ficha.servicos || []).join(', ') || '-'}`
      : 'Ficha contábil não preenchida';

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content: 'Você é um assistente de escritório contábil. Produza um briefing conciso (3-5 linhas) sobre o prospecto: quem é, qual serviço contábil precisa, o que já foi tratado e qual o próximo passo recomendado. Responda em português, sem tópicos, em texto corrido.',
        },
        {
          role: 'user',
          content: `Lead: ${lead.name || 'Sem nome'} | Etapa: ${lead.stage} | Serviço: ${(conv as any)?.service_type || 'não definido'}\n${fichaInfo}\n\nConversa:\n${messagesText || 'Sem mensagens registradas.'}`,
        },
      ],
    });

    return { summary: completion.choices[0]?.message?.content ?? 'Não foi possível gerar o resumo.' };
  }

  async exportCsv(tenantId?: string, search?: string): Promise<string> {
    const where: any = {};
    if (tenantId) where.tenant_id = tenantId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    const leads = await this.prisma.lead.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        conversations: {
          orderBy: { last_message_at: 'desc' },
          take: 1,
          select: {
            service_type: true,
            assigned_accountant: { select: { name: true } },
          },
        },
        ficha_contabil: { select: { regime_tributario: true, cnpj: true } },
      },
    });

    const escape = (v: string | null | undefined) => {
      if (!v) return '';
      const s = String(v).replace(/"/g, '""');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
    };

    const msPerDay = 86400000;
    const daysInStage = (d: Date | string) =>
      Math.floor((Date.now() - new Date(d).getTime()) / msPerDay);

    const header = ['Nome', 'Telefone', 'Email', 'Estágio', 'Tipo de Serviço', 'Regime', 'CNPJ', 'Especialista', 'Tags', 'Dias no Estágio', 'Criado em'];
    const rows = leads.map(l => {
      const conv = (l as any).conversations?.[0];
      const ficha = (l as any).ficha_contabil;
      return [
        escape(l.name),
        escape(l.phone),
        escape(l.email),
        escape(l.stage),
        escape(conv?.service_type),
        escape(ficha?.regime_tributario),
        escape(ficha?.cnpj),
        escape(conv?.assigned_accountant?.name),
        escape((l.tags || []).join('; ')),
        escape(String(daysInStage(l.stage_entered_at))),
        escape(new Date(l.created_at).toLocaleDateString('pt-BR')),
      ].join(',');
    });

    return [header.join(','), ...rows].join('\n');
  }

  private async appendLeadStageToMemory(leadId: string, fromStage: string | null, toStage: string, lossReason: string | null): Promise<void> {
    const STAGE_LABELS: Record<string, string> = {
      NOVO: 'Novo', QUALIFICANDO: 'Qualificando', PROPOSTA: 'Proposta',
      NEGOCIANDO: 'Negociando', FINALIZADO: 'Finalizado', PERDIDO: 'Perdido',
    };
    const today = new Date().toISOString().slice(0, 10);
    const entry = {
      from: fromStage, to: toStage, date: today,
      ...(lossReason ? { loss_reason: lossReason } : {}),
    };
    const existing = await this.prisma.aiMemory.findUnique({ where: { lead_id: leadId } });
    let facts: any = {};
    try {
      facts = existing?.facts_json
        ? (typeof existing.facts_json === 'string' ? JSON.parse(existing.facts_json as string) : existing.facts_json)
        : {};
    } catch { facts = {}; }

    const timeline: any[] = facts.crm_timeline || [];
    timeline.push(entry);
    if (timeline.length > 30) timeline.splice(0, timeline.length - 30);
    facts.crm_timeline = timeline;

    const fromLabel = STAGE_LABELS[fromStage ?? ''] || fromStage || 'início';
    const toLabel = STAGE_LABELS[toStage] || toStage;
    const summaryLine = `[CRM ${today}] ${fromLabel} → ${toLabel}${lossReason ? ` (Motivo: ${lossReason})` : ''}`;
    const newSummary = (summaryLine + (existing?.summary ? '\n' + existing.summary : '')).slice(0, 2000);

    if (existing) {
      await this.prisma.aiMemory.update({
        where: { lead_id: leadId },
        data: { facts_json: facts, summary: newSummary, last_updated_at: new Date(), version: { increment: 1 } },
      });
    } else {
      await this.prisma.aiMemory.create({ data: { lead_id: leadId, summary: newSummary, facts_json: facts } });
    }
  }
}
