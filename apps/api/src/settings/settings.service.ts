import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async get(key: string): Promise<string | null> {
    try {
      const setting = await this.prisma.globalSetting.findUnique({
        where: { key },
      });
      return setting?.value || null;
    } catch (e) {
      console.error(`Erro ao buscar configuração [${key}] do banco:`, e.message);
      return null; // Retorna null para disparar o fallback da Env
    }
  }

  async set(key: string, value: string): Promise<void> {
    await this.prisma.globalSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  async getWhatsAppConfig() {
    const dbApiUrl = await this.get('EVOLUTION_API_URL');
    const dbApiKey = await this.get('EVOLUTION_GLOBAL_APIKEY');
    const dbWebhookUrl = await this.get('WEBHOOK_URL');

    console.log('Configurações carregadas do Banco:', { dbApiUrl, dbApiKey, dbWebhookUrl });

    return {
      apiUrl: dbApiUrl || process.env.EVOLUTION_API_URL,
      apiKey: dbApiKey || process.env.EVOLUTION_GLOBAL_APIKEY,
      webhookUrl: dbWebhookUrl || `${process.env.PUBLIC_API_URL || 'https://andrelustosaadvogados.com.br/api'}/webhooks/evolution`,
    };
  }

  async setWhatsAppConfig(apiUrl: string, apiKey: string, webhookUrl?: string) {
    await this.set('EVOLUTION_API_URL', apiUrl);
    await this.set('EVOLUTION_GLOBAL_APIKEY', apiKey);
    if (webhookUrl) {
      await this.set('WEBHOOK_URL', webhookUrl);
    }
  }

  async getAiConfig() {
    const apiKey = await this.get('OPENAI_API_KEY');
    return {
      apiKey: apiKey || process.env.OPENAI_API_KEY || null,
      isConfigured: !!(apiKey || process.env.OPENAI_API_KEY),
    };
  }

  async setAiConfig(apiKey: string) {
    await this.set('OPENAI_KEY', apiKey);
  }

  async getSkills() {
    let skills = await this.prisma.promptSkill.findMany();

    if (skills.length === 0) {
      const defaultSkills = [
        { name: 'Triagem Inicial', area: 'Coleta informações do cliente, identifica o tipo de caso e urgência. Cria leads automaticamente no CRM.', system_prompt: '...', active: true },
        { name: 'FAQ - Perguntas Frequentes', area: 'Responde perguntas comuns sobre áreas de atuação, horários, localização e processo de contratação.', system_prompt: '...', active: true },
        { name: 'Agendamento', area: 'Permite que clientes agendem consultas diretamente pelo chat, verificando disponibilidade na agenda.', system_prompt: '...', active: false },
        { name: 'Solicitação de Documentos', area: 'Solicita e recebe documentos do cliente via chat (fotos, PDFs) para análise prévia do caso.', system_prompt: '...', active: false },
      ];

      for (const s of defaultSkills) {
        await this.prisma.promptSkill.create({ data: s });
      }
      skills = await this.prisma.promptSkill.findMany();
    }

    return skills.map(s => ({
      id: s.id,
      name: s.name,
      description: s.area,
      isActive: s.active
    }));
  }

  async toggleSkill(id: string, active: boolean) {
    return this.prisma.promptSkill.update({
      where: { id },
      data: { active }
    });
  }
}
