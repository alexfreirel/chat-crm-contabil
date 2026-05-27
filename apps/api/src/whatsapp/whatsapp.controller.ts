import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request, Logger, BadRequestException } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SettingsService } from '../settings/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard)
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly settingsService: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('instances')
  async listInstances() {
    return this.whatsappService.listInstances();
  }

  // Nome da instância é SEMPRE gerado no servidor com prefixo do deployment.
  // Garante isolamento entre deployments que compartilham o mesmo servidor
  // Evolution (lustosa/lexcon) — sem chance de colisão de nome "cru".
  @Post('instances')
  async createInstance(@Request() req: any) {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) throw new BadRequestException('Usuário sem tenant_id');

    const rand = crypto.randomBytes(4).toString('hex');
    const namespacedName = `lex_${tenantId.replace(/-/g, '')}_${rand}`;

    await (this.prisma as any).instance.create({
      data: { name: namespacedName, tenant_id: tenantId, type: 'whatsapp' },
    });

    const instance = await this.whatsappService.createInstance(namespacedName);

    try {
      const config = await this.settingsService.getWhatsAppConfig();
      if (config.webhookUrl) {
        await this.whatsappService.setWebhook(namespacedName, config.webhookUrl);
        this.logger.log(`Webhook configurado automaticamente para instância: ${namespacedName}`);
      }
    } catch (e) {
      this.logger.error(`Falha ao configurar webhook automático para ${namespacedName}:`, e);
    }

    return { ...instance, name: namespacedName };
  }

  @Delete('instances/:name')
  async deleteInstance(@Param('name') name: string) {
    return this.whatsappService.deleteInstance(name);
  }

  @Post('instances/:name/logout')
  async logoutInstance(@Param('name') name: string) {
    return this.whatsappService.logoutInstance(name);
  }

  @Get('instances/:name/connect')
  async getConnectCode(@Param('name') name: string) {
    return this.whatsappService.getConnectCode(name);
  }

  @Get('instances/:name/status')
  async getConnectionStatus(@Param('name') name: string) {
    return this.whatsappService.getConnectionStatus(name);
  }

  @Get('instances/:name/contacts')
  async fetchContacts(@Param('name') name: string) {
    return this.whatsappService.fetchContacts(name);
  }

  @Post('instances/:name/sync')
  async syncContacts(@Param('name') name: string, @Request() req: any) {
    const tenantId = req.user?.tenant_id;
    return this.whatsappService.syncContacts(name, tenantId);
  }

  @Post('instances/:name/settings')
  async setInstanceSettings(
    @Param('name') name: string,
    @Body() body: { rejectCall?: boolean; msgCall?: string; alwaysOnline?: boolean },
  ) {
    return this.whatsappService.setInstanceSettings(name, body);
  }
}
