'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus, CheckCircle2, Circle, Search, X, ChevronDown, ChevronLeft, ChevronRight,
  User, AlertTriangle, Loader2, CheckSquare, RotateCcw,
  CalendarDays, Sparkles, Zap, List,
} from 'lucide-react';
import api from '@/lib/api';
import { showError, showSuccess } from '@/lib/toast';
import { TaskDrawer } from '@/app/atendimento/agenda/TaskDrawer';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  due_at: string | null;
  assigned_user: { id: string; name: string } | null;
  _count?: { comments: number };
}

interface UserOption { id: string; name: string; }

interface NbaResult {
  acao: string | null;
  urgencia: 'alta' | 'media' | 'baixa';
  justificativa: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  A_FAZER:      { label: 'A Fazer',      color: 'text-blue-400',  bg: 'bg-blue-400/10'  },
  EM_PROGRESSO: { label: 'Em Progresso', color: 'text-amber-400', bg: 'bg-amber-400/10' },
  CONCLUIDA:    { label: 'Concluída',    color: 'text-green-400', bg: 'bg-green-400/10' },
  CANCELADA:    { label: 'Cancelada',    color: 'text-red-400',   bg: 'bg-red-400/10'   },
};

const STATUS_CYCLE: Record<string, string> = {
  A_FAZER: 'EM_PROGRESSO',
  EM_PROGRESSO: 'CONCLUIDA',
  CONCLUIDA: 'A_FAZER',
  CANCELADA: 'A_FAZER',
};

const REGIMES = ['MEI', 'SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL'];

function formatDue(due: string | null) {
  if (!due) return null;
  const d = new Date(due);
  const diff = Math.floor((d.getTime() - Date.now()) / 86400000);
  if (diff < -1) return { text: `${Math.abs(diff)}d atraso`, overdue: true };
  if (diff === -1) return { text: 'Ontem', overdue: true };
  if (diff === 0) return { text: 'Hoje', overdue: false };
  if (diff === 1) return { text: 'Amanhã', overdue: false };
  return { text: d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }), overdue: false };
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function TabObrigacoes({
  clienteId,
  cliente,
  onRefresh,
}: {
  clienteId: string;
  cliente?: any;
  onRefresh: () => void;
}) {
  // ── Dados
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // ── Filtros
  const [statusFilter, setStatusFilter] = useState('');
  const [dueFilter, setDueFilter] = useState('');
  const [assignedFilter, setAssignedFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Competência (mês/ano)
  const now = new Date();
  const [compYear, setCompYear] = useState(now.getFullYear());
  const [compMonth, setCompMonth] = useState(now.getMonth()); // 0-based
  const [useCompFilter, setUseCompFilter] = useState(false);

  // ── Paginação
  const [page, setPage] = useState(1);
  const LIMIT = 25;

  // ── Modal nova tarefa
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newAssigned, setNewAssigned] = useState('');
  const [newSetor, setNewSetor] = useState('');
  const [newRecorrente, setNewRecorrente] = useState(false);
  const [newRecorrenciaTipo, setNewRecorrenciaTipo] = useState<'meses' | 'infinito'>('meses');
  const [newRecorrenciaMeses, setNewRecorrenciaMeses] = useState(12);
  const [creating, setCreating] = useState(false);

  // ── Stats
  const [stats, setStats] = useState({ total: 0, a_fazer: 0, em_progresso: 0, concluida: 0, vencidas: 0 });

  // ── Drawer de detalhe
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);

  // ── NBA
  const [nba, setNba] = useState<NbaResult | null>(null);
  const [nbaLoading, setNbaLoading] = useState(false);

  // ── Gerar por regime
  const [showGerarModal, setShowGerarModal] = useState(false);
  const [gerarForm, setGerarForm] = useState({
    regime: cliente?.regime_tributario || '',
    tem_funcionarios: cliente?.lead?.ficha_contabil?.tem_funcionarios ?? false,
    competencia_inicio: new Date().toISOString().slice(0, 7),
  });
  const [gerando, setGerando] = useState(false);
  const [gerarResult, setGerarResult] = useState<{ criadas: number } | null>(null);

  useEffect(() => {
    if (cliente?.regime_tributario) setGerarForm(f => ({ ...f, regime: cliente.regime_tributario }));
    if (cliente?.lead?.ficha_contabil?.tem_funcionarios !== undefined)
      setGerarForm(f => ({ ...f, tem_funcionarios: cliente.lead.ficha_contabil.tem_funcionarios }));
  }, [cliente]);

  // ─── Fetch ────────────────────────────────────────────────────────────────

  const fetchTasks = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page: String(pg),
        limit: String(LIMIT),
        clienteContabilId: clienteId,
        viewAll: 'true',
      };
      if (statusFilter) params.status = statusFilter;
      if (assignedFilter) params.assignedUserId = assignedFilter;
      if (dueFilter) params.dueFilter = dueFilter;
      if (search) params.search = search;
      if (useCompFilter) {
        const from = new Date(compYear, compMonth, 1);
        const to = new Date(compYear, compMonth + 1, 0, 23, 59, 59);
        params.dateFrom = from.toISOString();
        params.dateTo = to.toISOString();
      }

      const res = await api.get('/tasks', { params });
      const { data, total: t } = res.data;
      setTasks(pg === 1 ? data : prev => [...prev, ...data]);
      setTotal(t);
    } catch (err: any) {
      console.error('[TabObrigacoes] fetchTasks erro:', err?.response?.status, err?.response?.data || err?.message);
      showError('Erro ao carregar tarefas');
    } finally {
      setLoading(false);
    }
  }, [clienteId, statusFilter, assignedFilter, dueFilter, search, useCompFilter, compYear, compMonth]);

  const fetchStats = useCallback(async () => {
    try {
      const dateParams: Record<string, string> = {};
      if (useCompFilter) {
        const firstDay = new Date(compYear, compMonth, 1);
        const lastDay = new Date(compYear, compMonth + 1, 0, 23, 59, 59);
        dateParams.dateFrom = firstDay.toISOString();
        dateParams.dateTo = lastDay.toISOString();
      }
      const [all, overdue] = await Promise.all([
        api.get('/tasks', { params: { limit: '500', clienteContabilId: clienteId, viewAll: 'true', ...dateParams } }),
        api.get('/tasks', { params: { limit: '500', clienteContabilId: clienteId, viewAll: 'true', dueFilter: 'overdue', ...dateParams } }),
      ]);
      const allTasks: Task[] = all.data?.data || [];
      setStats({
        total: all.data?.total ?? allTasks.length,
        a_fazer: allTasks.filter(t => t.status === 'A_FAZER').length,
        em_progresso: allTasks.filter(t => t.status === 'EM_PROGRESSO').length,
        concluida: allTasks.filter(t => t.status === 'CONCLUIDA').length,
        vencidas: overdue.data?.total ?? 0,
      });
    } catch {}
  }, [clienteId, useCompFilter, compYear, compMonth]);

  useEffect(() => {
    api.get('/users?limit=100').then(r => {
      const data = r.data?.data || r.data?.users || r.data || [];
      setUsers(data.filter((u: any) => u.roles?.length > 0 || u.role));
    }).catch(() => {});
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    setPage(1);
    fetchTasks(1);
  }, [fetchTasks]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleSearchInput = (v: string) => {
    setSearchInput(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(v), 350);
  };

  const handleCycleStatus = async (task: Task) => {
    const newStatus = STATUS_CYCLE[task.status] ?? 'A_FAZER';
    try {
      await api.patch(`/tasks/${task.id}/status`, { status: newStatus });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
      fetchStats();
      showSuccess(`Tarefa movida para "${STATUS_CONFIG[newStatus]?.label}"`);
    } catch {
      showError('Erro ao atualizar status');
    }
  };

  const SETOR_OPTIONS = [
    { value: 'FISCAL',   label: 'Fiscal',   icon: '📊' },
    { value: 'PESSOAL',  label: 'Pessoal',  icon: '👷' },
    { value: 'CONTABIL', label: 'Contábil', icon: '📒' },
  ];

  const handleSetorChange = (setor: string) => {
    setNewSetor(setor);
    if (!setor) return;
    const ficha = cliente?.lead?.ficha_contabil;
    if (!ficha) return;
    const respMap: Record<string, string | undefined> = {
      FISCAL:   ficha.resp_fiscal,
      PESSOAL:  ficha.resp_pessoal,
      CONTABIL: ficha.resp_contabil,
    };
    const userId = respMap[setor];
    if (userId) setNewAssigned(userId);
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await api.post('/tasks', {
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
        due_at: newDue ? new Date(`${newDue}T18:00:00`).toISOString() : undefined,
        assigned_user_id: newAssigned || undefined,
        cliente_contabil_id: clienteId,
        setor: newSetor || undefined,
        recorrente: newRecorrente || undefined,
        recorrencia_meses: newRecorrente && newRecorrenciaTipo === 'meses' ? newRecorrenciaMeses : undefined,
      });
      const msg = newRecorrente
        ? newRecorrenciaTipo === 'infinito'
          ? 'Tarefa recorrente criada (nova cópia todo mês)'
          : `Tarefa criada com ${newRecorrenciaMeses} repetições mensais`
        : 'Tarefa criada';
      showSuccess(msg);
      setNewTitle(''); setNewDesc(''); setNewDue(''); setNewAssigned(''); setNewSetor('');
      setNewRecorrente(false); setNewRecorrenciaTipo('meses'); setNewRecorrenciaMeses(12);
      setShowNew(false);
      fetchTasks(1);
      fetchStats();
    } catch {
      showError('Erro ao criar tarefa');
    } finally {
      setCreating(false);
    }
  };

  const resetFilters = () => {
    setStatusFilter(''); setDueFilter('');
    setAssignedFilter(''); setSearch(''); setSearchInput('');
  };

  const fetchNba = async () => {
    setNbaLoading(true);
    try {
      const overdueTasks = tasks.filter(t =>
        t.due_at && new Date(t.due_at) < new Date() && t.status !== 'CONCLUIDA' && t.status !== 'CANCELADA'
      );
      const topTask = overdueTasks[0] ?? tasks[0];
      const res = await api.post('/tasks/next-action', {
        title: topTask?.title,
        description: topTask?.description,
        recentTasks: tasks.slice(0, 5).map(t => `${t.title} [${STATUS_CONFIG[t.status]?.label}]`),
        assignedTo: topTask?.assigned_user?.name,
      });
      setNba(res.data);
    } catch {
      showError('Erro ao consultar IA');
    } finally {
      setNbaLoading(false);
    }
  };

  const handleGerar = async () => {
    if (!gerarForm.regime) return;
    setGerando(true);
    setGerarResult(null);
    try {
      const token = localStorage.getItem('token');
      const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:44001/api';
      const res = await fetch(`${API}/obrigacoes/cliente/${clienteId}/gerar-por-regime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(gerarForm),
      });
      const data = await res.json();
      setGerarResult({ criadas: data.criadas ?? 0 });
      fetchTasks(1);
      fetchStats();
    } finally {
      setGerando(false);
    }
  };

  const hasFilters = statusFilter || dueFilter || assignedFilter || search;

  // ─── Atalhos de teclado ───────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable;
      if (isEditable) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setShowNew(v => !v); }
      if (e.key === 'Escape') {
        if (drawerTaskId) setDrawerTaskId(null);
        else if (showNew) setShowNew(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [drawerTaskId, showNew]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">

      {/* ── Header ── */}
      <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border bg-card/40">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <CheckSquare size={18} className="text-primary" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground">Tarefas</h1>
              <p className="text-xs text-muted-foreground">{total} tarefa{total !== 1 ? 's' : ''} {hasFilters ? 'filtradas' : 'no total'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowGerarModal(true); setGerarResult(null); }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-accent transition-colors"
              title="Gerar obrigações fiscais por regime"
            >
              ⚡ Gerar por regime
            </button>
            <button
              onClick={() => setShowNew(v => !v)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Plus size={15} />
              Nova tarefa
            </button>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-5 gap-2">
          {[
            { label: 'Total',        value: stats.total,        color: 'text-foreground', click: '' },
            { label: 'A Fazer',      value: stats.a_fazer,      color: 'text-blue-400',   click: 'A_FAZER' },
            { label: 'Em Progresso', value: stats.em_progresso, color: 'text-amber-400',  click: 'EM_PROGRESSO' },
            { label: 'Concluídas',   value: stats.concluida,    color: 'text-green-400',  click: 'CONCLUIDA' },
            { label: '⚠️ Vencidas',  value: stats.vencidas,     color: 'text-red-400',    click: 'overdue' },
          ].map(s => (
            <button
              key={s.label}
              onClick={() => {
                if (s.click === 'overdue') { setDueFilter('overdue'); setStatusFilter(''); }
                else { setStatusFilter(prev => prev === s.click ? '' : s.click); setDueFilter(''); }
              }}
              className={`flex flex-col items-center p-2.5 rounded-xl border transition-all hover:shadow-sm ${
                (statusFilter === s.click && s.click) || (dueFilter === 'overdue' && s.click === 'overdue')
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border bg-card/60 hover:bg-accent/50'
              }`}
            >
              <span className={`text-lg font-bold ${s.color}`}>{s.value}</span>
              <span className="text-[10px] text-muted-foreground mt-0.5 text-center leading-tight">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Próxima Ação IA ── */}
      <div className="shrink-0 px-6 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles size={13} className="text-primary" />
            <span className="font-semibold text-foreground">Próxima Ação IA</span>
          </div>

          {!nba && !nbaLoading && (
            <button
              onClick={fetchNba}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
            >
              <Zap size={11} />
              Analisar tarefas
            </button>
          )}

          {nbaLoading && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              Consultando IA...
            </div>
          )}

          {nba && nba.acao && (
            <div className="flex-1 flex items-center gap-3 min-w-0">
              <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                nba.urgencia === 'alta' ? 'bg-red-500/15 text-red-400' :
                nba.urgencia === 'media' ? 'bg-amber-500/15 text-amber-400' :
                'bg-green-500/15 text-green-400'
              }`}>
                {nba.urgencia === 'alta' ? '🔴' : nba.urgencia === 'media' ? '🟡' : '🟢'} {nba.urgencia.charAt(0).toUpperCase() + nba.urgencia.slice(1)}
              </span>
              <span className="text-xs font-semibold text-foreground truncate">{nba.acao}</span>
              <span className="text-[10px] text-muted-foreground truncate hidden sm:block">{nba.justificativa}</span>
              <button onClick={() => setNba(null)} className="shrink-0 text-muted-foreground hover:text-foreground ml-auto">
                <X size={12} />
              </button>
            </div>
          )}

          {nba && !nba.acao && (
            <span className="text-xs text-muted-foreground">{nba.justificativa}</span>
          )}
        </div>
      </div>

      {/* ── Formulário nova tarefa ── */}
      {showNew && (
        <div className="shrink-0 px-6 py-4 border-b border-border bg-accent/20">
          <div className="max-w-2xl space-y-2.5">
            <input
              autoFocus
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Título da tarefa *"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <textarea
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              placeholder="Descrição (opcional)"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
            />
            <div className="flex gap-2 flex-wrap items-center">
              <select
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                value={newSetor}
                onChange={e => handleSetorChange(e.target.value)}
              >
                <option value="">Setor (opcional)</option>
                {SETOR_OPTIONS.map(s => (
                  <option key={s.value} value={s.value}>{s.icon} {s.label}</option>
                ))}
              </select>
              <input
                type="date"
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                value={newDue}
                onChange={e => setNewDue(e.target.value)}
              />
              {/* Repetição inline */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-background">
                <label className="flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 accent-primary"
                    checked={newRecorrente}
                    onChange={e => setNewRecorrente(e.target.checked)}
                  />
                  <span className="text-xs text-muted-foreground">Repetir</span>
                </label>
                {newRecorrente && (
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 cursor-pointer select-none">
                      <input type="radio" name="recorrencia-tab" className="accent-primary" checked={newRecorrenciaTipo === 'meses'} onChange={() => setNewRecorrenciaTipo('meses')} />
                      <input
                        type="number"
                        min={1} max={120}
                        className="w-14 px-2 py-0.5 rounded-lg border border-border bg-background text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                        value={newRecorrenciaMeses}
                        onChange={e => setNewRecorrenciaMeses(Math.max(1, Math.min(120, Number(e.target.value))))}
                        disabled={newRecorrenciaTipo !== 'meses'}
                        onClick={() => setNewRecorrenciaTipo('meses')}
                      />
                      <span className="text-xs text-muted-foreground">meses</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer select-none">
                      <input type="radio" name="recorrencia-tab" className="accent-primary" checked={newRecorrenciaTipo === 'infinito'} onChange={() => setNewRecorrenciaTipo('infinito')} />
                      <span className="text-xs text-muted-foreground">∞</span>
                    </label>
                  </div>
                )}
              </div>
              <div className="flex-1 relative min-w-[160px]">
                <select
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  value={newAssigned}
                  onChange={e => setNewAssigned(e.target.value)}
                >
                  <option value="">Responsável (opcional)</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <button onClick={() => { setShowNew(false); setNewSetor(''); setNewRecorrente(false); }} className="px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-accent transition-colors">
                <X size={14} />
              </button>
              <button
                onClick={handleCreate}
                disabled={!newTitle.trim() || creating}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Navegador de competência ── */}
      <div className="shrink-0 px-6 py-2 border-b border-border bg-card/30 flex items-center gap-3">
        <button
          onClick={() => setUseCompFilter(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            useCompFilter ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-accent'
          }`}
        >
          <CalendarDays size={12} />
          Competência
        </button>
        {useCompFilter && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                if (compMonth === 0) { setCompMonth(11); setCompYear(y => y - 1); }
                else setCompMonth(m => m - 1);
              }}
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-bold text-foreground min-w-[110px] text-center">
              {new Date(compYear, compMonth).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
            <button
              onClick={() => {
                if (compMonth === 11) { setCompMonth(0); setCompYear(y => y + 1); }
                else setCompMonth(m => m + 1);
              }}
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => { setCompMonth(now.getMonth()); setCompYear(now.getFullYear()); }}
              className="ml-1 px-2 py-1 rounded text-[10px] text-primary hover:bg-primary/10 transition-colors font-semibold"
            >
              Hoje
            </button>
          </div>
        )}
      </div>

      {/* ── Filtros ── */}
      <div className="shrink-0 px-6 py-3 border-b border-border bg-card/20 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(['', 'A_FAZER', 'EM_PROGRESSO', 'CONCLUIDA', 'CANCELADA'] as const).map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setDueFilter(''); }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === s && !dueFilter
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {s === '' ? 'Todas' : STATUS_CONFIG[s]?.label}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-border" />

        {['today', 'week', 'overdue'].map(chip => (
          <button
            key={chip}
            onClick={() => { setDueFilter(prev => prev === chip ? '' : chip); setStatusFilter(''); }}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              dueFilter === chip
                ? 'bg-accent text-foreground border border-border'
                : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            {chip === 'today' ? 'Hoje' : chip === 'week' ? 'Esta semana' : '⚠️ Vencidas'}
          </button>
        ))}

        <div className="h-4 w-px bg-border" />

        <div className="relative">
          <select
            value={assignedFilter}
            onChange={e => setAssignedFilter(e.target.value)}
            className="pl-3 pr-7 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30 appearance-none"
          >
            <option value="">Todos os responsáveis</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>

        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={e => handleSearchInput(e.target.value)}
            placeholder="Buscar tarefa..."
            className="pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/30 w-48"
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(''); setSearch(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={11} />
            </button>
          )}
        </div>

        {hasFilters && (
          <button onClick={resetFilters} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <RotateCcw size={11} />
            Limpar
          </button>
        )}

        <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground/50 select-none">
          <span><kbd className="px-1 py-0.5 rounded bg-accent/60 font-mono text-[9px]">N</kbd> nova</span>
          <span><kbd className="px-1 py-0.5 rounded bg-accent/60 font-mono text-[9px]">Esc</kbd> fechar</span>
        </div>
      </div>

      {/* ── Lista ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading && page === 1 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-primary/40" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-accent/50 flex items-center justify-center">
              <CheckSquare size={24} className="text-muted-foreground/30" />
            </div>
            <p className="text-sm text-muted-foreground">
              {hasFilters ? 'Nenhuma tarefa com esses filtros' : 'Nenhuma tarefa ainda'}
            </p>
            {hasFilters && (
              <button onClick={resetFilters} className="text-xs text-primary hover:underline">
                Limpar filtros
              </button>
            )}
            {!hasFilters && (
              <button onClick={() => setShowNew(true)} className="text-xs text-primary hover:underline">
                + Criar primeira tarefa
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {tasks.map(task => {
              const cfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.A_FAZER;
              const dueInfo = formatDue(task.due_at);
              const isDone = task.status === 'CONCLUIDA' || task.status === 'CANCELADA';

              return (
                <div
                  key={task.id}
                  className={`flex items-start gap-3 px-6 py-3.5 hover:bg-accent/20 transition-colors group cursor-pointer ${isDone ? 'opacity-60' : ''}`}
                  onClick={() => setDrawerTaskId(task.id)}
                >
                  <button
                    onClick={e => { e.stopPropagation(); handleCycleStatus(task); }}
                    className="mt-0.5 shrink-0 transition-transform hover:scale-110"
                    title={`Status: ${cfg.label} — clique para avançar`}
                  >
                    {isDone
                      ? <CheckCircle2 size={18} className="text-green-400" />
                      : <Circle size={18} className="text-muted-foreground/40 hover:text-primary transition-colors" />
                    }
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        {task.title}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>

                    {task.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.description}</p>
                    )}

                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {dueInfo && (
                        <span className={`flex items-center gap-1 text-[11px] font-semibold ${dueInfo.overdue ? 'text-red-400' : 'text-muted-foreground'}`}>
                          {dueInfo.overdue && <AlertTriangle size={10} />}
                          <CalendarDays size={10} />
                          {dueInfo.text}
                        </span>
                      )}
                      {task.assigned_user && (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <User size={10} />
                          {task.assigned_user.name}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0 mt-0.5">
                    {Object.entries(STATUS_CONFIG)
                      .filter(([k]) => k !== task.status)
                      .map(([k, v]) => (
                        <button
                          key={k}
                          onClick={e => {
                            e.stopPropagation();
                            api.patch(`/tasks/${task.id}/status`, { status: k }).then(() => {
                              setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: k } : t));
                              fetchStats();
                            });
                          }}
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full border border-border hover:bg-accent transition-colors ${v.color}`}
                          title={`Mover para ${v.label}`}
                        >
                          {v.label}
                        </button>
                      ))}
                  </div>
                </div>
              );
            })}

            {tasks.length < total && (
              <div className="px-6 py-4 text-center">
                <button
                  onClick={() => { const next = page + 1; setPage(next); fetchTasks(next); }}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {loading ? <Loader2 size={13} className="animate-spin" /> : <List size={13} />}
                  Carregar mais ({total - tasks.length} restantes)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Task Detail Drawer ── */}
      {drawerTaskId && (
        <TaskDrawer
          taskId={drawerTaskId}
          onClose={() => setDrawerTaskId(null)}
          onStatusChange={(id, status) => {
            if (status === 'DELETED') {
              fetchTasks(1);
            } else {
              setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
            }
            fetchStats();
          }}
        />
      )}

      {/* ── Modal: Gerar por regime ── */}
      {showGerarModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg mb-1">⚡ Gerar obrigações por regime</h3>
            <p className="text-sm text-base-content/60 mb-4">
              Cria automaticamente as obrigações fiscais padrão com base no regime tributário do cliente.
              Obrigações já existentes não serão duplicadas.
            </p>

            <div className="space-y-3">
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Regime Tributário</span></label>
                <select
                  className="select select-bordered select-sm"
                  value={gerarForm.regime}
                  onChange={e => setGerarForm(f => ({ ...f, regime: e.target.value }))}
                >
                  <option value="">Selecionar...</option>
                  {REGIMES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Competência de início</span></label>
                <input
                  className="input input-bordered input-sm"
                  type="month"
                  value={gerarForm.competencia_inicio}
                  onChange={e => setGerarForm(f => ({ ...f, competencia_inicio: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={gerarForm.tem_funcionarios}
                  onChange={e => setGerarForm(f => ({ ...f, tem_funcionarios: e.target.checked }))}
                />
                <span className="text-sm">Incluir obrigações trabalhistas (eSocial, FGTS, Folha…)</span>
              </label>
            </div>

            {gerarResult && (
              <div className={`alert mt-4 ${gerarResult.criadas > 0 ? 'alert-success' : 'alert-info'} text-sm py-2`}>
                {gerarResult.criadas > 0
                  ? `✅ ${gerarResult.criadas} obrigação(ões) criada(s) com sucesso!`
                  : 'ℹ️ Nenhuma obrigação nova criada (já existiam todas para este regime).'}
              </div>
            )}

            <div className="modal-action">
              <button onClick={() => { setShowGerarModal(false); setGerarResult(null); }} className="btn btn-ghost btn-sm">Fechar</button>
              <button
                onClick={handleGerar}
                disabled={gerando || !gerarForm.regime}
                className="btn btn-primary btn-sm"
              >
                {gerando ? <><span className="loading loading-spinner loading-xs" /> Gerando...</> : '⚡ Gerar'}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => { setShowGerarModal(false); setGerarResult(null); }} />
        </div>
      )}
    </div>
  );
}
