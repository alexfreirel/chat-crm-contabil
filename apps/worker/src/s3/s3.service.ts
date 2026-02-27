import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private client: S3Client;
  private bucket = process.env.S3_BUCKET || 'chat-crm-media';

  constructor() {
    this.client = new S3Client({
      endpoint: process.env.S3_ENDPOINT || 'http://localhost:8333',
      region: process.env.S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || 'some_access_key',
        secretAccessKey: process.env.S3_SECRET_KEY || 'some_secret_key',
      },
      forcePathStyle: true, // Necessário para SeaweedFS e MinIO
    });
  }

  async uploadBuffer(key: string, buffer: Buffer, mimeType: string) {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      });

      await this.client.send(command);
      return key;
    } catch (error) {
      this.logger.error(`S3 Upload Error: ${error}`);
      throw error;
    }
  }

  // A API usará isso para devolver URL, mas podemos deixar no frontend ou api
}
