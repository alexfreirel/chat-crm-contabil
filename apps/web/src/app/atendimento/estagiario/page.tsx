'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RouteGuard } from '@/components/RouteGuard';
import {
  Clock, CheckCircle2, AlertTriangle, FileText, User, Scale,
  ExternalLink, Loader2, RefreshCw, ChevronDown, ChevronRight,
  Sparkles, Send, Play,
} from 'lucide-react';
import api from '@/lib/api';

// ─── Tipos ─────────────────────────────────────────────────────────

interface DashboardData {
  internName: string;
  supervisors: { id: string; name: string }[];
  pending: TaskItem[];
  inReview: PetitionItem[];
  corrections: PetitionItem[];
  completedToday: TaskItem[];
  stats: {
    pendingCount: number;
    inReviewCount: number;
    correctionsCount: number;
    completedTodayCount: number;
    approvalRate: number;
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

interface PetitionItem {
  id: string;
  title: string;
  type: string;
  status: string;
  updated_at: string;
  legal_case: {
    id: string;
    case_number: string | null;
    legal_area: string | null;
    lead: { id: string; name: string | null } | null;
    lawyer: { id: string; name: string } | null;
  } | null;
  versions?: { version: number; created_at: string }[];
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatDate(d: string) {
  const date = new Date(d);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function daysUntil(d: string) {
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { text: `${Math.abs(diff)}d atrasado`, urgent: true };
  if (diff === 0) return { text: 'Hoje', urgent: true };
  if (diff === 1) return { text: 'Amanhã', urgent: false };
  return { text: `em ${diff}d`, urgent: false };
}

const AREA_COLORS: Record<string, string> = {
  Trabalhista: 'bg-blue-500/15 text-blue-400', Civil: 'bg-violet-500/15 text-violet-400',
  Consumidor: 'bg-emerald-500/15 text-emerald-400', Penal: 'bg-red-500/15 text-red-400',
  Família: 'bg-pink-500/15 text-pink-400', Previdenciário: 'bg-amber-500/15 text-amber-400',
  Empresarial: 'bg-cyan-500/15 text-cyan-400', Imobiliário: 'bg-orange-500/15 text-orange-400',
};

const PETITION_TYPES: Record<string, string> = {
  INICIAL: 'Petição Inicial', CONTESTACAO: 'Contestação', REPLICA: 'Réplica',
  EMBARGOS: 'Embargos', RECURSO: 'Recurso', MANIFESTACAO: 'Manifestação', OUTRO: 'Outro',
};

// ─── Componentes ────────────────────────────────────────────────────

function StatBadge({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <div className={`px-3 py-1.5 rounded-lg text-center ${color}`}>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[9px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
    </div>
  );
}

function TaskCard({ task, onAction }: { task: TaskItem; onAction: (id: string, action: string) => void }) {
  const router = useRouter();
  const due = task.start_at ? daysUntil(task.start_at) : null;
  const clientName = task.legal_case?.lead?.name || task.lead?.name || null;
  const clientPhone = task.legal_case?.lead?.phone || task.lead?.phone || null;
  const area = task.legal_case?.legal_area || null;
  const caseNumber = task.legal_case?.case_number || null;
  const lawyerName = task.legal_case?.lawyer?.name || task.created_by?.name || null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            {task.priority === 'URGENTE' && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">URGENTE</span>
            )}
            {area && (
              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${AREA_COLORS[area] || 'bg-gray-500/15 text-gray-400'}`}>
                {area}
              </span>
            )}
            {due && (
              <span className={`text-[9px] font-semibold ${due.urgent ? 'text-red-400' : 'text-muted-foreground'}`}>
                {formatDate(task.start_at)} ({due.text})
              </span>
            )}
          </div>
          <h3 className="text-[13px] font-bold text-foreground leading-tight">{task.title}</h3>
          {task.description && (
            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
            {clientName && (
              <span className="flex items-center gap-1">
                <User size={10} /> {clientName}
                {clientPhone && <span className="font-mono">({clientPhone.slice(-4)})</span>}
              </span>
            )}
            {caseNumber && (
              <span className="flex items-center gap-1 font-mono">
                <Scale size={10} /> {caseNumber.slice(0, 15)}...
              </span>
            )}
            {lawyerName && (
              <span className="opacity-60">Adv: {lawyerName}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          {task.status === 'AGENDADO' && (
            <button
              onClick={() => onAction(task.id, 'start')}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-bold hover:opacity-90 transition-opacity flex items-center gap-1"
            >
              <Play size={10} /> Iniciar
            </button>
          )}
          {task.status === 'CONFIRMADO' && (
            <button
              onClick={() => onAction(task.id, 'complete')}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-bold hover:opacity-90 transition-opacity flex items-center gap-1"
            >
              <CheckCircle2 size={10} /> Concluir
            </button>
          )}
          {task.legal_case?.id && (
            <button
              onClick={() => router.push(`/atendimento/workspace/${task.legal_case!.id}`)}
              className="px-3 py-1.5 rounded-lg bg-accent text-foreground text-[10px] font-medium hover:bg-accent/80 transition-colors flex items-center gap-1"
            >
              <ExternalLink size={10} /> Processo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PetitionCard({ petition, type }: { petition: PetitionItem; type: 'review' | 'correction' }) {
  const router = useRouter();
  const petType = PETITION_TYPES[petition.type] || petition.type;
  const clientName = petition.legal_case?.lead?.name || null;
  const lawyerName = petition.legal_case?.lawyer?.name || null;

  return (
    <div className={`bg-card border rounded-xl p-4 ${
      type === 'correction' ? 'border-amber-500/30 bg-amber-500/5' : 'border-border'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400">{petType}</span>
            {type === 'correction' && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">CORREÇÃO</span>
            )}
            {type === 'review' && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">EM REVISÃO</span>
            )}
          </div>
          <h3 className="text-[13px] font-bold text-foreground leading-tight">{petition.title}</h3>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
            {clientName && <span className="flex items-center gap-1"><User size={10} /> {clientName}</span>}
            {lawyerName && <span className="opacity-60">Revisor: {lawyerName}</span>}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          {petition.legal_case?.id && (
            <button
              onClick={() => router.push(`/atendimento/workspace/${petition.legal_case!.id}`)}
              className="px-3 py-1.5 rounded-lg bg-accent text-foreground text-[10px] font-medium hover:bg-accent/80 transition-colors flex items-center gap-1"
            >
              <FileText size={10} /> Abrir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────

function InternDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/intern/dashboard');
      setData(res.data);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Refresh a cada 60s
  useEffect(() => {
    const interval = setInterval(() => fetchData(), 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleAction = async (eventId: string, action: string) => {
    try {
      if (action === 'start') {
        await api.patch(`/calendar/events/${eventId}/status`, { status: 'CONFIRMADO' });
      } else if (action === 'complete') {
        await api.patch(`/calendar/events/${eventId}/status`, { status: 'CONCLUIDO' });
      }
      fetchData();
    } catch {}
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

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Meu Painel</h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {data.supervisors.length > 0
                ? `Supervisores: ${data.supervisors.map(s => s.name).join(', ')}`
                : 'Nenhum supervisor vinculado'}
            </p>
          </div>
          <button onClick={fetchData} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Stats */}
        <div className="flex gap-3 flex-wrap">
          <StatBadge value={data.stats.pendingCount} label="Pendentes" color="bg-blue-500/10 text-blue-400" />
          <StatBadge value={data.stats.correctionsCount} label="Correções" color="bg-amber-500/10 text-amber-400" />
          <StatBadge value={data.stats.inReviewCount} label="Em Revisão" color="bg-violet-500/10 text-violet-400" />
          <StatBadge value={data.stats.completedTodayCount} label="Hoje" color="bg-emerald-500/10 text-emerald-400" />
          <StatBadge value={`${data.stats.approvalRate}%`} label="Aprovação" color="bg-primary/10 text-primary" />
        </div>

        {/* Correções Solicitadas (destaque) */}
        {data.corrections.length > 0 && (
          <section>
            <h2 className="text-[12px] font-bold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <AlertTriangle size={13} /> Correções Solicitadas ({data.corrections.length})
            </h2>
            <div className="space-y-2">
              {data.corrections.map(p => (
                <PetitionCard key={p.id} petition={p} type="correction" />
              ))}
            </div>
          </section>
        )}

        {/* Pendentes */}
        <section>
          <h2 className="text-[12px] font-bold text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Clock size={13} /> Pendentes ({data.pending.length})
          </h2>
          {data.pending.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-[12px]">Nenhuma tarefa pendente</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.pending.map(t => (
                <TaskCard key={t.id} task={t} onAction={handleAction} />
              ))}
            </div>
          )}
        </section>

        {/* Em Revisão */}
        {data.inReview.length > 0 && (
          <section>
            <h2 className="text-[12px] font-bold text-violet-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Send size={13} /> Em Revisão ({data.inReview.length})
            </h2>
            <div className="space-y-2">
              {data.inReview.map(p => (
                <PetitionCard key={p.id} petition={p} type="review" />
              ))}
            </div>
          </section>
        )}

        {/* Concluídas Hoje */}
        {data.completedToday.length > 0 && (
          <section>
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="text-[12px] font-bold text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              {showCompleted ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <CheckCircle2 size={13} /> Concluídas Hoje ({data.completedToday.length})
            </button>
            {showCompleted && (
              <div className="space-y-2">
                {data.completedToday.map(t => (
                  <div key={t.id} className="bg-card border border-emerald-500/20 rounded-xl p-3 opacity-60">
                    <p className="text-[12px] font-semibold text-foreground">{t.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {t.legal_case?.case_number && `${t.legal_case.case_number.slice(0, 15)}... · `}
                      {t.lead?.name || t.legal_case?.legal_area || ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
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
