import { Module } from '@nestjs/common';
import { ObrigacoesService } from './obrigacoes.service';
import { ObrigacoesController } from './obrigacoes.controller';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [TasksModule],
  controllers: [ObrigacoesController],
  providers: [ObrigacoesService],
  exports: [ObrigacoesService],
})
export class ObrigacoesModule {}
