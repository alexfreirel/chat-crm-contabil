import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';

@Injectable()
export class FollowupService {
  private readonly logger = new Logger(FollowupService.name);
  private openai: OpenAI;

  constructor(private prisma: PrismaService) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async buildDossie(enrollment: any, step: any, lead: any): Promise<any> {
    const convo = await this.prisma.conversation.findFirst({
      where: { lead_id: lead.id, status: 'ABERTO' },
      orderBy: { last_message_at: 'desc' },
    });
    const ultimasMsgs = convo ? await this.prisma.message.findMany({
      where: { conversation_id: convo.id, type: { not: 'note' } },
      orderBy: { created_at: 'desc' }, take: 10,
      select: { direction: true, text: true, created_at: true },
    }) : [];
    const diasSemContato = convo?.last_message_at
      ? Math.floor((Date.now() - convo.last_message_at.getTime()) / 86400000) : 999;
    const casos = await this.prisma.legalCase.findMany({
      where: { lead_id: lead.id }, select: { process_number: true, case_type: true, status: true }, take: 5,
    });
    const msgsAnteriores = await this.prisma.followupMessage.findMany({
      where: { enrollment_id: enrollment.id, status: { in: ['ENVIADO', 'APROVADO'] } },
      select: { sent_text: true, generated_text: true }, orderBy: { created_at: 'desc' }, take: 5,
    });
    const diasSemana = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
    const hoje = new Date();
    return {
      pessoa: { id: lead.id, nome: lead.name || 'Cliente', telefone: lead.phone, email: lead.email, tipo: casos.length > 0 ? 'cliente' : 'lead', estagio: lead.stage, canal_preferido: 'whatsapp', dias_sem_contato: diasSemContato, inadimplente: false },
      historico: { total_msgs: ultimasMsgs.length, ultima_msg_resumo: ultimasMsgs[0]?.text?.substring(0, 200) || 'Sem mensagens', ultima_msg_direcao: ultimasMsgs[0]?.direction || 'N/A', dias_sem_resposta: diasSemContato, sentimento: diasSemContato > 14 ? 'frio' : diasSemContato > 7 ? 'morno' : 'ativo', ultimas_msgs: ultimasMsgs.reverse().map(m => ({ direcao: m.direction, text: m.text?.substring(0, 300) || '', created_at: m.created_at.toISOString() })) },
      processual: casos.length > 0 ? { processos: casos.map(c => ({ numero: c.process_number || 'S/N', tipo: c.case_type || 'Geral', status: c.status || 'Em andamento' })) } : undefined,
      tarefa: { sequencia_nome: enrollment.sequence?.name || 'Follow-up', step_position: step.position, total_steps: enrollment.sequence?.steps?.length || step.position, tentativa_numero: enrollment.current_step, objetivo: step.objective, tom: step.tone, canal: step.channel, mensagens_anteriores: msgsAnteriores.map(m => m.sent_text || m.generated_text) },
      data_hora_atual: hoje.toLocaleString('pt-BR', { timeZone: 'America/Maceio' }), dia_semana: diasSemana[hoje.getDay()],
    };
  }

  async generateMessage(dossie: any, customPrompt?: string | null): Promise<string> {
    const systemPrompt = `Você é André Lustosa, advogado do escritório Lustosa Advogados. Está escrevendo uma mensagem de follow-up via ${dossie.tarefa.canal} para ${dossie.pessoa.nome}.

REGRAS: Nunca revele que é IA. Nunca invente fatos. Tom: ${dossie.tarefa.tom}. WhatsApp: máx 250 palavras com pergunta aberta no final. Sem frases genéricas. Abordagem diferente das anteriores.

CONTEXTO: ${JSON.stringify(dossie, null, 2)}

OBJETIVO: ${dossie.tarefa.objetivo}

MENSAGENS ANTERIORES (NÃO REPITA): ${dossie.tarefa.mensagens_anteriores.length > 0 ? dossie.tarefa.mensagens_anteriores.join('\n---\n') : 'Nenhuma.'}

${customPrompt ? `INSTRUÇÃO ADICIONAL: ${customPrompt}` : ''}

Gere APENAS o texto da mensagem.`;

    const r = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini', messages: [{ role: 'system', content: systemPrompt }], max_tokens: 600, temperature: 0.85,
    });
    return r.choices[0]?.message?.content?.trim() || 'Olá! Gostaríamos de dar continuidade ao seu atendimento. Podemos conversar?';
  }

  classifyRisk(dossie: any, step: any): 'baixo' | 'medio' | 'alto' {
    let score = 0;
    if (dossie.historico.sentimento === 'frio' && dossie.tarefa.tentativa_numero > 3) score += 2;
    if (dossie.tarefa.tom === 'firme' && dossie.tarefa.tentativa_numero >= 2) score += 2;
    if (score >= 4) return 'alto';
    if (score >= 2) return 'medio';
    return 'baixo';
  }
}
