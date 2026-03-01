import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [WhatsappModule, MediaModule],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
