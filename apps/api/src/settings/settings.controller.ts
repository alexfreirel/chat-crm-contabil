import { Controller, Get, Post, Patch, Delete, Body, UseGuards, Request, Param, Put, Logger, UseInterceptors, UploadedFile, Res, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Response } from 'express';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { S3Service } from '../s3/s3.service';
import { CreateSkillDto, UpdateSkillDto, CreateSkillToolDto, UpdateSkillToolDto } from './dto/settings.dto';

/** Mascara uma chave de API, mostrando apenas os primeiros 4 e últimos 4 caracteres */
function maskApiKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length <= 10) return '****';
  return `${key.slice(0, 4)}${'*'.repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`;
}

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  private readonly logger = new Logger(SettingsController.name);

  constructor(
    private readonly settingsService: SettingsService,
    private readonly whatsappService: WhatsappService,
    private readonly s3Service: S3Service,
    private readonly prisma: PrismaService,
    @InjectQueue('ai-jobs') private readonly aiQueue: Queue,
  ) {}

  // ─── Generic Settings ─────────────────────────────────

  @Get()
  @Roles('ADMIN')
  async getAll() {
    return this.settingsService.getAll();
  }

  @Put()
  @Roles('ADMIN')
  async upsert(@Body() data: { key: string; value: string }) {
    return this.settingsService.upsert(data.key, data.value);
  }

  @Get('whatsapp-config/health')
  @Roles('ADMIN')
  async checkHealth() {
    try {
      await this.whatsappService.listInstances();
      return { status: 'online' };
    } catch (error) {
      return { status: 'offline', error: error.message };
    }
  }

  @Get('whatsapp-config')
  @Roles('ADMIN')
  async getWhatsAppConfig() {
    const config = await this.settingsService.getWhatsAppConfig();
    return { ...config, apiKey: maskApiKey(config.apiKey) };
  }

  @Post('whatsapp-config')
  @Roles('ADMIN')
  async setWhatsAppConfig(@Body() data: { apiUrl: string; apiKey?: string; webhookUrl?: string }) {
    await this.settingsService.setWhatsAppConfig(data.apiUrl, data.apiKey, data.webhookUrl);

    // Reaplicar webhook em todas as instâncias existentes
    if (data.webhookUrl) {
      try {
        const instances = await this.whatsappService.listInstances();
        const names: string[] = (instances as any[]).map((i) => i.instanceName).filter(Boolean);
        await Promise.allSettled(
          names.map((name) => this.whatsappService.setWebhook(name, data.webhookUrl!)),
        );
        this.logger.log(`Webhook atualizado em ${names.length} instância(s)`);
      } catch (e) {
        this.logger.error('Falha ao reaplicar webhook nas instâncias:', e?.message);
      }
    }

    return { message: 'Configurações atualizadas com sucesso' };
  }

  @Get('ai-config')
  @Roles('ADMIN')
  async getAiConfig() {
    const config = await this.settingsService.getAiConfig();
    return { ...config, apiKey: maskApiKey(config.apiKey) };
  }

  @Post('ai-config')
  @Roles('ADMIN')
  async setAiConfig(@Body() data: { apiKey?: string; adminKey?: string; anthropicApiKey?: string; defaultModel?: string; adminBotEnabled?: boolean; cooldownSeconds?: number }) {
    if (data.apiKey)    await this.settingsService.setAiConfig(data.apiKey);
    if (data.adminKey)  await this.settingsService.setAdminKey(data.adminKey);
    if (data.anthropicApiKey) await this.settingsService.upsert('ANTHROPIC_API_KEY', data.anthropicApiKey);
    if (data.defaultModel) await this.settingsService.setDefaultModel(data.defaultModel);
    if (data.adminBotEnabled !== undefined) await this.settingsService.setAdminBotEnabled(data.adminBotEnabled);
    if (data.cooldownSeconds !== undefined) await this.settingsService.setCooldownSeconds(Number(data.cooldownSeconds));
    return { message: 'Configurações de IA salvas com sucesso' };
  }

  @Get('skills')
  async getSkills() {
    return this.settingsService.getSkills();
  }

  @Patch('skills/:id/toggle')
  @Roles('ADMIN')
  async toggleSkill(@Param('id') id: string, @Body() data: { isActive: boolean }) {
    await this.settingsService.toggleSkill(id, data.isActive);
    return { message: 'Skill atualizada com sucesso' };
  }

  @Post('skills/reset-defaults')
  @Roles('ADMIN')
  async resetSkillsToDefaults() {
    return this.settingsService.resetSkillsToDefaults();
  }

  @Post('skills')
  @Roles('ADMIN')
  async createSkill(@Body() data: CreateSkillDto) {
    return this.settingsService.createSkill(data);
  }

  @Patch('skills/:id')
  @Roles('ADMIN')
  async updateSkill(@Param('id') id: string, @Body() data: UpdateSkillDto) {
    return this.settingsService.updateSkill(id, data);
  }

  @Delete('skills/:id')
  @Roles('ADMIN')
  async deleteSkill(@Param('id') id: string) {
    return this.settingsService.deleteSkill(id);
  }

  // ─── Skill Tools CRUD ─────────────────────────────────

  @Get('skills/:skillId/tools')
  async getSkillTools(@Param('skillId') skillId: string) {
    return this.settingsService.getSkillTools(skillId);
  }

  @Post('skills/:skillId/tools')
  @Roles('ADMIN')
  async createSkillTool(@Param('skillId') skillId: string, @Body() data: CreateSkillToolDto) {
    return this.settingsService.createSkillTool(skillId, data);
  }

  @Patch('skills/tools/:toolId')
  @Roles('ADMIN')
  async updateSkillTool(@Param('toolId') toolId: string, @Body() data: UpdateSkillToolDto) {
    return this.settingsService.updateSkillTool(toolId, data);
  }

  @Delete('skills/tools/:toolId')
  @Roles('ADMIN')
  async deleteSkillTool(@Param('toolId') toolId: string) {
    return this.settingsService.deleteSkillTool(toolId);
  }

  // ─── Skill Assets / References ──────────────────────────

  @Get('skills/:skillId/assets')
  async getSkillAssets(@Param('skillId') skillId: string) {
    return this.settingsService.getSkillAssets(skillId);
  }

  @Post('skills/:skillId/assets')
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSkillAsset(
    @Param('skillId') skillId: string,
    @UploadedFile() file: any,
    @Body() body: { asset_type?: string; inject_mode?: string },
  ) {
    if (!file) throw new NotFoundException('Nenhum arquivo enviado');

    const ext = file.originalname.split('.').pop() || 'bin';
    const uuid = crypto.randomUUID();
    const s3Key = `skill-assets/${skillId}/${uuid}.${ext}`;

    await this.s3Service.uploadBuffer(s3Key, file.buffer, file.mimetype);

    let contentText: string | null = null;
    const assetType = body.asset_type || 'asset';
    const injectMode = body.inject_mode || (assetType === 'reference' ? 'full_text' : 'none');

    if (assetType === 'reference' && injectMode !== 'none') {
      if (file.mimetype === 'text/markdown' || file.mimetype === 'text/plain' || ext === 'md' || ext === 'txt') {
        contentText = file.buffer.toString('utf-8');
      }
    }

    return this.settingsService.createSkillAsset(skillId, {
      name: file.originalname,
      s3_key: s3Key,
      mime_type: file.mimetype,
      size: file.size,
      asset_type: assetType,
      inject_mode: injectMode,
      content_text: contentText,
    });
  }

  @Patch('skills/assets/:assetId')
  @Roles('ADMIN')
  async updateSkillAsset(@Param('assetId') assetId: string, @Body() body: { inject_mode?: string; asset_type?: string; content_text?: string; size?: number }) {
    return this.settingsService.updateSkillAsset(assetId, body);
  }

  @Delete('skills/assets/:assetId')
  @Roles('ADMIN')
  async deleteSkillAsset(@Param('assetId') assetId: string) {
    const asset = await this.settingsService.deleteSkillAsset(assetId);
    if (asset?.s3_key) {
      try { await this.s3Service.deleteObject(asset.s3_key); } catch {}
    }
    return { ok: true };
  }

  @Get('skills/assets/:assetId/download')
  async downloadSkillAsset(@Param('assetId') assetId: string, @Res() res: any) {
    const asset = await this.settingsService.findSkillAssetById(assetId);
    if (!asset) throw new NotFoundException('Asset não encontrado');

    const { buffer, contentType } = await this.s3Service.getObjectBuffer(asset.s3_key);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(asset.name)}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Get('ai-costs')
  @Roles('ADMIN')
  async getAiCosts() {
    return this.settingsService.getAiCosts();
  }

  // ─── AI Health (diagnostico consolidado da IA do Inbox) ───────
  // Retorna em uma unica chamada: chaves mascaradas, defaults,
  // skills ativas, fila ai-jobs, Redis, instancias Evolution e
  // atividade recente. Util para diagnosticar problemas no Miguel.
  @Get('ai-health')
  @Roles('ADMIN')
  async getAiHealth() {
    const checks: Array<{ name: string; status: 'ok' | 'warn' | 'error'; detail?: string }> = [];

    // ─── 1. Configs da IA ─────────────────────────────────
    const aiConfig = await this.settingsService.getAiConfig().catch(() => null);
    const openaiOk = !!aiConfig?.isConfigured;
    const anthropicOk = !!aiConfig?.isAnthropicKeyConfigured;
    checks.push({
      name: 'OPENAI_API_KEY',
      status: openaiOk ? 'ok' : 'error',
      detail: openaiOk ? undefined : 'Sem chave OpenAI — IA nao respondera (worker aborta job)',
    });
    checks.push({
      name: 'ANTHROPIC_API_KEY',
      status: anthropicOk ? 'ok' : 'warn',
      detail: anthropicOk ? undefined : 'Sem chave Anthropic — apenas OpenAI disponivel',
    });

    // ─── 2. Fila ai-jobs (BullMQ → Redis) ─────────────────
    let queueStats: any = null;
    let redisOk = false;
    try {
      const counts = await this.aiQueue.getJobCounts(
        'waiting', 'active', 'delayed', 'failed', 'completed', 'paused',
      );
      queueStats = counts;
      redisOk = true;
      checks.push({ name: 'Redis/BullMQ', status: 'ok' });
      if (counts.failed > 0) {
        checks.push({
          name: 'Jobs falhados',
          status: 'warn',
          detail: `${counts.failed} jobs falharam — verificar logs do worker`,
        });
      }
      if (counts.waiting > 50) {
        checks.push({
          name: 'Fila acumulada',
          status: 'warn',
          detail: `${counts.waiting} jobs aguardando — worker pode estar lento ou parado`,
        });
      }
    } catch (e: any) {
      checks.push({
        name: 'Redis/BullMQ',
        status: 'error',
        detail: `Falha ao acessar fila: ${e.message}`,
      });
    }

    // ─── 3. Skills ativas ─────────────────────────────────
    let activeSkills: { id: string; name: string; area: string; tools: number }[] = [];
    try {
      const skills = await (this.prisma as any).promptSkill.findMany({
        where: { active: true },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
        include: { tools: { where: { active: true } } },
      });
      activeSkills = skills.map((s: any) => ({
        id: s.id,
        name: s.name,
        area: s.area,
        tools: s.tools.length,
      }));
      checks.push({
        name: 'Skills ativas',
        status: skills.length > 0 ? 'ok' : 'warn',
        detail: skills.length === 0 ? 'Nenhuma skill ativa — IA usara prompt generico' : undefined,
      });
    } catch (e: any) {
      checks.push({ name: 'Skills ativas', status: 'error', detail: e.message });
    }

    // ─── 4. Instancias Evolution ──────────────────────────
    let evolutionInstances: { name: string; status: string }[] = [];
    let onlineCount = 0;
    try {
      const list = await this.whatsappService.listInstances();
      if (Array.isArray(list)) {
        evolutionInstances = list.map((i: any) => ({
          name: i.instanceName,
          status: i.status,
        }));
        onlineCount = evolutionInstances.filter(i => i.status === 'open').length;
      }
      checks.push({
        name: 'WhatsApp (Evolution)',
        status: onlineCount > 0 ? 'ok' : 'error',
        detail: onlineCount === 0
          ? 'Nenhuma instancia online — IA nao consegue enviar mensagens'
          : `${onlineCount}/${evolutionInstances.length} instancia(s) online`,
      });
    } catch (e: any) {
      checks.push({
        name: 'WhatsApp (Evolution)',
        status: 'error',
        detail: `Falha ao listar instancias: ${e.message}`,
      });
    }

    // ─── 5. Conversas por ai_mode ─────────────────────────
    const [aiOn, aiOff] = await Promise.all([
      this.prisma.conversation.count({ where: { ai_mode: true } }),
      this.prisma.conversation.count({ where: { ai_mode: false } }),
    ]);

    // ─── 6. Atividade recente da IA ───────────────────────
    let lastUsage: { created_at: Date; model: string; total_tokens: number } | null = null;
    try {
      lastUsage = await (this.prisma as any).aiUsage.findFirst({
        orderBy: { created_at: 'desc' },
        select: { created_at: true, model: true, total_tokens: true },
      });
      if (lastUsage) {
        const minsAgo = Math.floor((Date.now() - new Date(lastUsage.created_at).getTime()) / 60000);
        checks.push({
          name: 'Ultima resposta da IA',
          status: minsAgo < 60 * 24 ? 'ok' : 'warn',
          detail: `${minsAgo} min atras (${lastUsage.model})`,
        });
      } else {
        checks.push({
          name: 'Ultima resposta da IA',
          status: 'warn',
          detail: 'Nenhum registro de uso — IA nunca foi chamada',
        });
      }
    } catch { /* tabela vazia ou inexistente */ }

    // ─── 7. Status geral ──────────────────────────────────
    const hasError = checks.some(c => c.status === 'error');
    const hasWarn = checks.some(c => c.status === 'warn');
    const overall: 'ok' | 'warn' | 'error' = hasError ? 'error' : hasWarn ? 'warn' : 'ok';

    return {
      overall,
      checks,
      config: {
        openaiConfigured: openaiOk,
        anthropicConfigured: anthropicOk,
        defaultModel: aiConfig?.defaultModel ?? null,
        cooldownSeconds: aiConfig?.cooldownSeconds ?? null,
        adminBotEnabled: aiConfig?.adminBotEnabled ?? null,
      },
      queue: queueStats ? { name: 'ai-jobs', redisOk, ...queueStats } : { name: 'ai-jobs', redisOk: false },
      skills: { active: activeSkills.length, list: activeSkills },
      whatsapp: { online: onlineCount, total: evolutionInstances.length, instances: evolutionInstances },
      conversations: { aiMode: aiOn, humanMode: aiOff },
      lastUsage: lastUsage ? {
        at: lastUsage.created_at,
        model: lastUsage.model,
        totalTokens: lastUsage.total_tokens,
      } : null,
      checkedAt: new Date().toISOString(),
    };
  }

  // ─── Clicksign ────────────────────────────────────────

  @Get('clicksign')
  @Roles('ADMIN')
  async getClicksign() {
    const cfg = await this.settingsService.getClicksignConfig();
    return {
      ...cfg,
      apiToken:     maskApiKey(cfg.apiToken),
      webhookToken: maskApiKey(cfg.webhookToken),
    };
  }

  @Patch('clicksign')
  @Roles('ADMIN')
  async setClicksign(@Body() body: { baseUrl?: string; apiToken?: string; webhookToken?: string }) {
    await this.settingsService.setClicksignConfig(body);
    return { ok: true };
  }

  // ─── Contrato Trabalhista ─────────────────────────────

  @Get('contract')
  async getContract() {
    return this.settingsService.getContractConfig();
  }

  @Patch('contract')
  @Roles('ADMIN')
  async setContract(@Body() body: Record<string, string>) {
    await this.settingsService.setContractConfig(body);
    return { ok: true };
  }

  // ─── CRM Config ───────────────────────────────────────

  @Get('crm-config')
  async getCrmConfig() {
    return this.settingsService.getCrmConfig();
  }

  @Patch('crm-config')
  @Roles('ADMIN')
  async setCrmConfig(@Body() body: { stagnationDays?: number }) {
    await this.settingsService.setCrmConfig(body);
    return { ok: true };
  }

  // ─── Canned Responses ─────────────────────────────────

  @Get('canned-responses')
  async getCannedResponses() {
    return this.settingsService.getCannedResponses();
  }

  @Patch('canned-responses')
  @Roles('ADMIN')
  async setCannedResponses(@Body() body: { responses: { id: string; label: string; text: string }[] }) {
    await this.settingsService.setCannedResponses(body.responses || []);
    return { ok: true };
  }

  // ─── TTS (Text-to-Speech) ─────────────────────────────

  @Get('tts')
  @Roles('ADMIN')
  async getTtsConfig() {
    return this.settingsService.getTtsConfig();
  }

  @Patch('tts')
  @Roles('ADMIN')
  async setTtsConfig(@Body() body: { enabled?: boolean; googleApiKey?: string; voice?: string; language?: string }) {
    await this.settingsService.setTtsConfig(body);
    return { ok: true };
  }
}
