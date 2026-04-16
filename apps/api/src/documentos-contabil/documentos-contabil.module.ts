import { Module } from '@nestjs/common';
import { DocumentosContabilService } from './documentos-contabil.service';
import { DocumentosContabilController } from './documentos-contabil.controller';

@Module({
  controllers: [DocumentosContabilController],
  providers: [DocumentosContabilService],
  exports: [DocumentosContabilService],
})
export class DocumentosContabilModule {}
