import { Module } from '@nestjs/common';
import { AiProcessor } from './ai.processor';

@Module({
  providers: [AiProcessor],
})
export class AiModule {}
