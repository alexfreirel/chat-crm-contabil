'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, RefreshCw, Bell,
  CheckCircle2, AlertTriangle, Clock, Calendar,
  X, Check,
} from 'lucide-react';
import api from '@/lib/api';
import { showSuccess, showError } from '@/lib/toast';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ObrigacaoFiscal {
  id: string;
  tipo: string;
  titulo: string;
  due_at: string;
  completed: boolean;
  completed_at: string | null;
  recorrente: boolean;
  frequencia: string | null;
  alert_days: number;
  cliente: {
    id: string;
    lead: { name: string | null; phone: string } | null;
  } | null;
  responsavel: { id: string; name: string } | null;
}

// ── Utilitários ────────────────────────────────────────────────────────────────

const TIPO_COLORS: Record<string, string> = {
  DAS_MENSAL:  'bg-emerald-500',
  PGDAS:       'bg-teal-500',
  SPED_FISCAL: 'bg-blue-500',
  EFD_CONTRIB: 'bg-indigo-500',
  ECF:         'bg-purple-500',
  ECD:         'bg-violet-500',
  DCTF:        'bg-cyan-500',
  DEFIS:       'bg-orange-500',
  DASN:        'bg-amber-500',
  DIRF:        'bg-pink-500',
  RAIS:        'bg-rose-500',
  eSocial:     'bg-red-400',
  FGTS:        'bg-yellow-600',
  FOLHA:       'bg-lime-600',
  IRPF:        'bg-sky-500',
  CERTIDAO:    'bg-slate-500',
  OUTRO:       'bg-gray-500',
};

function tipoColor(tipo: string): string {
  return TIPO_COLORS[tipo] ?? 'bg-gray-500';
}

function statusChip(ob: ObrigacaoFiscal) {
  const now = new Date();
  const due = new Date(ob.due_at);
  if (ob.completed)   return 'completed';
  if (due < now)      return 'overdue';
  return 'pending';
}

const MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}
function getFirstWeekday(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full">
      <CheckCircle2 size={11} /> Concluída
    </span>
  );
  if (status === 'overdue') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full">
      <AlertTriangle size={11} /> Vencida
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full">
      <Clock size={11} /> Pendente
    </span>
  );
}

// ── Painel lateral de detalhe ──────────────────────────────────────────────────

function ObrigacaoDrawer({
  ob,
  onClose,
  onToggle,
}: {
  ob: ObrigacaoFiscal;
  onClose: () => void;
  onToggle: (id: string, completed: boolean) => void;
}) {
  const status = statusChip(ob);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      if (ob.completed) {
        await api.patch(`/obrigacoes/${ob.id}/uncomplete`);
      } else {
        await api.patch(`/obrigacoes/${ob.id}/complete`);
      }
      onToggle(ob.id, !ob.completed);
      showSuccess(ob.completed ? 'Obrigação reaberta' : 'Obrigação concluída!');
    } catch {
      showError('Erro ao atualizar obrigação');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-sm bg-card border-l border-border shadow-xl flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-foreground text-sm">Detalhe da Obrigação</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Título</p>
            <p className="font-semibold text-foreground">{ob.titulo}</p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <StatusBadge status={status} />
            <span className={`inline-block text-xs font-bold text-white px-2 py-0.5 rounded-full ${tipoColor(ob.tipo)}`}>
              {ob.tipo}
            </span>
            {ob.recorrente && (
              <span className="text-xs text-muted-foreground border border-border px-2 py-0.5 rounded-full">
                {ob.frequencia ?? 'Recorrente'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Vencimento</p>
              <p className="font-medium text-foreground">
                {new Date(ob.due_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
            {ob.completed_at && (
              <div>
                <p className="text-xs text-muted-foreground">Concluída em</p>
                <p className="font-medium text-foreground">
                  {new Date(ob.completed_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
            )}
            {ob.cliente?.lead?.name && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Cliente</p>
                <p className="font-medium text-foreground">{ob.cliente.lead.name}</p>
              </div>
            )}
            {ob.responsavel && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Responsável</p>
                <p className="font-medium text-foreground">{ob.responsavel.name}</p>
              </div>
            )}
          </div>

          <button
            onClick={toggle}
            disabled={loading}
            className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors ${
              ob.completed
                ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {ob.completed ? <><X size={15} /> Reabrir</> : <><Check size={15} /> Marcar Concluída</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function CalendarioFiscalPage() {
  const now = new Date();
  const [year, setYear]       = useState(now.getFullYear());
  const [month, setMonth]     = useState(now.getMonth() + 1);
  const [obrigacoes, setObrigacoes] = useState<ObrigacaoFiscal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ObrigacaoFiscal | null>(null);
  const [filter, setFilter]   = useState<'all' | 'pending' | 'overdue' | 'completed'>('all');
  const [syncing, setSyncing] = useState(false);
  const [alerting, setAlerting] = useState(false);

  const fetchCalendario = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/obrigacoes/calendario?ano=${year}&mes=${month}`);
      setObrigacoes(res.data ?? []);
    } catch {
      showError('Erro ao carregar calendário fiscal');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { fetchCalendario(); }, [fetchCalendario]);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await api.post('/obrigacoes/sync-calendario', { ano: year, mes: month });
      showSuccess(`${res.data.sincronizados} evento(s) sincronizados na Agenda`);
    } catch {
      showError('Erro ao sincronizar');
    } finally {
      setSyncing(false);
    }
  }

  async function handleAlerta() {
    setAlerting(true);
    try {
      const res = await api.post('/obrigacoes/alerta-vencimento', { dias: 3 });
      showSuccess(`${res.data.total} alerta(s) gerados para os próximos 3 dias`);
    } catch {
      showError('Erro ao gerar alertas');
    } finally {
      setAlerting(false);
    }
  }

  function handleToggle(id: string, completed: boolean) {
    setObrigacoes(prev =>
      prev.map(o => o.id === id ? { ...o, completed, completed_at: completed ? new Date().toISOString() : null } : o)
    );
    if (selected?.id === id) {
      setSelected(prev => prev ? { ...prev, completed, completed_at: completed ? new Date().toISOString() : null } : null);
    }
  }

  // ── Filtrar obrigações ──
  const filtered = obrigacoes.filter(ob => {
    if (filter === 'all') return true;
    return statusChip(ob) === filter;
  });

  // ── Agrupar por dia ──
  const byDay: Record<number, ObrigacaoFiscal[]> = {};
  for (const ob of filtered) {
    const d = new Date(ob.due_at).getDate();
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(ob);
  }

  // ── Stats ──
  const total     = obrigacoes.length;
  const completed = obrigacoes.filter(o => o.completed).length;
  const overdue   = obrigacoes.filter(o => !o.completed && new Date(o.due_at) < now).length;
  const pending   = total - completed - overdue;

  // ── Calendário grid ──
  const daysInMonth  = getDaysInMonth(year, month);
  const firstWeekday = getFirstWeekday(year, month);
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Preencher até múltiplo de 7
  while (cells.length % 7 !== 0) cells.push(null);

  const todayDate = now.getFullYear() === year && now.getMonth() + 1 === month ? now.getDate() : -1;

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Calendar size={20} className="text-primary" />
            Calendário Fiscal
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Obrigações fiscais e tributárias dos clientes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAlerta}
            disabled={alerting}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <Bell size={14} />
            {alerting ? 'Gerando...' : 'Alertas 3 dias'}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando...' : 'Sync Agenda'}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: total, color: 'text-foreground', bg: 'bg-card' },
          { label: 'Pendentes', value: pending, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/10' },
          { label: 'Vencidas', value: overdue, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/10' },
          { label: 'Concluídas', value: completed, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/10' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border border-border p-3 ${s.bg}`}>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Nav + Filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        {/* Navegação mês */}
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-foreground w-36 text-center">
            {MONTHS[month - 1]} {year}
          </span>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ChevronRight size={16} />
          </button>
          <button onClick={fetchCalendario} disabled={loading} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        {/* Filtros status */}
        <div className="flex gap-1">
          {(['all', 'pending', 'overdue', 'completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                filter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {{ all: 'Todas', pending: 'Pendentes', overdue: 'Vencidas', completed: 'Concluídas' }[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Calendário Grid */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Cabeçalho dias da semana */}
        <div className="grid grid-cols-7 border-b border-border">
          {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Células */}
        {loading ? (
          <div className="grid grid-cols-7">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="h-24 border-r border-b border-border last:border-r-0 animate-pulse bg-muted/20" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              const isToday = day === todayDate;
              const dayObs  = day ? (byDay[day] ?? []) : [];
              return (
                <div
                  key={i}
                  className={`min-h-[5.5rem] border-r border-b border-border p-1.5 flex flex-col gap-0.5 ${
                    (i + 1) % 7 === 0 ? 'border-r-0' : ''
                  } ${!day ? 'bg-muted/10' : 'hover:bg-muted/5'}`}
                >
                  {day && (
                    <>
                      <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                        isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'
                      }`}>
                        {day}
                      </span>
                      <div className="flex flex-col gap-0.5 overflow-hidden">
                        {dayObs.slice(0, 3).map(ob => {
                          const s = statusChip(ob);
                          return (
                            <button
                              key={ob.id}
                              onClick={() => setSelected(ob)}
                              className={`text-left text-[10px] font-medium px-1.5 py-0.5 rounded truncate w-full text-white ${
                                s === 'completed' ? 'bg-emerald-500 opacity-70' :
                                s === 'overdue'   ? 'bg-red-500' :
                                tipoColor(ob.tipo)
                              }`}
                              title={`${ob.titulo} — ${ob.cliente?.lead?.name ?? ''}`}
                            >
                              {ob.titulo}
                            </button>
                          );
                        })}
                        {dayObs.length > 3 && (
                          <span className="text-[10px] text-muted-foreground px-1">
                            +{dayObs.length - 3} mais
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lista compacta abaixo */}
      {filtered.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">
              Lista — {MONTHS[month - 1]} {year}
              <span className="ml-2 text-muted-foreground font-normal">({filtered.length})</span>
            </h3>
          </div>
          <div className="divide-y divide-border">
            {filtered.map(ob => {
              const s = statusChip(ob);
              return (
                <button
                  key={ob.id}
                  onClick={() => setSelected(ob)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    s === 'completed' ? 'bg-emerald-500' :
                    s === 'overdue'   ? 'bg-red-500' :
                    'bg-amber-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{ob.titulo}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {ob.cliente?.lead?.name ?? '—'} · Vence {new Date(ob.due_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <StatusBadge status={s} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Drawer de detalhe */}
      {selected && (
        <ObrigacaoDrawer
          ob={selected}
          onClose={() => setSelected(null)}
          onToggle={handleToggle}
        />
      )}
    </div>
  );
}
