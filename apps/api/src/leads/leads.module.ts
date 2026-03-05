import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { LeadsCleanupService } from './leads-cleanup.service';
import { LegalCasesModule } from '../legal-cases/legal-cases.module';

@Module({
  imports: [LegalCasesModule],
  controllers: [LeadsController],
  providers: [LeadsService, LeadsCleanupService],
  exports: [LeadsService],
})
export class LeadsModule {}
