import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private apiBaseUrl = process.env.EVOLUTION_API_URL;
  private apiKey = process.env.EVOLUTION_GLOBAL_APIKEY;
  private instanceName = process.env.EVOLUTION_INSTANCE_NAME;

  private async request(endpoint: string, body: any) {
    const url = `${this.apiBaseUrl}/message/${endpoint}/${this.instanceName}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey || ''
        },
        body: JSON.stringify(body)
      });
      return response.json();
    } catch (e) {
      this.logger.error(`Erro ao enviar mensagem para WhatsApp: ${e}`);
      throw e;
    }
  }

  async sendText(number: string, text: string) {
    return this.request('sendText', {
      number,
      options: {
        delay: 1200,
        presence: 'composing'
      },
      textMessage: {
        text
      }
    });
  }

  async sendMedia(number: string, mediaType: 'image' | 'audio' | 'document', mediaUrl: string, caption?: string) {
    let endpoint = 'sendMedia';
    let body: any = { number, options: { delay: 1200 }, mediaMessage: { mediatype: mediaType, media: mediaUrl, caption } };

    if (mediaType === 'audio') {
      endpoint = 'sendWhatsAppAudio';
      body = { number, options: { delay: 1200 }, audioMessage: { audio: mediaUrl } };
    }

    return this.request(endpoint, body);
  }
}
