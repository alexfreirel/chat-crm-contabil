'use client';

import { useState, useEffect, useCallback } from 'react';
import { DollarSign, Zap, RefreshCw, TrendingUp, Bot, MessageSquare, Brain, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import api from '@/lib/api';

interface OpenAiData {
  today_usd:         number | null;
  month_usd:         number | null;
  hard_limit_usd:    number | null;
  byModel:           Array<{ name: string; cost_usd: number }>;
  last7Days:         Array<{ date: string; cost_usd: number }>;
  error:             string | null;
}

interface LocalSummary {
  cost_usd: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  calls: number;
}

interface ModelBreakdown { model: string; cost_usd: number; total_tokens: number; calls: number; }
interface TypeBreakdown  { call_type: string; cost_usd: number; total_tokens: number; calls: number; }
interface DayData        { date: string; cost_usd: number; total_tokens: number; calls: number; }

interface AiCosts {
  openai:   OpenAiData;
  today:    LocalSummary;
  month:    LocalSummary;
  byModel:  ModelBreakdown[];
  byType:   TypeBreakdown[];
  last7Days: DayData[];
}

function fmtUsd(val: number, decimals = 4) {
  if (val === 0) return '$0.00';
  if (val < 0.001) return `$${val.toFixed(6)}`;
  if (val < 0.01)  return `$${val.toFixed(5)}`;
  return `$${val.toFixed(decimals)}`;
}

function fmtTokens(val: number) {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000)     return `${(val / 1_000).toFixed(1)}k`;
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

  if (loading) {
    return (
      <div className="flex-1 flex flex-col pt-8 overflow-hidden bg-background">
        <header className="px-8 mb-6 shrink-0">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Custos de IA</h1>
          <p className="text-[13px] text-muted-foreground mt-1">Consultando a OpenAI…</p>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="animate-spin text-muted-foreground" size={24} />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex flex-col pt-8 overflow-hidden bg-background">
        <header className="px-8 mb-6 shrink-0">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Custos de IA</h1>
        </header>
        <div className="px-8">
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-4 text-sm font-semibold">
            {error || 'Erro desconhecido'}
          </div>
        </div>
      </div>
    );
  }

  const { openai, today, month, byModel, byType, last7Days } = data;

  // Dados para o gráfico — prefere dados reais da OpenAI, cai para local
  const chartDays = openai.last7Days?.length ? openai.last7Days : last7Days;
  const maxBarValue = Math.max(...chartDays.map((d) => d.cost_usd), 0.000001);

  // Modelo mais caro (OpenAI)
  const maxModelCostOpenAi = Math.max(...(openai.byModel?.map((m) => m.cost_usd) ?? [0]), 0.000001);
  const maxModelCostLocal  = Math.max(...byModel.map((m) => m.cost_usd), 0.000001);

  const hasOpenAi = !openai.error && openai.month_usd !== null;

  return (
    <div className="flex-1 flex flex-col pt-8 overflow-hidden bg-background">
      <header className="px-8 mb-6 shrink-0 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Custos de IA</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            {hasOpenAi
              ? 'Valores reais cobrados pela OpenAI + detalhamento local de tokens.'
              : 'Detalhamento local de tokens. Conecte à OpenAI para valores exatos.'}
          </p>
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

        {/* ── BANNER: valores exatos da OpenAI ───────────────────────────── */}
        {hasOpenAi ? (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 size={15} className="text-emerald-400" />
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Dados reais — OpenAI Billing API</span>
              <a
                href="https://platform.openai.com/usage"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
              >
                Ver na OpenAI <ExternalLink size={11} />
              </a>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {/* Hoje — real */}
              <div className="bg-card rounded-xl border border-border p-4">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Hoje (cobrado)</p>
                <p className="text-3xl font-black text-foreground">{fmtUsd(openai.today_usd ?? 0, 4)}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  local: {today.calls} chamadas · {fmtTokens(today.total_tokens)} tokens
                </p>
              </div>
              {/* Mês — real */}
              <div className="bg-card rounded-xl border border-border p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Este mês (cobrado)</p>
                    <p className="text-3xl font-black text-foreground">{fmtUsd(openai.month_usd ?? 0, 4)}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      local: {month.calls} chamadas · {fmtTokens(month.total_tokens)} tokens
                    </p>
                  </div>
                  {openai.hard_limit_usd != null && (
                    <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-1 rounded-lg">
                      limite ${openai.hard_limit_usd.toFixed(0)}
                    </span>
                  )}
                </div>
                {/* Barra de progresso do limite */}
                {openai.hard_limit_usd != null && openai.hard_limit_usd > 0 && (
                  <div className="mt-3">
                    <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(((openai.month_usd ?? 0) / openai.hard_limit_usd) * 100, 100)}%`,
                          background: ((openai.month_usd ?? 0) / openai.hard_limit_usd) > 0.8
                            ? 'rgb(239 68 68)'
                            : ((openai.month_usd ?? 0) / openai.hard_limit_usd) > 0.5
                            ? 'rgb(245 158 11)'
                            : 'rgb(16 185 129)',
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {(((openai.month_usd ?? 0) / openai.hard_limit_usd) * 100).toFixed(1)}% do limite mensal
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Banner de erro/aviso */
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-400">Valores exatos indisponíveis</p>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                {openai.error === 'API Key não configurada'
                  ? 'Configure a API Key da OpenAI em Ajustes IA para ver os valores reais cobrados.'
                  : `Erro ao consultar a OpenAI: ${openai.error}. Exibindo estimativas locais.`}
              </p>
            </div>
          </div>
        )}

        {/* ── Gráfico últimos 7 dias ──────────────────────────────────────── */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between bg-primary/5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <TrendingUp size={16} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">Últimos 7 dias</h4>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                  {hasOpenAi ? 'Custo real cobrado (OpenAI)' : 'Estimativa local'}
                </p>
              </div>
            </div>
            {hasOpenAi && (
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                REAL
              </span>
            )}
          </div>
          <div className="p-5">
            {chartDays.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-4">Nenhum dado ainda.</p>
            ) : (
              <div className="flex items-end gap-2 h-32">
                {chartDays.map((day) => {
                  const pct = (day.cost_usd / maxBarValue) * 100;
                  const shortDate = new Date(day.date + 'T12:00:00Z').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                  const localDay = last7Days.find((d) => d.date === day.date);
                  return (
                    <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group">
                      <div className="relative w-full flex justify-center">
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-1.5 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                          <div className="bg-popover border border-border text-foreground text-[11px] font-semibold px-2.5 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
                            <p className="text-emerald-400 font-black">{fmtUsd(day.cost_usd, 5)}</p>
                            {localDay && (
                              <>
                                <p className="text-muted-foreground">{fmtTokens(localDay.total_tokens)} tokens</p>
                                <p className="text-muted-foreground">{localDay.calls} chamadas</p>
                              </>
                            )}
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

        {/* ── Por modelo (OpenAI real, se disponível; senão local) ─────────── */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between bg-primary/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Bot size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-foreground">Por modelo</h4>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Este mês</p>
                </div>
              </div>
              {hasOpenAi && openai.byModel?.length > 0 && (
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">REAL</span>
              )}
            </div>

            {/* Preferência: dados da OpenAI (nomes reais); fallback: dados locais */}
            {hasOpenAi && openai.byModel?.length > 0 ? (
              <div className="divide-y divide-border/40">
                {openai.byModel.map((m) => {
                  const pct = (m.cost_usd / maxModelCostOpenAi) * 100;
                  const localMatch = byModel.find((b) => b.model.toLowerCase().includes(m.name.toLowerCase().replace(/\s+/g, '-').substring(0, 8)));
                  return (
                    <div key={m.name} className="px-4 py-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">{m.name}</span>
                        <div className="flex items-center gap-2">
                          {localMatch && (
                            <span className="text-[10px] text-muted-foreground">{fmtTokens(localMatch.total_tokens)} tk · {localMatch.calls} calls</span>
                          )}
                          <span className="text-xs font-bold text-emerald-400">{fmtUsd(m.cost_usd, 5)}</span>
                        </div>
                      </div>
                      <div className="h-1 bg-muted/50 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {byModel.length === 0 ? (
                  <p className="p-4 text-center text-sm text-muted-foreground">Nenhum dado.</p>
                ) : (
                  byModel.map((m) => {
                    const pct = (m.cost_usd / maxModelCostLocal) * 100;
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
                          <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Por tipo */}
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border flex items-center gap-3 bg-primary/5">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Zap size={16} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">Por tipo de chamada</h4>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Este mês — local</p>
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
          <p className="font-bold text-foreground text-xs">ℹ️ Sobre os dados</p>
          {hasOpenAi ? (
            <p>Os valores de <span className="text-emerald-400 font-semibold">hoje</span> e <span className="text-emerald-400 font-semibold">este mês</span> são buscados diretamente da API de billing da OpenAI — são os valores reais cobrados. O detalhamento por tipo de chamada (chat / memória) vem do rastreamento local.</p>
          ) : (
            <p>Os valores são estimativas calculadas localmente com base nos tokens reportados pela OpenAI. Configure a API Key em <strong>Ajustes IA</strong> para exibir os valores reais cobrados.</p>
          )}
          <p>Fatura oficial: <a href="https://platform.openai.com/usage" target="_blank" rel="noopener noreferrer" className="font-mono text-primary hover:underline">platform.openai.com/usage</a></p>
        </div>

      </div>
    </div>
  );
}
