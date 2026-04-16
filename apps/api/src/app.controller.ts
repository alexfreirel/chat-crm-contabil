import { Controller, Get, Delete, UseGuards, Request } from '@nestjs/common';
import { AppService } from './app.service';
import { ChatGateway } from './gateway/chat.gateway';
import { Public } from './auth/decorators/public.decorator';
import { PrismaService } from './prisma/prisma.service';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { Roles } from './auth/decorators/roles.decorator';

@Public()
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly chatGateway: ChatGateway,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('debug/socket')
  debugSocket() {
    const server = this.chatGateway?.server;
    const engine = (server as any)?.engine;
    return {
      initialized: !!server,
      engineAttached: !!engine,
      path: (server as any)?._opts?.path || (server as any)?.opts?.path || 'unknown',
      connectedClients: engine?.clientsCount ?? -1,
      transports: (server as any)?._opts?.transports || (server as any)?.opts?.transports || 'unknown',
      httpServerAttached: !!(server as any)?.httpServer,
    };
  }

  // ── Admin cleanup endpoints ───────────────────────────────────────
  @Delete('admin/cleanup/inbox')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async cleanupInbox(@Request() req: any) {
    const messages = await this.prisma.message.deleteMany({});
    const notes = await (this.prisma as any).conversationNote.deleteMany({});
    const conversations = await this.prisma.conversation.deleteMany({});
    return {
      ok: true,
      deleted: {
        messages: messages.count,
        notes: notes.count,
        conversations: conversations.count,
      },
    };
  }

  @Delete('admin/cleanup/contacts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async cleanupContacts(@Request() req: any) {
    // Limpa dependencias primeiro
    const messages = await this.prisma.message.deleteMany({});
    const notes = await (this.prisma as any).conversationNote.deleteMany({});
    const conversations = await this.prisma.conversation.deleteMany({});
    const leadNotes = await this.prisma.leadNote.deleteMany({});
    const stageHistory = await this.prisma.leadStageHistory.deleteMany({});
    const leads = await this.prisma.lead.deleteMany({});
    return {
      ok: true,
      deleted: {
        messages: messages.count,
        notes: notes.count,
        conversations: conversations.count,
        leadNotes: leadNotes.count,
        stageHistory: stageHistory.count,
        leads: leads.count,
      },
    };
  }
}
