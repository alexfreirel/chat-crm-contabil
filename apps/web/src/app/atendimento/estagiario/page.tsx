'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { RouteGuard } from '@/components/RouteGuard';
import {
  Clock, CheckCircle2, AlertTriangle, FileText, User,
  Loader2, ChevronDown, ChevronRight,
  Send, Trophy, Zap,
} from 'lucide-react';
import api from '@/lib/api';

// ─── Tipos ─────────────────────────────────────────────────────

interface DashboardData {
  internName: string;
  supervisors: { id: string; name: string }[];
  pending: TaskItem[];
  completedToday: TaskItem[];
  stats: {
    pendingCount: number;
    completedTodayCount: number;
  };
}

interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  start_at: string;
  priority: string;
  lead: { id: string; name: string | null; phone: string } | null;
  legal_case: {
    id: string;
    case_number: string | null;
    legal_area: string | null;
    stage: string;
    tracking_stage: string | null;
    opposing_party: string | null;
    lead: { id: string; name: string | null; phone: string } | null;
    lawyer: { id: string; name: string } | null;
  } | null;
  created_by: { id: string; name: string } | null;
}

// ─── Helpers ────────────────────────────────────────────────────

function daysUntil(d: string) {
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { text: `${Math.abs(diff)}d atrasado`, urgent: true, overdue: true };
  if (diff === 0) return { text: 'Hoje', urgent: true, overdue: false };
  if (diff === 1) return { text: 'Amanha', urgent: false, overdue: false };
  return { text: `em ${diff}d`, urgent: false, overdue: false };
}

function sortByUrgency(tasks: TaskItem[]): TaskItem[] {
  return [...tasks].sort((a, b) => {
    const aUrgente = a.priority === 'URGENTE' ? 0 : 1;
    const bUrgente = b.priority === 'URGENTE' ? 0 : 1;
    if (aUrgente !== bUrgente) return aUrgente - bUrgente;
    if (a.start_at && b.start_at) return new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
    if (a.start_at) return -1;
    if (b.start_at) return 1;
    return 0;
  });
}

// ─── Componentes ────────────────────────────────────────────────

function StatBadge({
  value, label, color, onClick,
}: {
  value: number | string; label: string; color: string; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-center transition-opacity ${color} ${onClick ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
    >
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[9px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
    </button>
  );
}

function TaskCard({
  task, onAction, dimmed = false,
}: {
  task: TaskItem; onAction: (id: string, action: string) => void; dimmed?: boolean;
}) {
  const router = useRouter();
  const due = task.start_at ? daysUntil(task.start_at) : null;
  const clientName = task.legal_case?.lead?.name || task.lead?.name || null;
  const clientPhone = task.legal_case?.lead?.phone || task.lead?.phone || null;
  const area = task.legal_case?.legal_area || null;
  const caseNumber = task.legal_case?.case_number || null;
  const lawyerName = task.legal_case?.lawyer?.name || task.created_by?.name || null;
  const isConfirmado = task.status === 'CONFIRMADO';
  const isUrgent = task.priority === 'URGENTE' || due?.urgent;
  const [confirming, setConfirming] = useState(false);

  const handleComplete = () => {
    if (!confirming) { setConfirming(true); return; }
    setConfirming(false);
    onAction(task.id, 'complete');
  };

  const cardBorder = dimmed
    ? 'border-emerald-500/20 opacity-60'
    : isConfirmado
    ? 'border-violet-500/30 bg-violet-500/5'
    : isUrgent
    ? 'border-amber-500/30 bg-amber-500/5'
    : 'border-border hover:border-border/80';

  return (
    <div className={`bg-card border rounded-xl p-4 transition-colors ${cardBorder}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {isUrgent && !dimmed && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">URGENTE</span>
            )}
            {due && !dimmed && (
              <span className={`text-[9px] font-semibold ${due.overdue ? 'text-red-400' : due.urgent ? 'text-amber-400' : 'text-muted-foreground'}`}>
                {due.text}
              </span>
            )}
            {area && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-accent text-muted-foreground">{area}</span>
            )}
          </div>
          <h3 className="text-[13px] font-bold text-foreground leading-tight mb-1">{task.title}</h3>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
            {clientName && (
              <span className="flex items-center gap-1">
                <User size={10} />
                {clientName}
                {clientPhone && <span className="opacity-60">· {clientPhone}</span>}
              </span>
            )}
            {caseNumber && <span className="opacity-60">{caseNumber}</span>}
            {lawyerName && <span className="opacity-50">Adv: {lawyerName}</span>}
          </div>
        </div>
        {!dimmed && (
          <div className="flex flex-col gap-1.5 shrink-0">
            {task.legal_case?.id && (
              <button
                onClick={() => router.push(`/atendimento/workspace/${task.legal_case!.id}`)}
                className="px-2 py-1 rounded-lg bg-accent text-foreground text-[10px] font-medium hover:bg-accent/80 transition-colors flex items-center gap-1"
              >
                <FileText size={10} /> Caso
              </button>
            )}
            {!isConfirmado && (
              <button
                onClick={() => onAction(task.id, 'start')}
                className="px-2 py-1 rounded-lg bg-violet-500/15 text-violet-400 text-[10px] font-medium hover:bg-violet-500/25 transition-colors flex items-center gap-1"
              >
                <Send size={10} /> Iniciar
              </button>
            )}
            <button
              onClick={handleComplete}
              className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-colors flex items-center gap-1 ${
                confirming
                  ? 'bg-emerald-500 text-white'
                  : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
              }`}
            >
              <CheckCircle2 size={10} /> {confirming ? 'Confirmar?' : 'Concluir'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Lista View ──────────────────────────────────────────────────

function ListView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);

  const pendingRef = useRef<HTMLElement>(null);
  const completedRef = useRef<HTMLElement>(null);

  const scrollTo = (ref: React.RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/intern/dashboard');
      setData(res.data);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(() => fetchData(), 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleAction = async (eventId: string, action: string) => {
    setData(prev => {
      if (!prev) return prev;
      if (action === 'start') {
        return {
          ...prev,
          pending: prev.pending.map(t =>
            t.id === eventId ? { ...t, status: 'CONFIRMADO' } : t
          ),
        };
      }
      if (action === 'complete') {
        const task = prev.pending.find(t => t.id === eventId);
        if (!task) return prev;
        return {
          ...prev,
          pending: prev.pending.filter(t => t.id !== eventId),
          completedToday: [{ ...task, status: 'CONCLUIDO' }, ...prev.completedToday],
          stats: {
            ...prev.stats,
            pendingCount: Math.max(0, prev.stats.pendingCount - 1),
            completedTodayCount: prev.stats.completedTodayCount + 1,
          },
        };
      }
      return prev;
    });

    try {
      if (action === 'start') {
        await api.patch(`/calendar/events/${eventId}/status`, { status: 'CONFIRMADO' });
      } else if (action === 'complete') {
        await api.patch(`/calendar/events/${eventId}/status`, { status: 'CONCLUIDO' });
      }
      fetchData();
    } catch {
      fetchData();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <AlertTriangle size={32} className="text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Erro ao carregar painel.</p>
        <button onClick={fetchData} className="text-xs text-primary hover:underline">Tentar novamente</button>
      </div>
    );
  }

  const sortedPending = sortByUrgency(data.pending);

  const urgentTasks = sortedPending.filter(t => {
    if (!t.start_at) return false;
    const due = daysUntil(t.start_at);
    return due.urgent || t.priority === 'URGENTE';
  });

  const totalTasks = data.stats.completedTodayCount + data.stats.pendingCount;

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="max-w-4xl mx-auto px-6 py-4 space-y-6">

        {/* Stats */}
        <div className="flex gap-3 flex-wrap">
          <StatBadge
            value={data.stats.pendingCount}
            label="Pendentes"
            color="bg-blue-500/10 text-blue-400"
            onClick={() => scrollTo(pendingRef)}
          />
          <StatBadge
            value={data.stats.completedTodayCount}
            label="Hoje"
            color="bg-emerald-500/10 text-emerald-400"
            onClick={data.stats.completedTodayCount > 0 ? () => scrollTo(completedRef) : undefined}
          />
        </div>

        {/* Progress bar */}
        {totalTasks > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold text-foreground">Progresso do dia</span>
              <span className="text-[12px] font-bold text-emerald-400">{totalTasks > 0 ? Math.round((data.stats.completedTodayCount / totalTasks) * 100) : 0}%</span>
            </div>
            <div className="w-full h-2 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${totalTasks > 0 ? Math.round((data.stats.completedTodayCount / totalTasks) * 100) : 0}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-muted-foreground">{data.stats.completedTodayCount} concluída{data.stats.completedTodayCount !== 1 ? 's' : ''}</span>
              <span className="text-[10px] text-muted-foreground">{data.stats.pendingCount} restante{data.stats.pendingCount !== 1 ? 's' : ''}</span>
            </div>
          </div>
        )}

        {/* Urgent alert */}
        {urgentTasks.length > 0 && data.stats.pendingCount > 0 && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
            <Zap size={14} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[12px] font-bold text-red-400">
                {urgentTasks.length} tarefa{urgentTasks.length !== 1 ? 's' : ''} urgent{urgentTasks.length !== 1 ? 'es' : 'e'} ou vencendo hoje
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {urgentTasks.map(t => t.title).slice(0, 2).join(', ')}
                {urgentTasks.length > 2 && ` e mais ${urgentTasks.length - 2}`}
              </p>
            </div>
          </div>
        )}

        {/* Pendentes */}
        <section ref={pendingRef}>
          <h2 className="text-[12px] font-bold text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Clock size={13} /> Pendentes ({data.pending.length})
          </h2>
          {sortedPending.length === 0 ? (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3">
              <Trophy size={18} className="text-emerald-400 shrink-0" />
              <div>
                <p className="text-[13px] font-bold text-emerald-400">Nenhuma tarefa pendente</p>
                <p className="text-[11px] text-muted-foreground">Bom trabalho! Você está em dia.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedPending.map(t => (
                <TaskCard key={t.id} task={t} onAction={handleAction} />
              ))}
            </div>
          )}
        </section>

        {/* Concluídas Hoje */}
        {data.completedToday.length > 0 && (
          <section ref={completedRef}>
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="text-[12px] font-bold text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-2 hover:opacity-80 transition-opacity w-full text-left"
            >
              {showCompleted ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <CheckCircle2 size={13} /> Concluídas Hoje ({data.completedToday.length})
            </button>
            {showCompleted && (
              <div className="space-y-2">
                {data.completedToday.map(t => (
                  <TaskCard key={t.id} task={t} onAction={handleAction} dimmed />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────

function InternDashboard() {
  const [headerData, setHeaderData] = useState<{ internName: string; supervisors: { id: string; name: string }[] } | null>(null);

  const fetchHeader = useCallback(async () => {
    try {
      const res = await api.get('/intern/dashboard');
      setHeaderData({ internName: res.data.internName, supervisors: res.data.supervisors });
    } catch {}
  }, []);

  useEffect(() => { fetchHeader(); }, [fetchHeader]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Meu Painel</h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {headerData?.supervisors && headerData.supervisors.length > 0
                ? `Supervisores: ${headerData.supervisors.map(s => s.name).join(', ')}`
                : 'Nenhum supervisor vinculado'}
            </p>
          </div>
        </div>
      </div>

      <ListView />
    </div>
  );
}

export default function EstagiarioPage() {
  return (
    <RouteGuard allowedRoles={['ADMIN', 'ESTAGIARIO']}>
      <InternDashboard />
    </RouteGuard>
  );
}
