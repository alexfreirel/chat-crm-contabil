'use client';

import { useRouter } from 'next/navigation';
import { AlertTriangle, CalendarClock, Users } from 'lucide-react';
import { WidgetCard } from './WidgetCard';
import type { ObrigacaoFiscalItem, TeamMember } from '../types';

/* ─── Obrigações fiscais a vencer ─── */

function daysUntil(iso: string): number {
  const due = new Date(iso);
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

export function ObrigacoesFiscaisWidget({ items }: { items: ObrigacaoFiscalItem[] }) {
  const router = useRouter();
  const sorted = [...items].sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  const overdue = sorted.filter(i => daysUntil(i.due_at) < 0).length;

  return (
    <WidgetCard
      title="Obrigações fiscais a vencer"
      icon={<CalendarClock size={15} className="text-teal-500" />}
      badge={overdue > 0 ? `${overdue} em atraso` : `${sorted.length} pendente${sorted.length !== 1 ? 's' : ''}`}
      linkLabel="Ver agenda"
      linkHref="/atendimento/agenda"
    >
      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma obrigação pendente.</p>
      ) : (
        <div className="space-y-1">
          {sorted.slice(0, 8).map(item => {
            const d = daysUntil(item.due_at);
            const late = d < 0;
            const soon = d >= 0 && d <= 3;
            const label = late ? `${Math.abs(d)}d em atraso` : d === 0 ? 'vence hoje' : d === 1 ? 'vence amanhã' : `em ${d} dias`;
            return (
              <div
                key={item.id}
                onClick={() => item.cliente_contabil_id
                  ? router.push(`/atendimento/workspace/${item.cliente_contabil_id}`)
                  : router.push('/atendimento/agenda')}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${late ? 'bg-red-500' : soon ? 'bg-amber-500' : 'bg-teal-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{item.titulo}</p>
                  {item.lead_name && <p className="text-[10px] text-muted-foreground truncate">{item.lead_name}</p>}
                </div>
                <span className={`text-[10px] font-bold shrink-0 ${late ? 'text-red-500' : soon ? 'text-amber-500' : 'text-muted-foreground'}`}>
                  {late && <AlertTriangle size={10} className="inline mr-0.5 -mt-0.5" />}
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}

/* ─── Carga da equipe (tarefas pendentes / atrasadas por assistente) ─── */

export function TeamLoadWidget({ members }: { members: TeamMember[] }) {
  const assistants = members.filter(m => (m.role === 'ASSISTENTE' || m.role === 'ASSISTENTE_PESSOAL'));
  const rows = (assistants.length > 0 ? assistants : members)
    .map(m => ({ ...m }))
    .sort((a, b) => b.overdueTasks - a.overdueTasks || b.pendingTasks - a.pendingTasks);

  if (rows.length === 0) return null;
  const maxPending = Math.max(...rows.map(r => r.pendingTasks), 1);

  return (
    <WidgetCard
      title="Carga da equipe"
      icon={<Users size={15} className="text-primary" />}
      linkLabel="Ver tarefas"
      linkHref="/atendimento/agenda"
    >
      <table className="w-full">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
            <th className="py-2 text-left font-semibold">Assistente</th>
            <th className="py-2 text-right font-semibold">Conversas</th>
            <th className="py-2 text-left font-semibold pl-4">Tarefas pendentes</th>
            <th className="py-2 text-right font-semibold">Atrasadas</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.userId} className="border-t border-border/50">
              <td className="py-2 text-xs font-medium text-foreground">{r.name}</td>
              <td className="py-2 text-right text-xs text-muted-foreground">{r.openConversations}</td>
              <td className="py-2 pl-4">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.round((r.pendingTasks / maxPending) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-foreground w-6 text-right">{r.pendingTasks}</span>
                </div>
              </td>
              <td className={`py-2 text-right text-xs font-bold ${r.overdueTasks > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                {r.overdueTasks}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </WidgetCard>
  );
}
