import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { LeadsCleanupService } from './leads-cleanup.service';
import { LeadNotesService } from './lead-notes.service';
import { LeadNotesController } from './lead-notes.controller';
import { AutomationsModule } from '../automations/automations.module';
import { GoogleDriveModule } from '../google-drive/google-drive.module';

@Module({
  imports: [AutomationsModule, GoogleDriveModule],
  controllers: [LeadsController, LeadNotesController],
  providers: [LeadsService, LeadsCleanupService, LeadNotesService],
  exports: [LeadsService],
})
export class LeadsModule {}
