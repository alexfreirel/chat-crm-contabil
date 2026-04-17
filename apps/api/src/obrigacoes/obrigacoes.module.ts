import { Module } from '@nestjs/common';
import { ObrigacoesService } from './obrigacoes.service';
import { ObrigacoesController } from './obrigacoes.controller';

@Module({
  controllers: [ObrigacoesController],
  providers: [ObrigacoesService],
  exports: [ObrigacoesService],
})
export class ObrigacoesModule {}
