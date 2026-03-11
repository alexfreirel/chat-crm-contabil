import { Module } from '@nestjs/common';
import { ClicksignController, ClicksignWebhookController } from './clicksign.controller';
import { ClicksignService } from './clicksign.service';
import { MediaModule } from '../media/media.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { GatewayModule } from '../gateway/gateway.module';
import { ContractsModule } from '../contracts/contracts.module';

@Module({
  imports: [MediaModule, WhatsappModule, GatewayModule, ContractsModule],
  controllers: [ClicksignController, ClicksignWebhookController],
  providers: [ClicksignService],
  exports: [ClicksignService],
})
export class ClicksignModule {}
