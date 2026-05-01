import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MediaDownloadService } from './media-download.service';

/**
 * Worker BullMQ para download de mídia em background.
 *
 * Processa jobs 'download_media' enfileirados quando o download síncrono
 * no webhook falhou (timeout, S3 indisponível, Evolution API lenta, etc.).
 * Com 3 tentativas e backoff exponencial (2s, 4s, 8s).
 */
@Processor('media-jobs')
export class MediaDownloadWorker extends WorkerHost {
  private readonly logger = new Logger(MediaDownloadWorker.name);

  constructor(private readonly mediaDownload: MediaDownloadService) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { message_id, conversation_id, media_data, msg_id, instance_name } = job.data;

    this.logger.log(
      `[WORKER] Processando job ${job.id}: msg=${message_id} instância=${instance_name ?? 'desconhecida'}`,
    );

    const result = await this.mediaDownload.downloadAndStore({
      messageId: message_id,
      conversationId: conversation_id,
      externalMessageId: msg_id,
      instanceName: instance_name,
      mediaData: media_data,
    });

    if (!result) {
      // Lança erro para o BullMQ registrar falha e aplicar backoff/retry
      throw new Error(`Download de mídia falhou para msg ${message_id} (tentativa ${job.attemptsMade + 1})`);
    }

    this.logger.log(`[WORKER] Mídia baixada com sucesso: msg=${message_id}`);
  }
}
