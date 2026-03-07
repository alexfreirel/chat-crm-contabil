import {
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('conversation/:id')
  getMessages(
    @Param('id') conversationId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagesService.getMessages(
      conversationId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 100,
    );
  }

  @Get('link-preview')
  getLinkPreview(@Query('url') url: string) {
    return this.messagesService.getLinkPreview(url);
  }

  @Post('conversation/:id/sync-history')
  syncHistory(@Param('id') conversationId: string) {
    return this.messagesService.syncHistoryFromWhatsApp(conversationId);
  }

  @Post('send')
  sendMessage(
    @Body('conversationId') conversationId: string,
    @Body('text') text: string,
    @Req() req: any,
    @Body('replyToId') replyToId?: string,
  ) {
    if (!text || !text.trim()) {
      throw new BadRequestException('Texto nao pode ser vazio');
    }
    if (text.length > 5000) {
      throw new BadRequestException('Texto excede o limite de 5000 caracteres');
    }
    return this.messagesService.sendMessage(conversationId, text.trim(), replyToId, req.user?.id);
  }

  @Post('send-audio')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 25 * 1024 * 1024 } }))
  sendAudio(
    @Body('conversationId') conversationId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    // Construir URL pública: usa env var ou deriva dos headers do Traefik
    const publicApiUrl =
      process.env.PUBLIC_API_URL ||
      `${(req.headers['x-forwarded-proto'] as string) || req.protocol}://${(req.headers['x-forwarded-host'] as string) || req.headers['host']}/api`;

    return this.messagesService.sendAudio(conversationId, file, publicApiUrl, req.user?.id);
  }

  @Post('send-file')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  sendFile(
    @Body('conversationId') conversationId: string,
    @Body('caption') caption: string | undefined,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    const publicApiUrl =
      process.env.PUBLIC_API_URL ||
      `${(req.headers['x-forwarded-proto'] as string) || req.protocol}://${(req.headers['x-forwarded-host'] as string) || req.headers['host']}/api`;
    return this.messagesService.sendFile(conversationId, file, publicApiUrl, caption, req.user?.id);
  }

  @Post('ai-correct')
  correctText(
    @Body('text') text: string,
    @Body('action') action: string,
  ) {
    return this.messagesService.correctText(text, action);
  }

  @Post(':id/transcribe')
  transcribeAudio(@Param('id') messageId: string) {
    return this.messagesService.transcribeAudio(messageId);
  }

  @Patch(':id')
  editMessage(
    @Param('id') messageId: string,
    @Body('text') text: string,
  ) {
    return this.messagesService.editMessage(messageId, text);
  }

  @Delete(':id')
  deleteMessage(@Param('id') messageId: string) {
    return this.messagesService.deleteMessage(messageId);
  }
}
