import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaS3Service } from './s3.service';

@Module({
  controllers: [MediaController],
  providers: [MediaS3Service],
  exports: [MediaS3Service],
})
export class MediaModule {}
