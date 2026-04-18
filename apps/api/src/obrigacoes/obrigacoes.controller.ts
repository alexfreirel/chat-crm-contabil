import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, Request, UseGuards,
} from '@nestjs/common';
import { ObrigacoesService } from './obrigacoes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('obrigacoes')
export class ObrigacoesController {
  constructor(private readonly service: ObrigacoesService) {}

  @Get('tipos')
  getTipos() { return this.service.getTipos(); }

  /** Obrigações vencendo nos próximos N dias (visão global) */
  @Get('vencendo')
  findVencendo(@Request() req: any, @Query('dias') dias?: string) {
    return this.service.findVencendo(req.user?.tenant_id, dias ? parseInt(dias) : 7);
  }

  /** Calendário mensal global (todas as obrigações do mês) */
  @Get('calendario')
  findCalendario(
    @Request() req: any,
    @Query('ano') ano?: string,
    @Query('mes') mes?: string,
  ) {
    const now = new Date();
    return this.service.findCalendario(
      req.user?.tenant_id,
      ano ? parseInt(ano) : now.getFullYear(),
      mes ? parseInt(mes) : now.getMonth() + 1,
    );
  }

  /** Obrigações de um cliente específico */
  @Get('cliente/:clienteId')
  findByCliente(@Param('clienteId') clienteId: string, @Request() req: any) {
    return this.service.findByCliente(clienteId, req.user?.tenant_id);
  }

  /** Criar obrigação manual */
  @Post('cliente/:clienteId')
  create(
    @Param('clienteId') clienteId: string,
    @Body() body: {
      tipo: string;
      titulo: string;
      competencia?: string;
      due_at: string;
      recorrente?: boolean;
      frequencia?: string;
      alert_days?: number;
      responsavel_id?: string;
    },
    @Request() req: any,
  ) {
    return this.service.create(clienteId, body, req.user?.tenant_id);
  }

  /** Gera obrigações padrão por regime tributário */
  @Post('cliente/:clienteId/gerar-por-regime')
  generateByRegime(
    @Param('clienteId') clienteId: string,
    @Body() body: {
      regime: string;
      tem_funcionarios?: boolean;
      competencia_inicio?: string; // 'YYYY-MM'
    },
    @Request() req: any,
  ) {
    const competencia = body.competencia_inicio
      || new Date().toISOString().slice(0, 7); // mês atual
    return this.service.generateByRegime(
      clienteId,
      body.regime,
      body.tem_funcionarios ?? false,
      competencia,
      req.user?.tenant_id,
    );
  }

  /** Marcar como concluída */
  @Patch(':id/complete')
  complete(@Param('id') id: string, @Request() req: any) {
    return this.service.complete(id, req.user?.tenant_id);
  }

  /** Desfazer conclusão */
  @Patch(':id/uncomplete')
  uncomplete(@Param('id') id: string) {
    return this.service.uncomplete(id);
  }

  /** Deletar */
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(id, req.user?.tenant_id);
  }
}
