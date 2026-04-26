import { Module } from '@nestjs/common';
import { TaskAlertsCronService } from './task-alerts-cron.service';
import { TaskRecurringService } from './task-recurring.service';

@Module({
  providers: [TaskAlertsCronService, TaskRecurringService],
})
export class TaskAlertsModule {}
