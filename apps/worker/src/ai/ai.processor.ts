import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleGenAI } from '@google/genai';
import axios from 'axios';

@Processor('ai-jobs')
export class AiProcessor extends WorkerHost {
  private readonly logger = new Logger(AiProcessor.name);
  private ai: GoogleGenAI;

  constructor(private prisma: PrismaService) {
    super();
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Iniciando job de IA: ${job.id}`);
    const { message_id, conversation_id } = job.data;

    try {
      // 1. Fetch conversation details and recent history
      const convo = await this.prisma.conversation.findUnique({
        where: { id: conversation_id },
        include: { lead: true, messages: { orderBy: { created_at: 'asc' }, take: 10 } }
      });

      if (!convo || !convo.ai_mode) return;

      // 2. Format history for Google Gemini
      const historyText = convo.messages.map(m => 
        `${m.direction === 'in' ? 'Lead' : 'IA/Atendente'}: ${m.text || '[Anexo]'}`
      ).join('\n');

      const prompt = `
        Você é um agente de pré-atendimento de um escritório de advocacia (LexCRM).
        Seu objetivo é extrair informações do caso do lead, classificar a área do direito (civil, criminal, trabalhista, etc) 
        e coletar dados para o advogado.
        
        Histórico recente da conversa:
        ${historyText}

        Responda à última mensagem do Lead de forma empática e curta (adequado para WhatsApp).
      `;

      // 3. Call LLM
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const aiText = response.text || 'Desculpe, estou com instabilidade no momento.';

      // 4. Send back via Evolution API
      const apiBaseUrl = process.env.EVOLUTION_API_URL;
      const apiKey = process.env.EVOLUTION_GLOBAL_APIKEY;
      const instanceName = process.env.EVOLUTION_INSTANCE_NAME;

      const url = `${apiBaseUrl}/message/sendText/${instanceName}`;
      await axios.post(url, {
        number: convo.lead.phone,
        textMessage: { text: aiText },
        options: { delay: 1500, presence: 'composing' } // realistic typing delay
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
