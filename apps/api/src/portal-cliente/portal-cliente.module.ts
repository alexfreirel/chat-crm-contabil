import { Module } from '@nestjs/common';
import { PortalClienteController } from './portal-cliente.controller';
import { PortalClienteService } from './portal-cliente.service';
import { GoogleDriveModule } from '../google-drive/google-drive.module';

@Module({
  imports: [GoogleDriveModule],
  controllers: [PortalClienteController],
  providers: [PortalClienteService],
  exports: [PortalClienteService],
})
export class PortalClienteModule {}
