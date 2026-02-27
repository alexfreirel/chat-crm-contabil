import { Module } from '@nestjs/common';
import { MediaProcessor } from './media.processor';

@Module({
  providers: [MediaProcessor],
})
export class MediaModule {}
