import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RelatoriosService {
  private readonly logger = new Logger(RelatoriosService.name);

  constructor(private prisma: PrismaService) {}

  // ── Utilitário: parse de range ─────────────────────────────────────────────
  private parseRange(startDate?: string, endDate?: string) {
    const now  = new Date();
    const end  = endDate  ? new Date(endDate)  : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end };
  }

  // ── 1. Produtividade por contador ──────────────────────────────────────────
  async produtividade(tenantId: string, startDate?: string, endDate?: string) {
    const { start, end } = this.parseRange(startDate, endDate);

    // Busca contadores do tenant
    const contadores = await this.prisma.user.findMany({
      where: { tenant_id: tenantId },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });

    const rows = await Promise.all(
      contadores.map(async (u) => {
        const base = {
          responsavel_id: u.id,
          due_at: { gte: start, lte: end },
        };

        const [total, concluidas, vencidas, clientesAtivos] = await Promise.all([
          this.prisma.obrigacaoFiscal.count({ where: { ...base } }),
          this.prisma.obrigacaoFiscal.count({ where: { ...base, completed: true } }),
          this.prisma.obrigacaoFiscal.count({
            where: { ...base, completed: false, due_at: { lt: new Date(), gte: start } },
          }),
          this.prisma.clienteContabil.count({
            where: { tenant_id: tenantId, accountant_id: u.id, stage: 'ATIVO', archived: false },
          }),
        ]);

        const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0;
        return {
          userId: u.id,
          nome: u.name,
          role: u.role,
          total,
          concluidas,
          pendentes: total - concluidas - vencidas,
          vencidas,
          pct,
          clientesAtivos,
        };
      }),
    );

    // Só retorna contadores com atividade ou clientes ativos
    return rows.filter(r => r.total > 0 || r.clientesAtivos > 0);
  }

  // ── 2. Obrigações por período ──────────────────────────────────────────────
  async obrigacoesPorPeriodo(tenantId: string, startDate?: string, endDate?: string) {
    const { start, end } = this.parseRange(startDate, endDate);

    const obrigacoes = await this.prisma.obrigacaoFiscal.findMany({
      where: { tenant_id: tenantId, due_at: { gte: start, lte: end } },
      orderBy: { due_at: 'asc' },
      include: {
        cliente: { include: { lead: { select: { name: true } } } },
        responsavel: { select: { id: true, name: true } },
      },
    });

    const now = new Date();
    const rows = obrigacoes.map(o => ({
      id: o.id,
      titulo: o.titulo,
      tipo: o.tipo,
      due_at: o.due_at,
      completed: o.completed,
      completed_at: o.completed_at,
      status: o.completed ? 'CONCLUIDA' : new Date(o.due_at) < now ? 'VENCIDA' : 'PENDENTE',
      cliente_nome: o.cliente?.lead?.name ?? '—',
      responsavel_nome: o.responsavel?.name ?? '—',
      recorrente: o.recorrente,
      frequencia: o.frequencia,
    }));

    // Totais por status
    const resumo = {
      total: rows.length,
      concluidas: rows.filter(r => r.status === 'CONCLUIDA').length,
      pendentes: rows.filter(r => r.status === 'PENDENTE').length,
      vencidas: rows.filter(r => r.status === 'VENCIDA').length,
      pct: rows.length > 0 ? Math.round((rows.filter(r => r.status === 'CONCLUIDA').length / rows.length) * 100) : 0,
    };

    // Por tipo
    const porTipo: Record<string, { tipo: string; total: number; concluidas: number }> = {};
    for (const r of rows) {
      if (!porTipo[r.tipo]) porTipo[r.tipo] = { tipo: r.tipo, total: 0, concluidas: 0 };
      porTipo[r.tipo].total++;
      if (r.status === 'CONCLUIDA') porTipo[r.tipo].concluidas++;
    }

    return { resumo, porTipo: Object.values(porTipo), rows };
  }

  // ── 3. Faturamento consolidado ─────────────────────────────────────────────
  async faturamento(tenantId: string, startDate?: string, endDate?: string) {
    const { start, end } = this.parseRange(startDate, endDate);

    // Parcelas no período (por due_date)
    const parcelas = await this.prisma.honorarioParcela.findMany({
      where: {
        due_date: { gte: start, lte: end },
        honorario: { tenant_id: tenantId },
      },
      include: {
        honorario: {
          include: {
            cliente: { include: { lead: { select: { name: true } } } },
          },
        },
      },
      orderBy: { due_date: 'asc' },
    });

    const rows = parcelas.map(p => ({
      id: p.id,
      cliente_nome: p.honorario.cliente?.lead?.name ?? '—',
      tipo: p.honorario.tipo,
      amount: Number(p.amount),
      due_date: p.due_date,
      paid_at: p.paid_at,
      status: p.status,
      payment_method: p.payment_method,
    }));

    // Totais
    const totalFaturado  = rows.reduce((s, r) => s + r.amount, 0);
    const totalRecebido  = rows.filter(r => r.status === 'PAGO').reduce((s, r) => s + r.amount, 0);
    const totalPendente  = rows.filter(r => r.status === 'PENDENTE').reduce((s, r) => s + r.amount, 0);
    const totalAtrasado  = rows.filter(r => {
      return r.status === 'PENDENTE' && new Date(r.due_date) < new Date();
    }).reduce((s, r) => s + r.amount, 0);

    // Por tipo de honorário
    const porTipo: Record<string, { tipo: string; total: number; recebido: number; pendente: number }> = {};
    for (const r of rows) {
      if (!porTipo[r.tipo]) porTipo[r.tipo] = { tipo: r.tipo, total: 0, recebido: 0, pendente: 0 };
      porTipo[r.tipo].total += r.amount;
      if (r.status === 'PAGO') porTipo[r.tipo].recebido += r.amount;
      else porTipo[r.tipo].pendente += r.amount;
    }

    return {
      resumo: { totalFaturado, totalRecebido, totalPendente, totalAtrasado, qtdParcelas: rows.length },
      porTipo: Object.values(porTipo).sort((a, b) => b.total - a.total),
      rows,
    };
  }

  // ── 4. Relatório de Churn (clientes encerrados) ────────────────────────────
  async churn(tenantId: string, startDate?: string, endDate?: string) {
    const { start, end } = this.parseRange(startDate, endDate);

    const encerrados = await this.prisma.clienteContabil.findMany({
      where: {
        tenant_id: tenantId,
        stage: 'ENCERRADO',
        stage_changed_at: { gte: start, lte: end },
      },
      include: {
        lead: { select: { name: true, phone: true } },
        accountant: { select: { name: true } },
      },
      orderBy: { stage_changed_at: 'desc' },
    });

    // Comparativo: novos clientes no período
    const novos = await this.prisma.clienteContabil.count({
      where: { tenant_id: tenantId, created_at: { gte: start, lte: end } },
    });

    const ativos = await this.prisma.clienteContabil.count({
      where: { tenant_id: tenantId, stage: 'ATIVO', archived: false },
    });

    const rows = encerrados.map(c => ({
      id: c.id,
      nome: c.lead?.name ?? '—',
      phone: c.lead?.phone ?? '—',
      service_type: c.service_type,
      regime_tributario: c.regime_tributario,
      encerrado_em: c.stage_changed_at,
      archive_reason: c.archive_reason,
      contador: c.accountant?.name ?? '—',
    }));

    return {
      resumo: {
        encerrados: rows.length,
        novos,
        ativos,
        taxaChurn: ativos > 0 ? ((rows.length / (ativos + rows.length)) * 100).toFixed(1) : '0',
      },
      rows,
    };
  }

  // ── 5. Resumo executivo (todos os KPIs) ───────────────────────────────────
  async resumoExecutivo(tenantId: string, startDate?: string, endDate?: string) {
    const [prod, obrig, fat, churnData] = await Promise.all([
      this.produtividade(tenantId, startDate, endDate),
      this.obrigacoesPorPeriodo(tenantId, startDate, endDate),
      this.faturamento(tenantId, startDate, endDate),
      this.churn(tenantId, startDate, endDate),
    ]);

    return {
      periodo: this.parseRange(startDate, endDate),
      produtividade: { contadores: prod.length, topContador: prod[0] ?? null },
      obrigacoes: obrig.resumo,
      financeiro: fat.resumo,
      churn: churnData.resumo,
    };
  }

  // ── Helper: gera CSV a partir de array de objetos ─────────────────────────
  toCsv(rows: Record<string, unknown>[]): string {
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(';'),
      ...rows.map(r =>
        headers.map(h => {
          const v = r[h];
          if (v == null) return '';
          const str = v instanceof Date ? v.toLocaleDateString('pt-BR') : String(v);
          return str.includes(';') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        }).join(';'),
      ),
    ];
    return '\uFEFF' + lines.join('\r\n'); // BOM para Excel UTF-8
  }
}
