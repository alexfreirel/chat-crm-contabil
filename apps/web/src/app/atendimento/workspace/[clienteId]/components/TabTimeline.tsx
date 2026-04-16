'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:44001/api';

const STAGE_LABELS: Record<string, string> = {
  ONBOARDING: 'Onboarding', ATIVO: 'Ativo', SUSPENSO: 'Suspenso', ENCERRADO: 'Encerrado',
  NOVO: 'Novo', QUALIFICANDO: 'Qualificando', PROPOSTA: 'Proposta', NEGOCIANDO: 'Negociando', FINALIZADO: 'Finalizado', PERDIDO: 'Perdido',
};

const TYPE_ICONS: Record<string, string> = {
  stage_change: '🔄', note: '📝', service_stage: '📊', service_event: '📅',
};

export default function TabTimeline({ clienteId, cliente }: { clienteId: string; cliente: any }) {
  const [items, setItems] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const leadId = cliente?.lead?.id;

  useEffect(() => { if (leadId) fetch_(); }, [leadId, clienteId]);

  async function fetch_() {
    setLoading(true);
    const [tlRes, evRes] = await Promise.all([
      fetch(`${API}/leads/${leadId}/timeline`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
      fetch(`${API}/clientes-contabil/${clienteId}/events`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
    ]);
    const [tl, ev] = await Promise.all([tlRes.json(), evRes.json()]);
    setItems(Array.isArray(tl) ? tl : []);
    setEvents(Array.isArray(ev) ? ev : []);
    setLoading(false);
  }

  const all = [
    ...items,
    ...(events.map(e => ({ ...e, type: 'cliente_evento', created_at: e.created_at }))),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (loading) return <div className="flex justify-center py-10"><span className="loading loading-spinner" /></div>;

  return (
    <div className="p-6 max-w-2xl">
      <h3 className="font-bold mb-4">Timeline</h3>
      {all.length === 0 ? (
        <p className="text-center text-sm text-base-content/40 py-8">📈 Nenhum evento registrado ainda</p>
      ) : (
        <div className="relative pl-6 border-l-2 border-base-300 space-y-4">
          {all.map((item, i) => (
            <div key={item.id || i} className="relative">
              <div className="absolute -left-8 top-0 w-4 h-4 rounded-full bg-base-300 border-2 border-base-100 flex items-center justify-center text-xs">
                {TYPE_ICONS[item.type] || '·'}
              </div>
              <div className="bg-base-200 rounded-lg p-3 border border-base-300">
                <div className="flex justify-between items-start">
                  <div className="text-sm">
                    {item.type === 'stage_change' && (
                      <p>Etapa alterada: <span className="font-medium">{STAGE_LABELS[item.from_stage] || item.from_stage || '—'}</span> → <span className="font-medium text-primary">{STAGE_LABELS[item.to_stage] || item.to_stage}</span></p>
                    )}
                    {item.type === 'note' && <p>📝 {item.text}</p>}
                    {item.type === 'service_stage' && (
                      <p>Serviço: {STAGE_LABELS[item.from_stage] || item.from_stage} → {STAGE_LABELS[item.to_stage] || item.to_stage}</p>
                    )}
                    {item.type === 'cliente_evento' && <p>📅 {item.title}{item.description && ` — ${item.description}`}</p>}
                    {item.actor && <p className="text-xs text-base-content/50 mt-0.5">por {item.actor.name}</p>}
                  </div>
                  <span className="text-xs text-base-content/40 ml-2 shrink-0">
                    {new Date(item.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
