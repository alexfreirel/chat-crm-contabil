import { Module, forwardRef } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { SettingsModule } from '../settings/settings.module';
import { LeadsModule } from '../leads/leads.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, forwardRef(() => SettingsModule), forwardRef(() => LeadsModule)],
  controllers: [WhatsappController],
  providers: [WhatsappService],
  exports: [WhatsappService]
})
export class WhatsappModule {}
