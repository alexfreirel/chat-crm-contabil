import { Module } from '@nestjs/common';
import { LegalCasesController } from './legal-cases.controller';
import { LegalCasesService } from './legal-cases.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [WhatsappModule],
  controllers: [LegalCasesController],
  providers: [LegalCasesService],
  exports: [LegalCasesService],
})
export class LegalCasesModule {}
