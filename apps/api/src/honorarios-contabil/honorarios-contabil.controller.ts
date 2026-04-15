import { Controller, Get, Post, Patch, Delete, Body, Param, Request, UseGuards } from '@nestjs/common';
import { HonorariosContabilService } from './honorarios-contabil.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('honorarios-contabil')
export class HonorariosContabilController {
  constructor(private readonly service: HonorariosContabilService) {}

  @Get('cliente/:clienteId')
  findByCliente(@Param('clienteId') clienteId: string, @Request() req: any) {
    return this.service.findByCliente(clienteId, req.user?.tenant_id);
  }

  @Post('cliente/:clienteId')
  create(
    @Param('clienteId') clienteId: string,
    @Body() body: { tipo: string; valor: number; dia_vencimento?: number; notas?: string },
    @Request() req: any,
  ) {
    return this.service.create(clienteId, body, req.user?.tenant_id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { valor?: number; dia_vencimento?: number; notas?: string; ativo?: boolean }) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/parcelas')
  addParcela(
    @Param('id') id: string,
    @Body() body: { competencia?: string; amount: number; due_date: string; payment_method?: string; notas?: string },
  ) {
    return this.service.addParcela(id, body);
  }

  @Patch('parcelas/:parcelaId/pagar')
  markPaid(@Param('parcelaId') parcelaId: string, @Body('payment_method') pm?: string) {
    return this.service.markPaid(parcelaId, pm);
  }

  @Delete('parcelas/:parcelaId')
  deleteParcela(@Param('parcelaId') parcelaId: string) {
    return this.service.deleteParcela(parcelaId);
  }
}
