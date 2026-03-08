'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity, Loader2, FileText, Calendar, Gavel, MessageSquare,
  ExternalLink, Plus, Trash2,
} from 'lucide-react';
import api from '@/lib/api';
import { showError, showSuccess } from '@/lib/toast';

const EVENT_TYPES = [
  { id: 'MOVIMENTACAO', label: 'Movimentação' },
  { id: 'AUDIENCIA', label: 'Audiência' },
  { id: 'DECISAO', label: 'Decisão' },
  { id: 'DESPACHO', label: 'Despacho' },
  { id: 'PUBLICACAO', label: 'Publicação' },
  { id: 'PRAZO', label: 'Prazo' },
  { id: 'PETICAO', label: 'Petição' },
  { id: 'OUTRO', label: 'Outro' },
];

interface CaseEvent {
  id: string;
  type: string;
  title: string;
  description: string | null;
  source: string | null;
  reference_url: string | null;
  event_date: string | null;
  created_at: string;
}

interface CalendarEvent {
  id: string;
  type: string;
  title: string;
  description: string | null;
  start_at: string;
  status: string;
  assigned_user: { id: string; name: string } | null;
}

interface DjenPublication {
  id: string;
  comunicacao_id: number;
  data_disponibilizacao: string;
  numero_processo: string;
  classe_processual: string | null;
  assunto: string | null;
  tipo_comunicacao: string | null;
  conteudo: string;
  nome_advogado: string | null;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

type TimelineItem = {
  id: string;
  type: 'event' | 'calendar' | 'djen';
  date: string;
  title: string;
  description: string | null;
  extra: Record<string, any>;
};

function getEventIcon(type: string) {
  switch (type.toUpperCase()) {
    case 'DJEN':
    case 'PUBLICACAO':
    case 'DECISAO': return <Gavel className="h-3.5 w-3.5" />;
    case 'AUDIENCIA': return <Calendar className="h-3.5 w-3.5" />;
    case 'PRAZO': return <Calendar className="h-3.5 w-3.5 text-warning" />;
    case 'TAREFA': return <FileText className="h-3.5 w-3.5 text-info" />;
    case 'CONSULTA': return <MessageSquare className="h-3.5 w-3.5 text-success" />;
    default: return <Activity className="h-3.5 w-3.5" />;
  }
}

function getEventColor(type: string): string {
  switch (type.toUpperCase()) {
    case 'DJEN': return 'border-violet-500';
    case 'PUBLICACAO':
    case 'DECISAO': return 'border-secondary';
    case 'AUDIENCIA': return 'border-primary';
    case 'PRAZO': return 'border-warning';
    case 'TAREFA': return 'border-info';
    case 'CONSULTA': return 'border-success';
    default: return 'border-base-300';
  }
}

export default function TabTimeline({ caseId }: { caseId: string }) {
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [djenPublications, setDjenPublications] = useState<DjenPublication[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDjen, setExpandedDjen] = useState<Set<string>>(new Set());
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newType, setNewType] = useState('MOVIMENTACAO');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDate, setNewDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [eventsRes, calRes, djenRes] = await Promise.all([
        api.get(`/legal-cases/${caseId}/events`),
        api.get('/calendar/events', { params: { legalCaseId: caseId } }),
        api.get(`/djen/case/${caseId}`).catch(() => ({ data: [] })),
      ]);
      setEvents(eventsRes.data || []);
      setCalendarEvents(calRes.data || []);
      setDjenPublications(djenRes.data || []);
    } catch {
      showError('Erro ao carregar timeline');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleDjenExpand = (id: string) => {
    setExpandedDjen(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── Create / Delete event ────────────────────────────────

  const handleCreateEvent = async () => {
    if (!newTitle.trim()) {
      showError('Informe o título do evento');
      return;
    }
    setCreating(true);
    try {
      await api.post(`/legal-cases/${caseId}/events`, {
        type: newType,
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
        event_date: newDate ? new Date(newDate).toISOString() : undefined,
      });
      showSuccess('Evento criado');
      setNewTitle('');
      setNewDesc('');
      setNewDate('');
      setNewType('MOVIMENTACAO');
      setShowNewEvent(false);
      fetchData();
    } catch {
      showError('Erro ao criar evento');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Deseja remover este evento?')) return;
    setDeletingId(eventId);
    try {
      await api.delete(`/legal-cases/events/${eventId}`);
      showSuccess('Evento removido');
      fetchData();
    } catch {
      showError('Erro ao remover evento');
    } finally {
      setDeletingId(null);
    }
  };

  // Merge events into unified timeline
  const timeline: TimelineItem[] = [
    ...events.map(e => ({
      id: `event-${e.id}`,
      type: 'event' as const,
      date: e.event_date || e.created_at,
      title: e.title,
      description: e.description,
      extra: {
        eventType: e.type,
        source: e.source,
        referenceUrl: e.reference_url,
        originalId: e.id,
      },
    })),
    ...calendarEvents.map(e => ({
      id: `cal-${e.id}`,
      type: 'calendar' as const,
      date: e.start_at,
      title: e.title,
      description: e.description,
      extra: {
        eventType: e.type,
        status: e.status,
        assignedUser: e.assigned_user,
      },
    })),
    ...djenPublications.map(d => ({
      id: `djen-${d.id}`,
      type: 'djen' as const,
      date: d.data_disponibilizacao,
      title: `DJEN: ${d.tipo_comunicacao || 'Publicação'}`,
      description: d.conteudo,
      extra: {
        eventType: 'DJEN',
        tipoComunicacao: d.tipo_comunicacao,
        classeProcessual: d.classe_processual,
        assunto: d.assunto,
        nomeAdvogado: d.nome_advogado,
        numeroProcesso: d.numero_processo,
      },
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Timeline do Caso
          {timeline.length > 0 && (
            <span className="text-xs text-base-content/50">({timeline.length} eventos)</span>
          )}
        </h2>
        <button
          onClick={() => setShowNewEvent(!showNewEvent)}
          className="btn btn-primary btn-sm gap-1"
        >
          <Plus className="h-3.5 w-3.5" /> Novo Evento
        </button>
      </div>

      {/* Create event form */}
      {showNewEvent && (
        <div className="rounded-lg border border-primary/30 bg-base-200/50 p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Tipo</label>
              <select
                className="select select-bordered select-sm w-full"
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
              >
                {EVENT_TYPES.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label text-xs">Título</label>
              <input
                className="input input-bordered input-sm w-full"
                placeholder="Ex: Audiência de instrução"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <div>
            <label className="label text-xs">Data do evento</label>
            <input
              type="datetime-local"
              className="input input-bordered input-sm w-full md:w-1/2"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </div>
          <textarea
            className="textarea textarea-bordered textarea-sm w-full"
            placeholder="Descrição (opcional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNewEvent(false)} className="btn btn-ghost btn-sm">
              Cancelar
            </button>
            <button
              onClick={handleCreateEvent}
              disabled={!newTitle.trim() || creating}
              className="btn btn-primary btn-sm gap-1"
            >
              {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Criar evento
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : timeline.length === 0 ? (
        <div className="text-center py-12 text-base-content/50">
          <Activity className="h-12 w-12 mx-auto mb-2 opacity-30" />
          <p>Nenhum evento registrado</p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-5 top-0 bottom-0 w-px bg-base-300" />

          <div className="space-y-4">
            {timeline.map((item) => {
              const eventType = item.extra.eventType || '';
              const borderColor = getEventColor(eventType);

              return (
                <div key={item.id} className="relative flex gap-4 pl-2 group">
                  {/* Dot on timeline */}
                  <div className={`relative z-10 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-base-200 border-2 ${borderColor}`}>
                    {getEventIcon(eventType)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-base-content/50">
                        {formatDateTime(item.date)}
                      </span>
                      <span className={`badge badge-xs ${item.type === 'djen' ? 'badge-secondary' : 'badge-outline'}`}>
                        {item.type === 'djen' ? (item.extra.tipoComunicacao || 'DJEN') : eventType}
                      </span>
                      {item.extra.status && (
                        <span className="badge badge-xs badge-ghost">{item.extra.status}</span>
                      )}
                      {item.extra.classeProcessual && (
                        <span className="badge badge-xs badge-outline">{item.extra.classeProcessual}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium mt-0.5">{item.title}</p>

                    {/* DJEN expandable content */}
                    {item.type === 'djen' && item.description && (
                      <div className="mt-1">
                        <p className={`text-xs text-base-content/50 ${expandedDjen.has(item.id) ? '' : 'line-clamp-2'}`}>
                          {item.description}
                        </p>
                        {item.description.length > 150 && (
                          <button
                            onClick={() => toggleDjenExpand(item.id)}
                            className="text-xs text-primary hover:underline mt-0.5"
                          >
                            {expandedDjen.has(item.id) ? 'Ver menos' : 'Ver mais'}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Regular event description */}
                    {item.type !== 'djen' && item.description && (
                      <p className="text-xs text-base-content/50 mt-0.5 line-clamp-3">
                        {item.description}
                      </p>
                    )}

                    {item.extra.source && (
                      <p className="text-xs text-base-content/40 mt-0.5">
                        Fonte: {item.extra.source}
                      </p>
                    )}
                    {item.extra.referenceUrl && (
                      <a
                        href={item.extra.referenceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary mt-0.5 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Ver referência
                      </a>
                    )}
                    {item.extra.assignedUser && (
                      <p className="text-xs text-base-content/40 mt-0.5">
                        Responsável: {item.extra.assignedUser.name}
                      </p>
                    )}
                    {item.extra.nomeAdvogado && (
                      <p className="text-xs text-base-content/40 mt-0.5">
                        Advogado: {item.extra.nomeAdvogado}
                      </p>
                    )}
                  </div>

                  {/* Delete button — only for manual events */}
                  {item.type === 'event' && item.extra.originalId && (
                    <button
                      onClick={() => handleDeleteEvent(item.extra.originalId)}
                      disabled={deletingId === item.extra.originalId}
                      className="opacity-0 group-hover:opacity-100 transition-opacity self-start mt-1 btn btn-ghost btn-xs btn-square text-error"
                      title="Remover evento"
                    >
                      {deletingId === item.extra.originalId
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
