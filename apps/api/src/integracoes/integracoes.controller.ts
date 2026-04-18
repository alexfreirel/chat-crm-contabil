import {
  Controller, Get, Post, Delete, Patch,
  Body, Param, Query, Request, Res, Headers, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { IntegracoesService } from './integracoes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';

@Controller('integracoes')
export class IntegracoesController {
  constructor(private readonly service: IntegracoesService) {}

  // ── API Key ────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('api-key')
  getApiKey(@Request() req: any) {
    return this.service.getOrCreateApiKey(req.user.tenant_id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('api-key/rotate')
  rotateApiKey(@Request() req: any) {
    return this.service.rotateApiKey(req.user.tenant_id);
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('webhooks')
  listWebhooks(@Request() req: any) {
    return this.service.listWebhooks(req.user.tenant_id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('webhooks')
  createWebhook(
    @Request() req: any,
    @Body() body: { url: string; events: string[]; name: string },
  ) {
    return this.service.createWebhook(req.user.tenant_id, body.url, body.events, body.name);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('webhooks/:id')
  deleteWebhook(@Param('id') id: string, @Request() req: any) {
    return this.service.deleteWebhook(id, req.user.tenant_id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('webhooks/:id/toggle')
  toggleWebhook(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { active: boolean },
  ) {
    return this.service.toggleWebhook(id, req.user.tenant_id, body.active);
  }

  // ── Teste de webhook ───────────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post('webhooks/:id/test')
  async testWebhook(@Param('id') id: string, @Request() req: any) {
    return this.service.dispararEvento(req.user.tenant_id, 'ping', {
      message: 'Teste de webhook Lexcon',
      timestamp: new Date().toISOString(),
    });
  }

  // ── Export de dados ────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('export/clientes')
  async exportClientes(
    @Request() req: any,
    @Query('format') format: 'csv' | 'dominio' | 'alterdata' = 'csv',
    @Res() res: Response,
  ) {
    const result = await this.service.exportClientes(req.user.tenant_id, format) as any;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.csv);
  }

  @UseGuards(JwtAuthGuard)
  @Get('export/obrigacoes')
  async exportObrigacoes(
    @Request() req: any,
    @Query('format') format: 'csv' = 'csv',
    @Res() res: Response,
  ) {
    const result = await this.service.exportObrigacoes(req.user.tenant_id, format) as any;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.csv);
  }

  @UseGuards(JwtAuthGuard)
  @Get('export/faturamento')
  async exportFaturamento(
    @Request() req: any,
    @Query('format') format: 'csv' = 'csv',
    @Res() res: Response,
  ) {
    const result = await this.service.exportFaturamento(req.user.tenant_id, format) as any;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.csv);
  }

  // ── API Pública (Bearer token = API key) ───────────────────────────────────

  @Public()
  @Get('v1/clientes')
  publicClientes(@Headers('authorization') auth: string) {
    const apiKey = auth?.replace('Bearer ', '').trim();
    return this.service.publicGetClientes(apiKey);
  }

  @Public()
  @Get('v1/obrigacoes')
  publicObrigacoes(@Headers('authorization') auth: string) {
    const apiKey = auth?.replace('Bearer ', '').trim();
    return this.service.publicGetObrigacoes(apiKey);
  }
}
