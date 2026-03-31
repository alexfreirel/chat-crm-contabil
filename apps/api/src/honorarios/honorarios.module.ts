import { Module } from '@nestjs/common';
import { HonorariosController } from './honorarios.controller';
import { HonorariosService } from './honorarios.service';

@Module({
  controllers: [HonorariosController],
  providers: [HonorariosService],
  exports: [HonorariosService],
})
export class HonorariosModule {}
