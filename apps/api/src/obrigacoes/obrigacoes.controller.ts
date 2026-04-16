import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { ObrigacoesService } from './obrigacoes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('obrigacoes')
export class ObrigacoesController {
  constructor(private readonly service: ObrigacoesService) {}

  @Get('tipos')
  getTipos() { return this.service.getTipos(); }

  @Get('vencendo')
  findVencendo(@Request() req: any, @Query('dias') dias?: string) {
    return this.service.findVencendo(req.user?.tenant_id, dias ? parseInt(dias) : 7);
  }

  @Get('cliente/:clienteId')
  findByCliente(@Param('clienteId') clienteId: string, @Request() req: any) {
    return this.service.findByCliente(clienteId, req.user?.tenant_id);
  }

  @Post('cliente/:clienteId')
  create(
    @Param('clienteId') clienteId: string,
    @Body() body: { tipo: string; titulo: string; competencia?: string; due_at: string; recorrente?: boolean; frequencia?: string; alert_days?: number; responsavel_id?: string },
    @Request() req: any,
  ) {
    return this.service.create(clienteId, body, req.user?.tenant_id);
  }

  @Patch(':id/complete')
  complete(@Param('id') id: string, @Request() req: any) {
    return this.service.complete(id, req.user?.tenant_id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(id, req.user?.tenant_id);
  }
}
