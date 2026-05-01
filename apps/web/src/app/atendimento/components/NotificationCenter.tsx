'use client';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X, FileText, AlertTriangle, Calendar, ExternalLink } from 'lucide-react';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';

interface NotifItem {
  id: string;
  type: 'event' | 'task_overdue' | 'payment_overdue';
  title: string;
  subtitle?: string;
  time?: string;
  href?: string;
  urgent?: boolean;
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const router = useRouter();

  // Calcula posição do painel com base no botão (portal fixed)
  const updatePos = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPanelPos({ top: r.top, left: r.right + 8 });
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/dashboard');
      const notifs: NotifItem[] = [];

      // Overdue tasks
      if (data.tasks?.overdue > 0) {
        notifs.push({
          id: 'tasks_overdue',
          type: 'task_overdue',
          title: `${data.tasks.overdue} tarefa${data.tasks.overdue > 1 ? 's' : ''} atrasada${data.tasks.overdue > 1 ? 's' : ''}`,
          subtitle: 'Tarefas vencidas no calendário',
          href: '/atendimento/agenda',
          urgent: true,
        });
      }

      // Upcoming events (next 24h)
      const now = new Date();
      const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      (data.upcomingEvents || [])
        .filter((e: any) => new Date(e.start_at) <= in24h)
        .slice(0, 5)
        .forEach((e: any) => {
          const d = new Date(e.start_at);
          const mins = Math.round((d.getTime() - now.getTime()) / 60000);
          const timeStr = mins < 0 ? 'Iniciado' : mins < 60 ? `em ${mins}min` : `${Math.floor(mins / 60)}h`;
          notifs.push({
            id: e.id,
            type: 'event',
            title: e.title,
            subtitle: e.lead_name ? `Cliente: ${e.lead_name}` : undefined,
            time: timeStr,
            href: '/atendimento/agenda',
            urgent: mins >= 0 && mins <= 30,
          });
        });

      // Overdue payments
      if (data.financials?.overdueCount > 0) {
        notifs.push({
          id: 'payments_overdue',
          type: 'payment_overdue',
          title: `${data.financials.overdueCount} pagamento${data.financials.overdueCount > 1 ? 's' : ''} vencido${data.financials.overdueCount > 1 ? 's' : ''}`,
          subtitle: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.financials.totalOverdue),
          urgent: true,
        });
      }

      setItems(notifs);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  const urgentCount = items.filter(i => i.urgent).length;

  const typeIcon = (type: string) => {
    if (type === 'task_overdue') return <AlertTriangle size={13} className="text-red-400" />;
    if (type === 'payment_overdue') return <FileText size={13} className="text-amber-400" />;
    return <Calendar size={13} className="text-blue-400" />;
  };

  const panel = open ? createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: panelPos.top, left: panelPos.left, zIndex: 9999 }}
      className="w-80 bg-card border border-border rounded-xl shadow-xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-bold text-foreground">Notificações</h3>
        <div className="flex items-center gap-2">
          {loading && <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />}
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {items.length === 0 && !loading ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            <Bell size={24} className="mx-auto mb-2 opacity-30" />
            Nenhuma notificação pendente
          </div>
        ) : (
          items.map(item => (
            <div
              key={item.id}
              onClick={() => { if (item.href) { router.push(item.href); setOpen(false); } }}
              className={`flex items-start gap-3 px-4 py-3 border-b border-border/50 transition-colors ${item.href ? 'cursor-pointer hover:bg-accent/40' : ''} ${item.urgent ? 'bg-red-500/5' : ''}`}
            >
              <div className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${item.urgent ? 'bg-red-500/10' : 'bg-muted'}`}>
                {typeIcon(item.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
                {item.subtitle && <p className="text-[11px] text-muted-foreground truncate">{item.subtitle}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {item.time && <span className="text-[10px] text-muted-foreground font-medium">{item.time}</span>}
                {item.href && <ExternalLink size={10} className="text-muted-foreground/50" />}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="px-4 py-2 border-t border-border text-center">
        <button
          onClick={() => { router.push('/atendimento/dashboard'); setOpen(false); }}
          className="text-[11px] text-primary hover:underline"
        >
          Ver dashboard completo
        </button>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => { const next = !open; setOpen(next); if (next) { updatePos(); load(); } }}
        className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
        title="Centro de notificações"
        aria-label="Notificações"
      >
        <Bell size={16} />
        {urgentCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
            {urgentCount > 9 ? '9+' : urgentCount}
          </span>
        )}
      </button>
      {panel}
    </div>
  );
}
