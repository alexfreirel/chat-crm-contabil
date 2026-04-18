import {
  Controller, Get, Post, Param, Body, Request, UseGuards,
} from '@nestjs/common';
import { PortalClienteService } from './portal-cliente.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';

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
  @Get('parcelas/:token')
  getParcelas(@Param('token') token: string) {
    return this.service.getParcelas(token);
  }
}
