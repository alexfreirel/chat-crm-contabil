import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { PetitionsService } from './petitions.service';
import { PetitionAiService } from './petition-ai.service';
import { PetitionChatService, ChatMessage } from './petition-chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('petitions')
export class PetitionsController {
  constructor(
    private readonly service: PetitionsService,
    private readonly aiService: PetitionAiService,
    private readonly chatService: PetitionChatService,
  ) {}

  // ─── Chat (Claude Streaming) ───────────────────────────

  /** GET /petitions/chat/skills — list skills available for petition chat */
  @Get('chat/skills')
  getChatSkills() {
    return this.chatService.getAvailableSkills();
  }

  /** POST /petitions/chat — stream a Claude response (SSE) */
  @Post('chat')
  async chat(
    @Body() body: { messages: ChatMessage[]; skillId?: string; model?: string },
    @Res() res: Response,
  ) {
    return this.chatService.streamChat(body, res);
  }

  // ─── Case-scoped CRUD ─────────────────────────────────

  @Get('case/:caseId')
  findByCaseId(
    @Param('caseId') caseId: string,
    @Request() req: any,
  ) {
    return this.service.findByCaseId(caseId, req.user.tenant_id);
  }

  @Post('case/:caseId')
  create(
    @Param('caseId') caseId: string,
    @Body() body: {
      title: string;
      type: string;
      template_id?: string;
      content_json?: any;
      content_html?: string;
    },
    @Request() req: any,
  ) {
    return this.service.create(caseId, body, req.user.id, req.user.tenant_id);
  }

  @Post('case/:caseId/generate')
  createAndGenerate(
    @Param('caseId') caseId: string,
    @Body() body: { title: string; type: string },
    @Request() req: any,
  ) {
    return this.aiService.createAndGenerate(caseId, body, req.user.id, req.user.tenant_id);
  }

  @Post(':id/generate')
  generate(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.aiService.generate(id, req.user.tenant_id);
  }

  @Get(':id')
  findById(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.service.findById(id, req.user.tenant_id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { content_json?: any; content_html?: string; title?: string },
    @Request() req: any,
  ) {
    return this.service.update(id, body, req.user.tenant_id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Request() req: any,
  ) {
    return this.service.updateStatus(id, status, req.user.tenant_id);
  }

  @Post(':id/version')
  saveVersion(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.service.saveVersion(id, req.user.id, req.user.tenant_id);
  }

  @Get(':id/versions')
  findVersions(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.service.findVersions(id, req.user.tenant_id);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.service.remove(id, req.user.tenant_id);
  }
}
