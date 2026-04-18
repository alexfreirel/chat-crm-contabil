import {
  Controller, Get, Query, Request, Res, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { RelatoriosService } from './relatorios.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('relatorios')
export class RelatoriosController {
  constructor(private readonly service: RelatoriosService) {}

  // ── Resumo executivo ───────────────────────────────────────────────────────
  @Get('resumo')
  resumo(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.resumoExecutivo(req.user.tenant_id, startDate, endDate);
  }

  // ── Produtividade por contador ─────────────────────────────────────────────
  @Get('produtividade')
  produtividade(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.produtividade(req.user.tenant_id, startDate, endDate);
  }

  // ── Obrigações por período ─────────────────────────────────────────────────
  @Get('obrigacoes')
  obrigacoes(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.obrigacoesPorPeriodo(req.user.tenant_id, startDate, endDate);
  }

  // ── Faturamento consolidado ────────────────────────────────────────────────
  @Get('faturamento')
  faturamento(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.faturamento(req.user.tenant_id, startDate, endDate);
  }

  // ── Churn ─────────────────────────────────────────────────────────────────
  @Get('churn')
  churn(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.churn(req.user.tenant_id, startDate, endDate);
  }

  // ── Export CSV ────────────────────────────────────────────────────────────
  @Get('export')
  async exportCsv(
    @Request() req: any,
    @Query('tipo') tipo: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Res() res?: Response,
  ) {
    const tenantId = req.user.tenant_id;
    let rows: Record<string, unknown>[] = [];
    let filename = 'relatorio';

    if (tipo === 'produtividade') {
      rows = (await this.service.produtividade(tenantId, startDate, endDate)) as any;
      filename = 'relatorio-produtividade';
    } else if (tipo === 'obrigacoes') {
      const data = await this.service.obrigacoesPorPeriodo(tenantId, startDate, endDate);
      rows = data.rows as any;
      filename = 'relatorio-obrigacoes';
    } else if (tipo === 'faturamento') {
      const data = await this.service.faturamento(tenantId, startDate, endDate);
      rows = data.rows as any;
      filename = 'relatorio-faturamento';
    } else if (tipo === 'churn') {
      const data = await this.service.churn(tenantId, startDate, endDate);
      rows = data.rows as any;
      filename = 'relatorio-churn';
    }

    const csv = this.service.toCsv(rows);
    const date = new Date().toISOString().slice(0, 10);

    res!.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res!.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}-${date}.csv"`,
    );
    res!.send(csv);
  }
}
