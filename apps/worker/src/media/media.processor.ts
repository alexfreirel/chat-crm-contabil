import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import axios from 'axios';
import * as crypto from 'crypto';

@Processor('media-jobs')
export class MediaProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessor.name);
  
  constructor(
    private prisma: PrismaService,
    private s3Service: S3Service
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Iniciando job de mídia: ${job.id}`);
    
    // Obter URL ou Base64 dependendo de como a Evolution entrega o anexo ou usar a rota base64
    const { message_id, remote_jid, msg_id } = job.data;
    
    try {
      // 1. Chamar a Evolution para baixar o content (base64)
      const evolutionUrl = process.env.EVOLUTION_API_URL || '';
      const instance = process.env.EVOLUTION_INSTANCE_NAME || '';
      const apikey = process.env.EVOLUTION_GLOBAL_APIKEY || '';
      
      const downloadResponse = await axios.post(
        `${evolutionUrl}/chat/getBase64FromMediaMessage/${instance}`, 
        { message: { key: { id: msg_id } } }, // Evolution Payload Format
        { headers: { apikey } }
      );
      
      const base64Data = downloadResponse.data.base64;
      const mimeType = downloadResponse.data.mimetype || 'application/octet-stream';
      
      if (!base64Data) {
        throw new Error('Sem base64 retornado da Evolution API');
      }

      // 2. Buffer & Checksum
      const buffer = Buffer.from(base64Data, 'base64');
      const checksum = crypto.createHash('md5').update(buffer).digest('hex');
      const size = buffer.length;
      
      // 3. Upload S3 (SeaweedFS)
      const ext = mimeType.split('/')[1] || 'bin';
      const s3Key = `media/${message_id}.${ext}`;
      await this.s3Service.uploadBuffer(s3Key, buffer, mimeType);
      
      this.logger.log(`Mídia subida com sucesso: ${s3Key}`);
      
      // 4. Update Prisma (Database)
      await this.prisma.media.create({
        data: {
          message_id: message_id,
          s3_key: s3Key,
          mime_type: mimeType,
          size,
          checksum,
        }
      });
      
    } catch (e: any) {
      this.logger.error(`Erro ao processar mídia: ${e.message}`);
      throw e;
    }
  }
}
