import { Module } from '@nestjs/common';
import { TemplatesContabilService } from './templates-contabil.service';
import { TemplatesContabilController } from './templates-contabil.controller';

@Module({
  controllers: [TemplatesContabilController],
  providers: [TemplatesContabilService],
  exports: [TemplatesContabilService],
})
export class TemplatesContabilModule {}
