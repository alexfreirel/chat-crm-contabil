import { Module } from '@nestjs/common';
import { RecurringExpensesService } from './recurring-expenses.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [RecurringExpensesService],
})
export class FinanceiroRecurringModule {}
