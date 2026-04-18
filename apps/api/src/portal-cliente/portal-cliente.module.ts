import { Module } from '@nestjs/common';
import { PortalClienteController } from './portal-cliente.controller';
import { PortalClienteService } from './portal-cliente.service';

@Module({
  controllers: [PortalClienteController],
  providers: [PortalClienteService],
  exports: [PortalClienteService],
})
export class PortalClienteModule {}
