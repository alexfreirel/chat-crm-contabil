import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface DossieCompleto {
  pessoa: {
    id: string; nome: string; telefone: string; email?: string;
    tipo: 'lead' | 'cliente'; estagio: string; canal_preferido: string;
    dias_sem_contato: number; inadimplente: boolean; origin?: string;
  };
  historico: {
    total_msgs: number; ultima_msg_resumo: string; ultima_msg_direcao: string;
    dias_sem_resposta: number; sentimento: string;
    ultimas_msgs: Array<{ direcao: string; text: string; created_at: string }>;
  };
  processual?: {
    processos: Array<{ numero: string; tipo: string; status: string; proximo_andamento?: string }>;
  };
  tarefa: {
    sequencia_nome: string; step_position: number; total_steps: number;
    tentativa_numero: number; objetivo: string; tom: string; canal: string;
    mensagens_anteriores: string[];
  };
  financeiro?: { inadimplente: boolean; valor_devido?: number };
  data_hora_atual: string; dia_semana: string;
}

@Injectable()
export class FollowupService {
  private readonly logger = new Logger(FollowupService.name);
  private openai: OpenAI;

  constructor(
    private prisma: PrismaService,
    @InjectQueue('followup-jobs') private followupQueue: Queue,
  ) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  // ─── CRUD Sequências ─────────────────────────────────────────────────────

  async listSequences(tenantId?: string) {
    return this.prisma.followupSequence.findMany({
      where: tenantId ? { OR: [{ tenant_id: tenantId }, { tenant_id: null }] } : {},
      include: { steps: { orderBy: { position: 'asc' } }, _count: { select: { enrollments: true } } },
      orderBy: { created_at: 'desc' },
    });
  }

  async createSequence(data: {
    name: string; description?: string; category?: string;
    auto_enroll_stages?: string[]; max_attempts?: number; tenant_id?: string;
    steps?: Array<{ position: number; delay_hours: number; channel: string; tone: string; objective: string; custom_prompt?: string; auto_send?: boolean }>;
  }) {
    const { steps, ...seqData } = data;
    return this.prisma.followupSequence.create({
      data: {
        ...seqData,
        steps: steps ? { create: steps } : undefined,
      },
      include: { steps: { orderBy: { position: 'asc' } } },
    });
  }

  async updateSequence(id: string, data: Partial<{
    name: string; description: string; category: string; active: boolean;
    auto_enroll_stages: string[]; max_attempts: number;
  }>) {
    return this.prisma.followupSequence.update({ where: { id }, data,
      include: { steps: { orderBy: { position: 'asc' } } },
    });
  }

  async deleteSequence(id: string) {
    await this.prisma.followupSequence.delete({ where: { id } });
    return { ok: true };
  }

  async addStep(sequenceId: string, data: {
    position: number; delay_hours: number; channel: string; tone: string;
    objective: string; custom_prompt?: string; auto_send?: boolean;
  }) {
    return this.prisma.followupStep.create({ data: { sequence_id: sequenceId, ...data } });
  }

  async updateStep(stepId: string, data: Partial<{
    position: number; delay_hours: number; channel: string; tone: string;
    objective: string; custom_prompt: string; auto_send: boolean;
  }>) {
    return this.prisma.followupStep.update({ where: { id: stepId }, data });
  }

  async deleteStep(stepId: string) {
    await this.prisma.followupStep.delete({ where: { id: stepId } });
    return { ok: true };
  }

  // ─── Enrollments ─────────────────────────────────────────────────────────

  async listEnrollments(filters: { status?: string; sequence_id?: string; lead_id?: string } = {}) {
    return this.prisma.followupEnrollment.findMany({
      where: {
        ...(filters.status && { status: filters.status }),
        ...(filters.sequence_id && { sequence_id: filters.sequence_id }),
        ...(filters.lead_id && { lead_id: filters.lead_id }),
      },
      include: {
        lead: { select: { id: true, name: true, phone: true, stage: true } },
        sequence: { select: { id: true, name: true, category: true } },
        messages: { orderBy: { created_at: 'desc' }, take: 1 },
      },
      orderBy: { next_send_at: 'asc' },
    });
  }

  async enrollLead(leadId: string, sequenceId: string) {
    const [lead, sequence] = await Promise.all([
      this.prisma.lead.findUnique({ where: { id: leadId } }),
      this.prisma.followupSequence.findUnique({ where: { id: sequenceId }, include: { steps: { orderBy: { position: 'asc' }, take: 1 } } }),
    ]);
    if (!lead) throw new NotFoundException('Lead não encontrado');
    if (!sequence) throw new NotFoundException('Sequência não encontrada');
    if (!sequence.active) throw new BadRequestException('Sequência inativa');

    const firstStep = sequence.steps[0];
    const nextSendAt = firstStep ? new Date(Date.now() + firstStep.delay_hours * 3600 * 1000) : null;

    const enrollment = await this.prisma.followupEnrollment.upsert({
      where: { lead_id_sequence_id: { lead_id: leadId, sequence_id: sequenceId } },
      create: { lead_id: leadId, sequence_id: sequenceId, next_send_at: nextSendAt, status: 'ATIVO' },
      update: { status: 'ATIVO', current_step: 1, next_send_at: nextSendAt, paused_reason: null },
    });

    if (nextSendAt && firstStep) {
      const delay = Math.max(0, nextSendAt.getTime() - Date.now());
      await this.followupQueue.add('process-step', { enrollment_id: enrollment.id }, { delay, jobId: `enroll-${enrollment.id}-step-1`, removeOnComplete: true });
    }

    return enrollment;
  }

  async pauseEnrollment(enrollmentId: string, reason?: string) {
    return this.prisma.followupEnrollment.update({
      where: { id: enrollmentId },
      data: { status: 'PAUSADO', paused_reason: reason },
    });
  }

  async cancelEnrollment(enrollmentId: string) {
    return this.prisma.followupEnrollment.update({
      where: { id: enrollmentId },
      data: { status: 'CANCELADO' },
    });
  }

  async markConverted(enrollmentId: string) {
    return this.prisma.followupEnrollment.update({
      where: { id: enrollmentId },
      data: { status: 'CONVERTIDO' },
    });
  }

  // ─── Fila de Aprovação ───────────────────────────────────────────────────

  async listPendingApprovals() {
    return this.prisma.followupMessage.findMany({
      where: { status: 'PENDENTE_APROVACAO' },
      include: {
        enrollment: {
          include: {
            lead: { select: { id: true, name: true, phone: true, stage: true } },
            sequence: { select: { id: true, name: true } },
          },
        },
        step: { select: { position: true, channel: true, tone: true, objective: true } },
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async approveMessage(messageId: string, approvedBy: string, editedText?: string) {
    const msg = await this.prisma.followupMessage.update({
      where: { id: messageId },
      data: {
        status: 'APROVADO',
        approved_by: approvedBy,
        approved_at: new Date(),
        sent_text: editedText || undefined,
      },
    });
    // Enfileira envio imediato
    await this.followupQueue.add('send-message', { message_id: messageId }, { jobId: `send-${messageId}`, removeOnComplete: true });
    return msg;
  }

  async rejectMessage(messageId: string, approvedBy: string) {
    return this.prisma.followupMessage.update({
      where: { id: messageId },
      data: { status: 'REJEITADO', approved_by: approvedBy, approved_at: new Date() },
    });
  }

  async regenerateMessage(messageId: string) {
    const msg = await this.prisma.followupMessage.findUnique({
      where: { id: messageId },
      include: {
        enrollment: { include: { lead: true, sequence: true } },
        step: true,
      },
    });
    if (!msg) throw new NotFoundException('Mensagem não encontrada');

    const dossie = await this.buildDossie(msg.enrollment, msg.step, msg.enrollment.lead);
    const newText = await this.generateMessage(dossie, msg.step.custom_prompt);

    return this.prisma.followupMessage.update({
      where: { id: messageId },
      data: { generated_text: newText, context_json: dossie as any, status: 'PENDENTE_APROVACAO' },
    });
  }

  // ─── Context Assembler ───────────────────────────────────────────────────

  async buildDossie(enrollment: any, step: any, lead: any): Promise<DossieCompleto> {
    // Conversa ativa
    const convo = await this.prisma.conversation.findFirst({
      where: { lead_id: lead.id, status: 'ABERTO' },
      orderBy: { last_message_at: 'desc' },
    });

    // Últimas mensagens
    const ultimasMsgs = convo ? await this.prisma.message.findMany({
      where: { conversation_id: convo.id, type: { not: 'note' } },
      orderBy: { created_at: 'desc' }, take: 10,
      select: { direction: true, text: true, created_at: true },
    }) : [];

    const diasSemContato = convo?.last_message_at
      ? Math.floor((Date.now() - convo.last_message_at.getTime()) / 86400000) : 999;

    // Processos
    const casos = await this.prisma.legalCase.findMany({
      where: { lead_id: lead.id },
      select: { process_number: true, case_type: true, status: true, next_hearing_at: true },
      take: 5,
    });

    // Mensagens anteriores desta sequência (para não repetir)
    const msgsAnteriores = await this.prisma.followupMessage.findMany({
      where: { enrollment_id: enrollment.id, status: { in: ['ENVIADO', 'APROVADO'] } },
      select: { sent_text: true, generated_text: true },
      orderBy: { created_at: 'desc' }, take: 5,
    });

    const hoje = new Date();
    const diasSemana = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

    return {
      pessoa: {
        id: lead.id, nome: lead.name || 'Cliente', telefone: lead.phone,
        email: lead.email, tipo: casos.length > 0 ? 'cliente' : 'lead',
        estagio: lead.stage, canal_preferido: 'whatsapp',
        dias_sem_contato: diasSemContato, inadimplente: false, origin: lead.origin,
      },
      historico: {
        total_msgs: ultimasMsgs.length,
        ultima_msg_resumo: ultimasMsgs[0]?.text?.substring(0, 200) || 'Sem mensagens anteriores',
        ultima_msg_direcao: ultimasMsgs[0]?.direction || 'N/A',
        dias_sem_resposta: diasSemContato,
        sentimento: diasSemContato > 14 ? 'frio' : diasSemContato > 7 ? 'morno' : 'ativo',
        ultimas_msgs: ultimasMsgs.reverse().map(m => ({
          direcao: m.direction, text: m.text?.substring(0, 300) || '', created_at: m.created_at.toISOString(),
        })),
      },
      processual: casos.length > 0 ? {
        processos: casos.map(c => ({
          numero: c.process_number || 'Sem número', tipo: c.case_type || 'Geral',
          status: c.status || 'Em andamento',
          proximo_andamento: c.next_hearing_at ? c.next_hearing_at.toLocaleDateString('pt-BR') : undefined,
        })),
      } : undefined,
      tarefa: {
        sequencia_nome: enrollment.sequence?.name || 'Follow-up',
        step_position: step.position, total_steps: enrollment.sequence?.steps?.length || step.position,
        tentativa_numero: enrollment.current_step,
        objetivo: step.objective, tom: step.tone, canal: step.channel,
        mensagens_anteriores: msgsAnteriores.map(m => m.sent_text || m.generated_text),
      },
      data_hora_atual: hoje.toLocaleString('pt-BR', { timeZone: 'America/Maceio' }),
      dia_semana: diasSemana[hoje.getDay()],
    };
  }

  // ─── Message Generator ───────────────────────────────────────────────────

  async generateMessage(dossie: DossieCompleto, customPrompt?: string | null): Promise<string> {
    const escritorioNome = 'Lustosa Advogados';
    const advogadoNome = 'André Lustosa';

    const systemPrompt = `Você é ${advogadoNome}, advogado do escritório ${escritorioNome}.
Está escrevendo uma mensagem de follow-up via ${dossie.tarefa.canal} para ${dossie.pessoa.nome}.

REGRAS ABSOLUTAS:
1. Nunca revele que é IA ou que a mensagem foi gerada automaticamente
2. Use o nome da pessoa naturalmente (não repita a cada frase)
3. Nunca invente fatos sobre processos — use APENAS as informações fornecidas
4. NÃO faça promessas sobre resultados de processos
5. NÃO mencione valores de honorários (a menos que seja cobrança explícita)
6. WhatsApp: máx 250 palavras, direto ao ponto, termine com pergunta aberta
7. Email: assunto na primeira linha como "ASSUNTO: ...", corpo mais elaborado
8. NUNCA copie mensagens anteriores — sempre uma abordagem diferente
9. Tom obrigatório: ${dossie.tarefa.tom}
10. Sem frases genéricas: "venho por meio desta", "nesta oportunidade", "sem mais para o momento"

CONTEXTO COMPLETO:
${JSON.stringify(dossie, null, 2)}

OBJETIVO DESTE FOLLOW-UP:
${dossie.tarefa.objetivo}

MENSAGENS ANTERIORES (NÃO REPITA):
${dossie.tarefa.mensagens_anteriores.length > 0 ? dossie.tarefa.mensagens_anteriores.join('\n---\n') : 'Nenhuma mensagem anterior nesta sequência.'}

${customPrompt ? `INSTRUÇÃO ADICIONAL:\n${customPrompt}` : ''}

Gere APENAS o texto da mensagem, sem introduções ou explicações.`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }],
      max_tokens: 600,
      temperature: 0.85,
    });

    return completion.choices[0]?.message?.content?.trim() || 'Olá! Gostaríamos de dar continuidade ao seu atendimento. Podemos conversar?';
  }

  // ─── Risk Classifier ─────────────────────────────────────────────────────

  classifyRisk(dossie: DossieCompleto, step: any): 'baixo' | 'medio' | 'alto' {
    let score = 0;
    if (dossie.historico.sentimento === 'frio' && dossie.tarefa.tentativa_numero > 3) score += 2;
    if (dossie.financeiro?.inadimplente && dossie.tarefa.tentativa_numero >= 3) score += 2;
    if (dossie.tarefa.tom === 'firme' && dossie.tarefa.tentativa_numero >= 2) score += 2;
    if (dossie.pessoa.tipo === 'cliente' && dossie.historico.dias_sem_resposta > 30) score += 1;
    if (score >= 4) return 'alto';
    if (score >= 2) return 'medio';
    return 'baixo';
  }

  // ─── Stats ───────────────────────────────────────────────────────────────

  async getStats() {
    const [total, ativos, pendentes, enviados, convertidos] = await Promise.all([
      this.prisma.followupEnrollment.count(),
      this.prisma.followupEnrollment.count({ where: { status: 'ATIVO' } }),
      this.prisma.followupMessage.count({ where: { status: 'PENDENTE_APROVACAO' } }),
      this.prisma.followupMessage.count({ where: { status: 'ENVIADO' } }),
      this.prisma.followupEnrollment.count({ where: { status: 'CONVERTIDO' } }),
    ]);
    const taxaConversao = total > 0 ? Math.round((convertidos / total) * 100) : 0;
    return { total_enrollments: total, ativos, pendentes_aprovacao: pendentes, total_enviados: enviados, convertidos, taxa_conversao: taxaConversao };
  }

  // ─── Auto-enroll por stage ───────────────────────────────────────────────

  async autoEnrollByStage(leadId: string, stage: string) {
    const sequences = await this.prisma.followupSequence.findMany({
      where: { active: true, auto_enroll_stages: { has: stage } },
    });
    for (const seq of sequences) {
      try {
        await this.enrollLead(leadId, seq.id);
        this.logger.log(`[FOLLOWUP] Auto-enroll lead ${leadId} → sequência "${seq.name}" (stage: ${stage})`);
      } catch { /* já enrolled ou outro erro — ignorar */ }
    }
  }
}
