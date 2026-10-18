import {
  Controller, Get, Post, Patch, Param, Body, Request, Res, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { PortalClienteService } from './portal-cliente.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('portal')
export class PortalClienteController {
  constructor(private readonly service: PortalClienteService) {}

  // ─── Endpoint autenticado (contador gera link para o cliente) ──────────────
  @UseGuards(JwtAuthGuard)
  @Post('link/:clienteId')
  gerarLink(
    @Param('clienteId') clienteId: string,
    @Request() req: any,
  ) {
    return this.service.gerarLink(clienteId, req.user?.tenant_id);
  }

  // ─── Admin: acesso dos clientes ao portal (login = CNPJ, senha definida aqui) ──
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN')
  @Get('acessos')
  listarAcessos(@Request() req: any) {
    return this.service.listarAcessos(req.user?.tenant_id);
  }

  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN')
  @Patch('acesso/:clienteId')
  configurarAcesso(
    @Param('clienteId') clienteId: string,
    @Body() body: { ativo?: boolean; senha?: string },
    @Request() req: any,
  ) {
    return this.service.configurarAcesso(clienteId, body, req.user?.tenant_id);
  }

  // ─── Login do cliente (público, com limite de tentativas) ───────────────────
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  login(@Body() body: { login: string; senha: string }) {
    return this.service.login(body?.login, body?.senha);
  }

  // ─── Endpoints públicos (acessados pelo token no link) ─────────────────────

  @Public()
  @Get('info/:token')
  getInfo(@Param('token') token: string) {
    return this.service.getInfo(token);
  }

  @Public()
  @Get('obrigacoes/:token')
  getObrigacoes(@Param('token') token: string) {
    return this.service.getObrigacoes(token);
  }

  @Public()
  @Get('documentos/:token')
  getDocumentos(@Param('token') token: string) {
    return this.service.getDocumentos(token);
  }

  @Public()
  @Get('certidoes/:token')
  getCertidoes(@Param('token') token: string) {
    return this.service.getCertidoes(token);
  }

  @Public()
  @Get('certidoes/:token/:fileId/download')
  async baixarCertidao(
    @Param('token') token: string,
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ) {
    const { buffer, name, mimeType } = await this.service.baixarCertidao(token, fileId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Public()
  @Get('contratos/:token')
  getContratos(@Param('token') token: string) {
    return this.service.getContratos(token);
  }

  @Public()
  @Get('contratos/:token/:fileId/download')
  async baixarContrato(
    @Param('token') token: string,
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ) {
    const { buffer, name, mimeType } = await this.service.baixarContrato(token, fileId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Public()
  @Get('analise/:token')
  getAnalise(@Param('token') token: string) {
    return this.service.getAnalise(token);
  }

  @Public()
  @Get('impostos/:token')
  getImpostos(@Param('token') token: string) {
    return this.service.getImpostos(token);
  }

  @Public()
  @Get('impostos/:token/:fileId/download')
  async baixarImposto(
    @Param('token') token: string,
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ) {
    const { buffer, name, mimeType } = await this.service.baixarImposto(token, fileId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Public()
  @Get('folha/:token')
  getFolha(@Param('token') token: string) {
    return this.service.getFolha(token);
  }

  @Public()
  @Get('folha/:token/:fileId/download')
  async baixarFolha(
    @Param('token') token: string,
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ) {
    const { buffer, name, mimeType } = await this.service.baixarFolha(token, fileId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Public()
  @Get('parcelas/:token')
  getParcelas(@Param('token') token: string) {
    return this.service.getParcelas(token);
  }
}
