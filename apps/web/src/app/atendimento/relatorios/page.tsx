'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BarChart2, Download, Printer, RefreshCw,
  Users, CheckCircle2, AlertTriangle, TrendingDown,
  DollarSign, FileText, ChevronDown,
} from 'lucide-react';
import api from '@/lib/api';
import { showError, showSuccess } from '@/lib/toast';

// ── Tipos ─────────────────────────────────────────────────────────────────────

type ReportType = 'produtividade' | 'obrigacoes' | 'faturamento' | 'churn';

interface ProdRow {
  userId: string; nome: string; role: string;
  total: number; concluidas: number; pendentes: number; vencidas: number;
  pct: number; clientesAtivos: number;
}

interface ObrigRow {
  id: string; titulo: string; tipo: string; due_at: string;
  status: string; cliente_nome: string; responsavel_nome: string;
}

interface FatRow {
  id: string; cliente_nome: string; tipo: string;
  amount: number; due_date: string; status: string; payment_method: string | null;
}

interface ChurnRow {
  id: string; nome: string; service_type: string;
  regime_tributario: string | null; encerrado_em: string;
  archive_reason: string | null; contador: string;
}

// ── Utilitários ────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');
const fmtPct  = (n: number) => `${n}%`;

const STATUS_CHIP: Record<string, string> = {
  CONCLUIDA: 'bg-emerald-100 text-emerald-700',
  PENDENTE:  'bg-amber-100 text-amber-700',
  VENCIDA:   'bg-red-100 text-red-700',
  PAGO:      'bg-emerald-100 text-emerald-700',
  ATRASADO:  'bg-red-100 text-red-700',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[status] ?? 'bg-muted text-muted-foreground'}`}>
      {status}
    </span>
  );
}

function KpiCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; color?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color ?? 'bg-muted'}`}>
        {icon}
      </div>
      <div className="text-xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {sub && <div className="text-xs text-muted-foreground/70 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Componente de tabela genérica ──────────────────────────────────────────────

function DataTable({ columns, rows }: {
  columns: { key: string; label: string; render?: (v: any, row: any) => React.ReactNode }[];
  rows: any[];
}) {
  if (!rows.length) return (
    <div className="py-10 text-center text-muted-foreground text-sm">
      Nenhum dado encontrado para o período
    </div>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map(c => (
              <th key={c.key} className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
              {columns.map(c => (
                <td key={c.key} className="px-3 py-2 text-foreground">
                  {c.render ? c.render(row[c.key], row) : (row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function RelatoriosPage() {
  const now     = new Date();
  const y       = now.getFullYear();
  const m       = String(now.getMonth() + 1).padStart(2, '0');
  const [startDate, setStartDate] = useState(`${y}-${m}-01`);
  const [endDate, setEndDate]     = useState(`${y}-${m}-${new Date(y, now.getMonth() + 1, 0).getDate()}`);
  const [report, setReport]       = useState<ReportType>('produtividade');
  const [data, setData]           = useState<any>(null);
  const [loading, setLoading]     = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setData(null);
    try {
      const res = await api.get(`/relatorios/${report}`, {
        params: { startDate, endDate },
      });
      setData(res.data);
    } catch {
      showError('Erro ao carregar relatório');
    } finally {
      setLoading(false);
    }
  }, [report, startDate, endDate]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  async function exportCsv() {
    try {
      const res = await api.get(`/relatorios/export`, {
        params: { tipo: report, startDate, endDate },
        responseType: 'blob',
      });
      const url  = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `relatorio-${report}-${startDate}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      showSuccess('CSV exportado com sucesso');
    } catch {
      showError('Erro ao exportar CSV');
    }
  }

  function printReport() {
    window.print();
  }

  const TABS: { id: ReportType; label: string; icon: React.ReactNode }[] = [
    { id: 'produtividade', label: 'Produtividade', icon: <Users size={14} /> },
    { id: 'obrigacoes',   label: 'Obrigações',    icon: <CheckCircle2 size={14} /> },
    { id: 'faturamento',  label: 'Faturamento',   icon: <DollarSign size={14} /> },
    { id: 'churn',        label: 'Churn',         icon: <TrendingDown size={14} /> },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto print:p-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between print:hidden">
        <div>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <BarChart2 size={20} className="text-primary" />
            Relatórios Gerenciais
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Análise de desempenho, obrigações, faturamento e retenção
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={printReport}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <Printer size={14} /> Imprimir
          </button>
          <button
            onClick={exportCsv}
            disabled={loading || !data}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <Download size={14} /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Filtros de período */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">De:</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Até:</label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground"
          />
        </div>
        {/* Atalhos de período */}
        {[
          { label: 'Este mês', start: `${y}-${m}-01`, end: `${y}-${m}-${new Date(y, now.getMonth() + 1, 0).getDate()}` },
          { label: 'Mês anterior', start: `${y}-${String(now.getMonth()).padStart(2,'0')}-01`, end: `${y}-${String(now.getMonth()).padStart(2,'0')}-${new Date(y, now.getMonth(), 0).getDate()}` },
          { label: 'Este ano', start: `${y}-01-01`, end: `${y}-12-31` },
        ].map(p => (
          <button
            key={p.label}
            onClick={() => { setStartDate(p.start); setEndDate(p.end); }}
            className="text-xs px-3 py-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={fetchReport}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {/* Tabs de relatório */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl print:hidden">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setReport(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
              report === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.icon} <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Conteúdo do relatório */}
      <div ref={printRef} className="flex flex-col gap-4">
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* ─── Produtividade ───────────────────────────────────── */}
            {report === 'produtividade' && data && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KpiCard icon={<Users size={16} className="text-blue-600" />} label="Contadores" value={data.length}
                    color="bg-blue-100 dark:bg-blue-900/30" />
                  <KpiCard icon={<CheckCircle2 size={16} className="text-emerald-600" />} label="Total Concluídas"
                    value={data.reduce((s: number, r: ProdRow) => s + r.concluidas, 0)} color="bg-emerald-100 dark:bg-emerald-900/30" />
                  <KpiCard icon={<AlertTriangle size={16} className="text-red-600" />} label="Total Vencidas"
                    value={data.reduce((s: number, r: ProdRow) => s + r.vencidas, 0)} color="bg-red-100 dark:bg-red-900/30" />
                  <KpiCard icon={<Users size={16} className="text-teal-600" />} label="Clientes Ativos"
                    value={data.reduce((s: number, r: ProdRow) => s + r.clientesAtivos, 0)} color="bg-teal-100 dark:bg-teal-900/30" />
                </div>
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground">Produtividade por Contador</h3>
                  </div>
                  <DataTable
                    columns={[
                      { key: 'nome', label: 'Contador' },
                      { key: 'clientesAtivos', label: 'Clientes Ativos' },
                      { key: 'total', label: 'Obrigações' },
                      { key: 'concluidas', label: 'Concluídas' },
                      { key: 'vencidas', label: 'Vencidas',
                        render: (v: number) => <span className={v > 0 ? 'text-red-600 font-semibold' : ''}>{v}</span> },
                      { key: 'pct', label: '% Eficiência',
                        render: (v: number) => (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${v >= 80 ? 'bg-emerald-500' : v >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                style={{ width: `${v}%` }} />
                            </div>
                            <span className="text-xs font-medium">{fmtPct(v)}</span>
                          </div>
                        ) },
                    ]}
                    rows={data}
                  />
                </div>
              </>
            )}

            {/* ─── Obrigações ──────────────────────────────────────── */}
            {report === 'obrigacoes' && data && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KpiCard icon={<FileText size={16} className="text-blue-600" />} label="Total"
                    value={data.resumo.total} color="bg-blue-100 dark:bg-blue-900/30" />
                  <KpiCard icon={<CheckCircle2 size={16} className="text-emerald-600" />} label="Concluídas"
                    value={data.resumo.concluidas} sub={fmtPct(data.resumo.pct)} color="bg-emerald-100 dark:bg-emerald-900/30" />
                  <KpiCard icon={<AlertTriangle size={16} className="text-amber-600" />} label="Pendentes"
                    value={data.resumo.pendentes} color="bg-amber-100 dark:bg-amber-900/30" />
                  <KpiCard icon={<AlertTriangle size={16} className="text-red-600" />} label="Vencidas"
                    value={data.resumo.vencidas} color="bg-red-100 dark:bg-red-900/30" />
                </div>

                {data.porTipo?.length > 0 && (
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-border">
                      <h3 className="text-sm font-semibold text-foreground">Por Tipo de Obrigação</h3>
                    </div>
                    <DataTable
                      columns={[
                        { key: 'tipo', label: 'Tipo' },
                        { key: 'total', label: 'Total' },
                        { key: 'concluidas', label: 'Concluídas' },
                        { key: 'concluidas', label: '% Eficiência',
                          render: (_: any, row: any) => {
                            const pct = row.total > 0 ? Math.round((row.concluidas / row.total) * 100) : 0;
                            return <span className={pct >= 80 ? 'text-emerald-600 font-semibold' : pct >= 50 ? 'text-amber-600' : 'text-red-600'}>{pct}%</span>;
                          } },
                      ]}
                      rows={data.porTipo}
                    />
                  </div>
                )}

                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground">Detalhe ({data.rows?.length ?? 0})</h3>
                  </div>
                  <DataTable
                    columns={[
                      { key: 'titulo', label: 'Obrigação' },
                      { key: 'tipo', label: 'Tipo' },
                      { key: 'cliente_nome', label: 'Cliente' },
                      { key: 'responsavel_nome', label: 'Responsável' },
                      { key: 'due_at', label: 'Vencimento', render: (v: string) => fmtDate(v) },
                      { key: 'status', label: 'Status', render: (v: string) => <StatusBadge status={v} /> },
                    ]}
                    rows={data.rows ?? []}
                  />
                </div>
              </>
            )}

            {/* ─── Faturamento ─────────────────────────────────────── */}
            {report === 'faturamento' && data && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KpiCard icon={<DollarSign size={16} className="text-blue-600" />} label="Total Faturado"
                    value={fmtBRL(data.resumo.totalFaturado)} color="bg-blue-100 dark:bg-blue-900/30" />
                  <KpiCard icon={<CheckCircle2 size={16} className="text-emerald-600" />} label="Recebido"
                    value={fmtBRL(data.resumo.totalRecebido)} color="bg-emerald-100 dark:bg-emerald-900/30" />
                  <KpiCard icon={<AlertTriangle size={16} className="text-amber-600" />} label="A Receber"
                    value={fmtBRL(data.resumo.totalPendente)} color="bg-amber-100 dark:bg-amber-900/30" />
                  <KpiCard icon={<AlertTriangle size={16} className="text-red-600" />} label="Em Atraso"
                    value={fmtBRL(data.resumo.totalAtrasado)} color="bg-red-100 dark:bg-red-900/30" />
                </div>

                {data.porTipo?.length > 0 && (
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-border">
                      <h3 className="text-sm font-semibold text-foreground">Por Tipo de Serviço</h3>
                    </div>
                    <DataTable
                      columns={[
                        { key: 'tipo', label: 'Tipo' },
                        { key: 'total', label: 'Total', render: (v: number) => fmtBRL(v) },
                        { key: 'recebido', label: 'Recebido', render: (v: number) => <span className="text-emerald-600">{fmtBRL(v)}</span> },
                        { key: 'pendente', label: 'Pendente', render: (v: number) => <span className={v > 0 ? 'text-amber-600' : ''}>{fmtBRL(v)}</span> },
                      ]}
                      rows={data.porTipo}
                    />
                  </div>
                )}

                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground">Lançamentos ({data.rows?.length ?? 0})</h3>
                  </div>
                  <DataTable
                    columns={[
                      { key: 'cliente_nome', label: 'Cliente' },
                      { key: 'tipo', label: 'Tipo' },
                      { key: 'amount', label: 'Valor', render: (v: number) => fmtBRL(v) },
                      { key: 'due_date', label: 'Vencimento', render: (v: string) => fmtDate(v) },
                      { key: 'status', label: 'Status', render: (v: string) => <StatusBadge status={v} /> },
                      { key: 'payment_method', label: 'Forma' },
                    ]}
                    rows={data.rows ?? []}
                  />
                </div>
              </>
            )}

            {/* ─── Churn ───────────────────────────────────────────── */}
            {report === 'churn' && data && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KpiCard icon={<TrendingDown size={16} className="text-red-600" />} label="Clientes Encerrados"
                    value={data.resumo.encerrados} color="bg-red-100 dark:bg-red-900/30" />
                  <KpiCard icon={<Users size={16} className="text-emerald-600" />} label="Novos Clientes"
                    value={data.resumo.novos} color="bg-emerald-100 dark:bg-emerald-900/30" />
                  <KpiCard icon={<Users size={16} className="text-blue-600" />} label="Ativos Hoje"
                    value={data.resumo.ativos} color="bg-blue-100 dark:bg-blue-900/30" />
                  <KpiCard icon={<AlertTriangle size={16} className="text-amber-600" />} label="Taxa de Churn"
                    value={`${data.resumo.taxaChurn}%`} color="bg-amber-100 dark:bg-amber-900/30" />
                </div>

                {data.resumo.encerrados > 0 && (
                  <div className={`rounded-xl border p-4 flex items-start gap-3 ${
                    Number(data.resumo.taxaChurn) > 10 ? 'bg-red-50 border-red-200 dark:bg-red-900/10' : 'bg-amber-50 border-amber-200 dark:bg-amber-900/10'
                  }`}>
                    <TrendingDown size={18} className={Number(data.resumo.taxaChurn) > 10 ? 'text-red-600' : 'text-amber-600'} />
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Taxa de churn: {data.resumo.taxaChurn}% no período
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {data.resumo.encerrados} encerrado(s) vs {data.resumo.novos} novo(s). Meta recomendada: abaixo de 5%.
                      </p>
                    </div>
                  </div>
                )}

                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground">Clientes Encerrados</h3>
                  </div>
                  <DataTable
                    columns={[
                      { key: 'nome', label: 'Cliente' },
                      { key: 'service_type', label: 'Serviço' },
                      { key: 'regime_tributario', label: 'Regime' },
                      { key: 'contador', label: 'Contador' },
                      { key: 'encerrado_em', label: 'Encerrado em', render: (v: string) => fmtDate(v) },
                      { key: 'archive_reason', label: 'Motivo' },
                    ]}
                    rows={data.rows ?? []}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
