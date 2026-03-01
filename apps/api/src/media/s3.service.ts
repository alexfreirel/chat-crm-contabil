import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

@Injectable()
export class MediaS3Service {
  private readonly logger = new Logger(MediaS3Service.name);
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
      forcePathStyle: true,
    });
  }

  async uploadBuffer(key: string, buffer: Buffer, mimeType: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });
    await this.client.send(command);
    this.logger.log(`Uploaded to S3: ${key}`);
  }

  async getObjectStream(key: string): Promise<{
    stream: Readable;
    contentType: string;
    contentLength?: number;
  }> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const response = await this.client.send(command);
    return {
      stream: response.Body as Readable,
      contentType: response.ContentType || 'application/octet-stream',
      contentLength: response.ContentLength,
    };
  }
}
