import { Controller, Get, Param, Patch, Body, Post, UseGuards } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Prisma } from '@crm/shared';

@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get('lead/:leadId')
  findAllByLead(@Param('leadId') leadId: string) {
    return this.conversationsService.findAllByLead(leadId);
  }

  @Post()
  create(@Body() data: Prisma.ConversationCreateInput) {
    return this.conversationsService.create(data);
  }

  @Patch(':id/ai-mode')
  setAiMode(@Param('id') id: string, @Body('ai_mode') ai_mode: boolean) {
    return this.conversationsService.setAiMode(id, ai_mode);
  }
}
