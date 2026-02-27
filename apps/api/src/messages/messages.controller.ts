import { Controller, Get, Param, Post, Body, UseGuards } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('conversation/:id')
  getMessages(@Param('id') conversationId: string) {
    return this.messagesService.getMessages(conversationId);
  }

  @Post('send')
  sendMessage(
    @Body('conversationId') conversationId: string,
    @Body('text') text: string
  ) {
    return this.messagesService.sendMessage(conversationId, text);
  }
}
