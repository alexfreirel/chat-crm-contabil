import { Module, Global, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Global()
@Module({
  imports: [
    forwardRef(() => WhatsappModule),
    BullModule.registerQueue({ name: 'ai-jobs' }),
  ],
  providers: [SettingsService],
  controllers: [SettingsController],
  exports: [SettingsService],
})
export class SettingsModule {}
