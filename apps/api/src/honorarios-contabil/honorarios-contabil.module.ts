import { Module } from '@nestjs/common';
import { HonorariosContabilService } from './honorarios-contabil.service';
import { HonorariosContabilController } from './honorarios-contabil.controller';

@Module({
  controllers: [HonorariosContabilController],
  providers: [HonorariosContabilService],
  exports: [HonorariosContabilService],
})
export class HonorariosContabilModule {}
