import { Module } from '@nestjs/common';
import { DjenService } from './djen.service';
import { DjenController } from './djen.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { CalendarModule } from '../calendar/calendar.module';

@Module({
  imports: [PrismaModule, SettingsModule, CalendarModule],
  controllers: [DjenController],
  providers: [DjenService],
  exports: [DjenService],
})
export class DjenModule {}
