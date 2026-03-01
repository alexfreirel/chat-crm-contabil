import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';
import axios from 'axios';

@Processor('ai-jobs')
export class AiProcessor extends WorkerHost {
  private readonly logger = new Logger(AiProcessor.name);
  private ai: OpenAI | null = null;

  constructor(private prisma: PrismaService) {
    super();
    const key = process.env.OPENAI_API_KEY;
    if (key) {
      this.ai = new OpenAI({ apiKey: key });
    } else {
      this.logger.warn('OPENAI_API_KEY não definida — IA desativada');
    }
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Iniciando job de IA: ${job.id}`);
    if (!this.ai) {
      this.logger.warn('IA desativada (sem OPENAI_API_KEY), ignorando job');
      return;
    }
    const { message_id, conversation_id } = job.data;

    try {
      // 1. Fetch conversation details and recent history
      const convo = await this.prisma.conversation.findUnique({
        where: { id: conversation_id },
        include: { lead: true, messages: { orderBy: { created_at: 'asc' }, take: 10 } }
      });

      if (!convo || !convo.ai_mode) return;

      // 2. Format history for OpenAI
      const historyText = convo.messages.map(m =>
        `${m.direction === 'in' ? 'Lead' : 'IA/Atendente'}: ${m.text || '[Anexo]'}`
      ).join('\n');

      const systemPrompt = `Você é um agente de pré-atendimento de um escritório de advocacia (LexCRM).
Seu objetivo é extrair informações do caso do lead, classificar a área do direito (civil, criminal, trabalhista, etc)
e coletar dados para o advogado.
Responda de forma empática e curta (adequado para WhatsApp).`;

      const userPrompt = `Histórico recente da conversa:\n${historyText}\n\nResponda à última mensagem do Lead.`;

      // 3. Call OpenAI
      const completion = await this.ai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 300,
      });

      const aiText = completion.choices[0]?.message?.content || 'Desculpe, estou com instabilidade no momento.';

      // 4. Send back via Evolution API
      const apiBaseUrl = process.env.EVOLUTION_API_URL;
      const apiKey = process.env.EVOLUTION_GLOBAL_APIKEY;
      const instanceName = process.env.EVOLUTION_INSTANCE_NAME;

      const url = `${apiBaseUrl}/message/sendText/${instanceName}`;
      await axios.post(url, {
        number: convo.lead.phone,
        textMessage: { text: aiText },
        options: { delay: 1500, presence: 'composing' }
      }, {
        headers: { 'Content-Type': 'application/json', apikey: apiKey || '' }
      });

      // 5. Save generated message to DB
      await this.prisma.message.create({
        data: {
          conversation_id: convo.id,
          direction: 'out',
          type: 'text',
          text: aiText,
          external_message_id: `sys_${Date.now()}`,
          status: 'enviado'
        }
      });

      this.logger.log(`Resposta da IA enviada com sucesso para ${convo.lead.phone}`);
    } catch (e: any) {
      this.logger.error(`Erro no processamento da IA: ${e.message}`);
      throw e;
    }
  }
}
