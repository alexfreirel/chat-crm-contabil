import { Module } from '@nestjs/common';
import { ClientesContabilService } from './clientes-contabil.service';
import { ClientesContabilController } from './clientes-contabil.controller';

@Module({
  controllers: [ClientesContabilController],
  providers: [ClientesContabilService],
  exports: [ClientesContabilService],
})
export class ClientesContabilModule {}
