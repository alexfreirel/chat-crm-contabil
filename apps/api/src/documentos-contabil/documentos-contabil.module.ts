import { Module } from '@nestjs/common';
import { DocumentosContabilService } from './documentos-contabil.service';
import { DocumentosContabilController } from './documentos-contabil.controller';
import { S3Module } from '../s3/s3.module';

@Module({
  imports: [S3Module],
  controllers: [DocumentosContabilController],
  providers: [DocumentosContabilService],
  exports: [DocumentosContabilService],
})
export class DocumentosContabilModule {}
