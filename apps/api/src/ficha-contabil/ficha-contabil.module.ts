import { Module } from '@nestjs/common';
import { FichaContabilService } from './ficha-contabil.service';
import { FichaContabilController } from './ficha-contabil.controller';

@Module({
  controllers: [FichaContabilController],
  providers: [FichaContabilService],
  exports: [FichaContabilService],
})
export class FichaContabilModule {}
