import { Module } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { TemplatesContabilModule } from '../templates-contabil/templates-contabil.module';

@Module({
  imports: [TemplatesContabilModule],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
