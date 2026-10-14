'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Timer } from 'lucide-react';
import api from '@/lib/api';

type Period = 'day' | 'week' | 'month';

interface TaskTime {
  taskId: string;
  title: string;
  cliente: string | null;
  status: string | null;
  workedMs: number;
  sessions: number;
}

interface AssistantTime {
  user: { id: string; name: string };
  workedMs: number;
  idleMs: number;
  availableMs: number;
  occupancyPct: number;
  current: { taskId: string; title: string; cliente: string | null; since: string } | null;
  tasks: TaskTime[];
}

interface TimeReport {
  expediente: { janelas: string[]; dias: string };
  assistants: AssistantTime[];
}

const PERIODS: { id: Period; label: string }[] = [
  { id: 'day', label: 'Hoje' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mês' },
];

function fmt(ms: number) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}min`;
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

// Cronômetro da tarefa em execução (mostra o tempo corrido desde o início)
function Elapsed({ since }: { since: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  return <>{fmt(Date.now() - new Date(since).getTime())}</>;
}

export function TimeControl({ isManager }: { isManager: boolean }) {
  const [period, setPeriod] = useState<Period>('day');
  const [report, setReport] = useState<TimeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const res = await api.get('/tasks/time-report', { params: { period } });
      setReport(res.data);
    } catch {
      /* mantém o último relatório */
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const assistants = report?.assistants ?? [];

  return (
    <section className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/20 flex-wrap">
        <div>
          <h2 className="text-[12px] font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
            <Timer size={13} className="text-muted-foreground" />
            {isManager ? 'Controle de tempo dos assistentes' : 'Meu controle de tempo'}
          </h2>
          {report && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Expediente {report.expediente.janelas.join(' e ')} · {report.expediente.dias}
            </p>
          )}
        </div>
        <div className="flex items-center bg-accent/60 rounded-xl p-1 gap-0.5">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                period === p.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !report ? (
        <div className="p-6 flex justify-center"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
      ) : assistants.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Nenhum assistente encontrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left font-semibold">Assistente</th>
                <th className="px-3 py-2.5 text-left font-semibold">Agora</th>
                <th className="px-3 py-2.5 text-right font-semibold">Em execução</th>
                <th className="px-3 py-2.5 text-right font-semibold">Ocioso</th>
                <th className="px-3 py-2.5 text-right font-semibold">Ocupação</th>
              </tr>
            </thead>
            <tbody>
              {assistants.map(a => {
                const isOpen = open[a.user.id];
                const color = a.occupancyPct >= 70 ? 'text-emerald-400' : a.occupancyPct >= 40 ? 'text-amber-400' : 'text-red-400';
                return (
                  <Fragment key={a.user.id}>
                    <tr
                      className="border-t border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                      onClick={() => setOpen(prev => ({ ...prev, [a.user.id]: !prev[a.user.id] }))}
                    >
                      <td className="px-4 py-2.5 text-[12px] font-medium text-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          {a.user.name}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[11px]">
                        {a.current ? (
                          <span className="text-emerald-400">
                            <span className="font-semibold">{a.current.title}</span>
                            {a.current.cliente ? <span className="text-muted-foreground"> · {a.current.cliente}</span> : null}
                            <span className="text-muted-foreground"> · <Elapsed since={a.current.since} /></span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Sem tarefa em execução</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[12px] font-semibold text-foreground">{fmt(a.workedMs)}</td>
                      <td className="px-3 py-2.5 text-right text-[12px] font-semibold text-red-400">{fmt(a.idleMs)}</td>
                      <td className={`px-3 py-2.5 text-right text-[12px] font-bold ${color}`}>{a.occupancyPct}%</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-muted/10">
                        <td colSpan={5} className="px-6 py-2">
                          {a.tasks.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground">Nenhuma tarefa executada no período.</p>
                          ) : (
                            <ul className="divide-y divide-border/40">
                              {a.tasks.map(t => (
                                <li key={t.taskId} className="flex items-center justify-between gap-3 py-1.5">
                                  <span className="text-[12px] text-foreground truncate">
                                    {t.title}
                                    {t.cliente ? <span className="text-muted-foreground"> · {t.cliente}</span> : null}
                                  </span>
                                  <span className="text-[11px] font-semibold text-muted-foreground shrink-0">{fmt(t.workedMs)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
