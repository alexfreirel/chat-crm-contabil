'use client';

import { useState, useEffect, useCallback } from 'react';
import { DollarSign, Zap, RefreshCw, TrendingUp, Bot, MessageSquare, Brain } from 'lucide-react';
import api from '@/lib/api';

interface CostSummary {
  cost_usd: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  calls: number;
}

interface ModelBreakdown {
  model: string;
  cost_usd: number;
  total_tokens: number;
  calls: number;
}

interface TypeBreakdown {
  call_type: string;
  cost_usd: number;
  total_tokens: number;
  calls: number;
}

interface DayData {
  date: string;
  cost_usd: number;
  total_tokens: number;
  calls: number;
}

interface AiCosts {
  today: CostSummary;
  month: CostSummary;
  byModel: ModelBreakdown[];
  byType: TypeBreakdown[];
  last7Days: DayData[];
}

function fmtUsd(val: number) {
  return val < 0.01 ? `$${val.toFixed(5)}` : `$${val.toFixed(4)}`;
}

function fmtTokens(val: number) {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`;
  return String(val);
}

const TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  chat:    { label: 'Chat principal',    icon: <MessageSquare size={13} />, color: 'text-primary bg-primary/10 border-primary/20' },
  memory:  { label: 'Memória / resumo',  icon: <Brain size={13} />,         color: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
  whisper: { label: 'Transcrição (voz)', icon: <Zap size={13} />,           color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
};

export default function AiCostsPage() {
  const [data, setData] = useState<AiCosts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/settings/ai-costs');
      setData(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Erro ao carregar dados de custo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Calcula max para o gráfico de barras ──────────────────────────────────
  const maxDayCost = data
    ? Math.max(...data.last7Days.map((d) => d.cost_usd), 0.000001)
    : 1;

  const maxModelCost = data
    ? Math.max(...data.byModel.map((m) => m.cost_usd), 0.000001)
    : 1;

  if (loading) {
    return (
      <div className="flex-1 flex flex-col pt-8 overflow-hidden bg-background">
        <header className="px-8 mb-6 shrink-0">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Custos de IA</h1>
          <p className="text-[13px] text-muted-foreground mt-1">Monitoramento de tokens e gastos com a OpenAI.</p>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="animate-spin text-muted-foreground" size={24} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col pt-8 overflow-hidden bg-background">
        <header className="px-8 mb-6 shrink-0">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Custos de IA</h1>
        </header>
        <div className="px-8">
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-4 text-sm font-semibold">
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { today, month, byModel, byType, last7Days } = data;

  return (
    <div className="flex-1 flex flex-col pt-8 overflow-hidden bg-background">
      <header className="px-8 mb-6 shrink-0 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Custos de IA</h1>
          <p className="text-[13px] text-muted-foreground mt-1">Monitoramento de tokens e gastos com a OpenAI.</p>
        </div>
        <button
          onClick={fetchData}
          className="mt-1 p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
          title="Atualizar"
        >
          <RefreshCw size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-8 pb-8 flex flex-col gap-6">

        {/* ── Cards de resumo Hoje / Mês ──────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4">
          {/* Hoje */}
          <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <DollarSign size={16} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Hoje</p>
                  <p className="text-xs text-muted-foreground">{today.calls} chamada{today.calls !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <span className="text-2xl font-black text-foreground">{fmtUsd(today.cost_usd)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
              <div className="text-center">
                <p className="text-[11px] text-muted-foreground">Total tokens</p>
                <p className="text-sm font-bold text-foreground">{fmtTokens(today.total_tokens)}</p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-muted-foreground">Entrada</p>
                <p className="text-sm font-bold text-foreground">{fmtTokens(today.prompt_tokens)}</p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-muted-foreground">Saída</p>
                <p className="text-sm font-bold text-foreground">{fmtTokens(today.completion_tokens)}</p>
              </div>
            </div>
          </div>

          {/* Mês */}
          <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <TrendingUp size={16} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Este mês</p>
                  <p className="text-xs text-muted-foreground">{month.calls} chamada{month.calls !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <span className="text-2xl font-black text-foreground">{fmtUsd(month.cost_usd)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
              <div className="text-center">
                <p className="text-[11px] text-muted-foreground">Total tokens</p>
                <p className="text-sm font-bold text-foreground">{fmtTokens(month.total_tokens)}</p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-muted-foreground">Entrada</p>
                <p className="text-sm font-bold text-foreground">{fmtTokens(month.prompt_tokens)}</p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-muted-foreground">Saída</p>
                <p className="text-sm font-bold text-foreground">{fmtTokens(month.completion_tokens)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Gráfico últimos 7 dias ──────────────────────────────────────── */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-3 bg-primary/5">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <TrendingUp size={16} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground">Últimos 7 dias</h4>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Custo diário em USD</p>
            </div>
          </div>
          <div className="p-5">
            {last7Days.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-4">Nenhum dado ainda.</p>
            ) : (
              <div className="flex items-end gap-2 h-32">
                {last7Days.map((day) => {
                  const pct = (day.cost_usd / maxDayCost) * 100;
                  const shortDate = new Date(day.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                  return (
                    <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group">
                      <div className="relative w-full flex justify-center">
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-1.5 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                          <div className="bg-popover border border-border text-foreground text-[11px] font-semibold px-2.5 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
                            <p>{fmtUsd(day.cost_usd)}</p>
                            <p className="text-muted-foreground">{fmtTokens(day.total_tokens)} tokens</p>
                            <p className="text-muted-foreground">{day.calls} chamadas</p>
                          </div>
                          <div className="w-2 h-2 bg-popover border-r border-b border-border rotate-45 -mt-1.5" />
                        </div>
                        {/* Barra */}
                        <div
                          className="w-full rounded-t-lg bg-primary/60 hover:bg-primary transition-colors"
                          style={{ height: `${Math.max(pct, day.cost_usd > 0 ? 4 : 0)}%`, minHeight: day.cost_usd > 0 ? '4px' : '0' }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{shortDate}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Por modelo + Por tipo ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4">

          {/* Por modelo */}
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border flex items-center gap-3 bg-primary/5">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Bot size={16} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">Por modelo</h4>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Este mês</p>
              </div>
            </div>
            <div className="divide-y divide-border/40">
              {byModel.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">Nenhum dado.</p>
              ) : (
                byModel.map((m) => {
                  const pct = (m.cost_usd / maxModelCost) * 100;
                  return (
                    <div key={m.model} className="px-4 py-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground font-mono">{m.model}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">{m.calls} calls · {fmtTokens(m.total_tokens)} tk</span>
                          <span className="text-xs font-bold text-foreground">{fmtUsd(m.cost_usd)}</span>
                        </div>
                      </div>
                      <div className="h-1 bg-muted/50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/60 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Por tipo */}
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border flex items-center gap-3 bg-primary/5">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Zap size={16} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">Por tipo de chamada</h4>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Este mês</p>
              </div>
            </div>
            <div className="divide-y divide-border/40">
              {byType.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">Nenhum dado.</p>
              ) : (
                byType.map((t) => {
                  const meta = TYPE_LABELS[t.call_type] ?? { label: t.call_type, icon: <Zap size={13} />, color: 'text-muted-foreground bg-muted border-border' };
                  return (
                    <div key={t.call_type} className="px-4 py-3 flex items-center gap-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${meta.color}`}>
                        {meta.icon}
                        {meta.label}
                      </span>
                      <div className="flex-1 text-right">
                        <p className="text-xs font-bold text-foreground">{fmtUsd(t.cost_usd)}</p>
                        <p className="text-[10px] text-muted-foreground">{t.calls} calls · {fmtTokens(t.total_tokens)} tokens</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* ── Nota informativa ─────────────────────────────────────────────── */}
        <div className="bg-card/50 rounded-2xl border border-border p-4 text-[12px] text-muted-foreground space-y-1">
          <p className="font-bold text-foreground text-xs">ℹ️ Sobre os valores</p>
          <p>Os custos são calculados localmente com base nos tokens reportados pela OpenAI e na tabela de preços de cada modelo. Podem haver pequenas diferenças em relação à fatura oficial da OpenAI.</p>
          <p>Confira os valores reais em <span className="font-mono text-primary">platform.openai.com/usage</span>.</p>
        </div>

      </div>
    </div>
  );
}
