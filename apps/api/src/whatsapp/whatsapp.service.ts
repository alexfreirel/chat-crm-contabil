import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { LeadsService } from '../leads/leads.service';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  
  constructor(
    private readonly settingsService: SettingsService,
    private readonly leadsService: LeadsService,
    private readonly prisma: PrismaService,
  ) {}

  private normalizeUrl(url: string): string {
    if (!url) return '';
    let normalized = url.trim().replace(/\/+$/, ''); // Remove barras no final
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }
    return normalized;
  }

  private async request(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: any,
  ) {
    const config = await this.settingsService.getWhatsAppConfig();
    const baseUrl = this.normalizeUrl(config.apiUrl || '');
    const url = `${baseUrl}/${path}`;
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          apikey: config.apiKey || '',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Erro Evolution API (${path}) - Status: ${response.status} - Resposta: ${errorText}`,
        );
        return { statusCode: response.status, error: errorText };
      }

      return await response.json();
    } catch (e) {
      this.logger.error(`Exceção na requisição Evolution API (${path}): ${e}`);
      throw e;
    }
  }

  // --- MENSAGENS ---

  async sendText(number: string, text: string, instanceName?: string) {
    const targetInstance = instanceName || process.env.EVOLUTION_INSTANCE_NAME || 'crm_instance';
    return this.request('POST', `message/sendText/${targetInstance}`, {
      number,
      options: { delay: 1200, presence: 'composing' },
      textMessage: { text },
    });
  }

  async sendMedia(
    number: string,
    mediaType: 'image' | 'audio' | 'document',
    mediaUrl: string,
    caption?: string,
    instanceName?: string,
  ) {
    const targetInstance = instanceName || process.env.EVOLUTION_INSTANCE_NAME || 'crm_instance';
    let endpoint = `message/sendMedia/${targetInstance}`;
    let body: any = {
      number,
      options: { delay: 1200 },
      mediaMessage: { mediatype: mediaType, media: mediaUrl, caption },
    };

    if (mediaType === 'audio') {
      endpoint = `message/sendWhatsAppAudio/${targetInstance}`;
      body = {
        number,
        options: { delay: 1200 },
        audioMessage: { audio: mediaUrl },
      };
    }

    return this.request('POST', endpoint, body);
  }

  // --- GESTÃO DE INSTÂNCIAS ---

  async listInstances() {
    const data = await this.request('GET', 'instance/fetchInstances');
    this.logger.log(`Evolution API Response structure: ${Object.keys(data || {}).join(', ')}`);
    this.logger.log(`Evolution API Raw Data: ${JSON.stringify(data)}`);
    
    // Na v2, a Evolution retorna [{ instance: { ... } }] ou um objeto com { data: [...] }
    let instancesArray = (data as any)?.instances || (data as any)?.data || data;
    
    if (Array.isArray(instancesArray)) {
      return instancesArray.map(item => {
        const inst = item.instance || item;
        
        // Tenta encontrar o status em vários lugares comuns na v2 e v1
        const rawStatus = (
          inst.status || 
          inst.state || 
          inst.connectionStatus || 
          inst.connection?.state || 
          'connecting'
        ).toString().toLowerCase();
        
        // Mapeamento extra-robusto para 'open' (o que o front espera)
        const isOnline = ['open', 'connected', 'online', 'authenticated'].includes(rawStatus);
        const finalStatus = isOnline ? 'open' : rawStatus;

        this.logger.log(`Instance: ${inst.instanceName || inst.name} | Raw: ${rawStatus} | Final: ${finalStatus}`);

        return {
          ...inst,
          instanceName: inst.instanceName || inst.name || inst.id || 'Instância sem Nome',
          status: finalStatus
        };
      });
    }
    
    return data;
  }

  async createInstance(instanceName: string) {
    const randomToken = crypto.randomBytes(12).toString('hex');
    const config = await this.settingsService.getWhatsAppConfig();
    
    const payload: any = {
      instanceName,
      token: randomToken,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    };

    // Automação: Configurar Webhook diretamente no create para Evolution v2
    if (config.webhookUrl) {
      this.logger.log(`Provisionando instância ${instanceName} com webhook automático: ${config.webhookUrl}`);
      payload.webhook = {
        enabled: true,
        url: config.webhookUrl,
        byEvents: false,
        base64: false,
        events: [
          'APPLICATION_STARTUP',
          'QRCODE_UPDATED',
          'MESSAGES_SET',
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'MESSAGES_DELETE',
          'SEND_MESSAGE',
          'CONTACTS_SET',
          'CONTACTS_UPSERT',
          'CONTACTS_UPDATE',
          'PRESENCE_UPDATE',
          'CHATS_SET',
          'CHATS_UPSERT',
          'CHATS_UPDATE',
          'CHATS_DELETE',
          'GROUP_PARTICIPANTS_UPDATE',
          'GROUP_UPDATE',
          'GROUPS_UPSERT',
          'CONNECTION_UPDATE',
          'CALL',
          'TYPEBOT_START',
          'TYPEBOT_CHANGE_STATUS'
        ]
      };
    } else {
      this.logger.warn(`⚠️ Webhook não configurado na criação de ${instanceName}: webhookUrl global está vazio.`);
    }

    const result = await this.request('POST', 'instance/create', payload);
    this.logger.log(`✅ Instância ${instanceName} criada com provisionamento automático.`);
    
    return result;
  }

  async deleteInstance(instanceName: string) {
    return this.request('DELETE', `instance/delete/${instanceName}`);
  }

  async logoutInstance(instanceName: string) {
    return this.request('DELETE', `instance/logout/${instanceName}`);
  }

  async getConnectCode(instanceName: string) {
    return this.request('GET', `instance/connect/${instanceName}`);
  }

  async getConnectionStatus(instanceName: string) {
    return this.request('GET', `instance/connectionStatus/${instanceName}`);
  }

  async setWebhook(instanceName: string, url: string) {
    return this.request('POST', `webhook/set/${instanceName}`, {
      url,
      enabled: true,
      webhook_by_events: false,
      events: [
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'MESSAGES_DELETE',
        'SEND_MESSAGE',
        'CONNECTION_UPDATE',
        'PRESENCE_UPDATE',
        'CHATS_UPSERT',
        'CHATS_UPDATE',
        'CHATS_DELETE',
        'CONTACTS_UPSERT',
        'CONTACTS_UPDATE',
        'CONTACTS_SET',
      ],
    });
  }

  async fetchContacts(instanceName: string) {
    try {
      // 1. Tenta o endpoint POST /chat/findContacts (Versão v2.1.0+)
      let data = await this.request(
        'POST',
        `chat/findContacts/${instanceName}`,
        {},
      );

      // 2. Fallback: Se falhar (404), tenta o GET principal da v2 (Chat)
      if (!data || (data as any).statusCode === 404 || (data as any).error) {
        this.logger.log(
          `chat/findContacts (POST) indisponível para ${instanceName}, tentando chat/fetchContacts (GET)...`,
        );
        data = await this.request('GET', `chat/fetchContacts/${instanceName}`);
      }

      // 3. Fallback: GET contact/find
      if (
        !data ||
        (data as any).statusCode === 404 ||
        (data as any).error ||
        !((data as any).data || (Array.isArray(data) && data.length > 0))
      ) {
        this.logger.log(
          `chat/fetchContacts (GET) indisponível para ${instanceName}, tentando contact/find (GET)...`,
        );
        data = await this.request('GET', `contact/find/${instanceName}`);
      }

      this.logger.log(
        `Evolution API Contacts Response (Instance: ${instanceName}): ${JSON.stringify(
          data,
        ).substring(0, 500)}...`,
      );

      if (!data || (data as any).statusCode >= 400 || (data as any).error) {
        this.logger.error(
          `Falha definitiva ao buscar contatos para ${instanceName}: ${JSON.stringify(
            data,
          )}`,
        );
        return { data: [] };
      }

      return data;
    } catch (e) {
      this.logger.error(`Erro ao buscar contatos para ${instanceName}: ${e}`);
      return { data: [] };
    }
  }

  async fetchProfilePicture(instanceName: string, number: string) {
    try {
      const data = await this.request(
        'POST',
        `chat/fetchProfilePicture/${instanceName}`,
        { number },
      );
      this.logger.log(`Profile picture for ${number}: ${JSON.stringify(data)}`);
      return data?.profilePictureUrl || data?.profile_picture || data?.data?.profile_picture || data?.url || null;
    } catch (e) {
      this.logger.error(`Erro ao buscar foto de perfil para ${number}: ${e}`);
      return null;
    }
  }

  async fetchChats(instanceName: string) {
    try {
      // 1. Tenta POST /chat/findChats (v2.1.0+ com fix PR#1384: inclui contatos NÃO salvos)
      let data = await this.request(
        'POST',
        `chat/findChats/${instanceName}`,
        {},
      );

      // 2. Fallback: GET /chat/fetchChats (versões mais antigas, pode não incluir não salvos)
      if (!data || (data as any).statusCode === 404 || (data as any).error) {
        this.logger.log(
          `chat/findChats (POST) indisponível para ${instanceName}, tentando chat/fetchChats (GET)...`,
        );
        data = await this.request('GET', `chat/fetchChats/${instanceName}`);
      }

      this.logger.log(
        `Evolution API Chats Response (Instance: ${instanceName}): ${JSON.stringify(
          data,
        ).substring(0, 500)}...`,
      );

      if (!data || (data as any).statusCode >= 400 || (data as any).error) {
        this.logger.error(
          `Falha ao buscar chats para ${instanceName}: ${JSON.stringify(data)}`,
        );
        return { data: [] };
      }

      return data;
    } catch (e) {
      this.logger.error(`Erro ao buscar chats para ${instanceName}: ${e}`);
      return { data: [] };
    }
  }

  async syncContacts(instanceName: string, tenantId?: string) {
    const rawContacts = await this.fetchContacts(instanceName);
    const rawChats = await this.fetchChats(instanceName);

    // Ambas APIs podem retornar array direto OU { data: [...] }
    const contactsList = Array.isArray(rawContacts)
      ? rawContacts
      : (rawContacts as any).data || (rawContacts as any).contacts || [];

    const chatsList = Array.isArray(rawChats)
      ? rawChats
      : (rawChats as any).data || (rawChats as any).chats || [];

    this.logger.log(`Sync ${instanceName}: ${contactsList.length} contatos, ${chatsList.length} chats`);

    // Log amostra da estrutura para debug
    if (chatsList.length > 0) {
      this.logger.log(`Amostra chat[0] keys: ${Object.keys(chatsList[0]).join(', ')}`);
      this.logger.log(`Amostra chat[0]: ${JSON.stringify(chatsList[0]).substring(0, 300)}`);
    }
    if (contactsList.length > 0) {
      this.logger.log(`Amostra contact[0] keys: ${Object.keys(contactsList[0]).join(', ')}`);
      this.logger.log(`Amostra contact[0]: ${JSON.stringify(contactsList[0]).substring(0, 300)}`);
    }

    // Combinar contacts + chats (chats inclui contatos não salvos na agenda)
    const allEntries = [...contactsList, ...chatsList];

    if (allEntries.length === 0) {
      return { total: 0, synced: 0, error: 'Nenhum contato ou chat encontrado' };
    }

    const seenPhones = new Set<string>();
    let updatedCount = 0;
    let skippedGroups = 0;
    let skippedInvalid = 0;

    for (const entry of allEntries) {
      try {
        // findChats retorna: { remoteJid, isGroup, pushName, profilePicUrl, ... }
        // findContacts retorna: { remoteJid, pushName, number, ... }
        const remoteJid: string = entry.remoteJid || '';

        // ---- FILTRAR GRUPOS, BROADCASTS, STATUS ----
        if (entry.isGroup === true) { skippedGroups++; continue; }
        if (remoteJid.includes('@g.us'))        { skippedGroups++; continue; }
        if (remoteJid.includes('@broadcast'))   { skippedGroups++; continue; }
        if (remoteJid.includes('status@'))      { skippedGroups++; continue; }
        if (remoteJid === 'status@broadcast')   { skippedGroups++; continue; }

        // ---- EXTRAIR PHONE ----
        let phone = '';

        if (remoteJid && remoteJid.includes('@s.whatsapp.net')) {
          phone = remoteJid.split('@')[0];
        } else if (entry.number) {
          phone = String(entry.number);
        }

        phone = phone.replace(/\D/g, '');

        // Descartar inválidos
        if (!phone || phone.length < 10 || phone.length > 15) {
          skippedInvalid++;
          continue;
        }

        // Dedup: mesmo phone de contacts e chats
        if (seenPhones.has(phone)) continue;
        seenPhones.add(phone);

        // Jid para external_id da conversa
        const jid = remoteJid || `${phone}@s.whatsapp.net`;

        // Foto de perfil (usa profilePicUrl do findChats se disponível)
        const profilePictureUrl = entry.profilePicUrl ||
          await this.fetchProfilePicture(instanceName, phone);

        const lead = await this.leadsService.upsert({
          name: (entry.pushName ||
            entry.name ||
            entry.verifiedName ||
            `Contato ${phone}`) as string,
          phone: phone as string,
          profile_picture_url: profilePictureUrl || null,
          origin: 'whatsapp',
          tenant: tenantId ? { connect: { id: tenantId } } : undefined,
          stage: 'NOVO',
        });

        // Cria conversa se não existir
        const existingConv = await this.prisma.conversation.findFirst({
          where: {
            lead_id: lead.id,
            channel: 'whatsapp',
            status: 'ABERTO',
          },
        });

        if (!existingConv) {
          await this.prisma.conversation.create({
            data: {
              lead_id: lead.id,
              channel: 'whatsapp',
              status: 'ABERTO',
              external_id: jid,
            },
          });
        }

        updatedCount++;
      } catch (e) {
        this.logger.error(
          `Erro ao sincronizar entrada: ${JSON.stringify(entry).substring(0, 200)} - ${e.message}`,
        );
      }
    }

    this.logger.log(
      `Sync ${instanceName} concluído: ${updatedCount} sincronizados, ` +
      `${skippedGroups} grupos ignorados, ${skippedInvalid} inválidos, ` +
      `${seenPhones.size} phones únicos de ${allEntries.length} entradas`,
    );
    return { total: allEntries.length, synced: updatedCount, skippedGroups, skippedInvalid, uniquePhones: seenPhones.size };
  }

}
