'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:44001/api';

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR');
}

function daysUntil(d: string) {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

function urgencyClass(days: number) {
  if (days < 0) return 'border-l-4 border-error bg-error/5';
  if (days <= 3) return 'border-l-4 border-warning bg-warning/5';
  if (days <= 7) return 'border-l-4 border-info bg-info/5';
  return 'border-l-4 border-base-300';
}

function UrgencyBadge({ days }: { days: number }) {
  if (days < 0) return <span className="badge badge-error badge-sm">Vencida</span>;
  if (days === 0) return <span className="badge badge-error badge-sm">Hoje!</span>;
  if (days === 1) return <span className="badge badge-warning badge-sm">Amanhã</span>;
  if (days <= 3) return <span className="badge badge-warning badge-sm">{days}d</span>;
  if (days <= 7) return <span className="badge badge-info badge-sm">{days}d</span>;
  return <span className="badge badge-ghost badge-sm">{days}d</span>;
}

export default function ObrigacoesPage() {
  const [obrigacoes, setObrigacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState(30);

  useEffect(() => { fetchObrigacoes(); }, [dias]);

  async function fetchObrigacoes() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/obrigacoes/vencendo?dias=${dias}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setObrigacoes(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleComplete(id: string) {
    await fetch(`${API}/obrigacoes/${id}/complete`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    fetchObrigacoes();
  }

  const vencidas = obrigacoes.filter(o => daysUntil(o.due_at) < 0).length;
  const hoje = obrigacoes.filter(o => daysUntil(o.due_at) === 0).length;
  const proximas = obrigacoes.filter(o => daysUntil(o.due_at) > 0).length;

  return (
    <div className="flex flex-col h-full bg-base-100">
      <div className="flex items-center justify-between px-6 py-4 border-b border-base-300">
        <div>
          <h1 className="text-xl font-bold">Obrigações Fiscais</h1>
          <p className="text-sm text-base-content/60">{obrigacoes.length} pendentes nos próximos {dias} dias</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-base-content/60">Janela:</span>
          <select value={dias} onChange={e => setDias(parseInt(e.target.value))} className="select select-bordered select-sm">
            <option value={7}>7 dias</option>
            <option value={15}>15 dias</option>
            <option value={30}>30 dias</option>
            <option value={60}>60 dias</option>
          </select>
        </div>
      </div>

      {!loading && (
        <div className="grid grid-cols-3 border-b border-base-300">
          <div className="flex flex-col items-center py-3 border-r border-base-300">
            <span className="text-2xl font-bold text-error">{vencidas}</span>
            <span className="text-xs text-base-content/60">Vencidas</span>
          </div>
          <div className="flex flex-col items-center py-3 border-r border-base-300">
            <span className="text-2xl font-bold text-warning">{hoje}</span>
            <span className="text-xs text-base-content/60">Vencem hoje</span>
          </div>
          <div className="flex flex-col items-center py-3">
            <span className="text-2xl font-bold text-info">{proximas}</span>
            <span className="text-xs text-base-content/60">Próximas</span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex justify-center py-20"><span className="loading loading-spinner loading-lg" /></div>
        ) : obrigacoes.length === 0 ? (
          <div className="text-center py-20 text-base-content/40">
            <p className="text-5xl mb-4">✅</p>
            <p className="font-semibold text-lg">Nenhuma obrigação pendente</p>
            <p className="text-sm mt-2">Todos os prazos estão em dia!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {obrigacoes.map(o => {
              const days = daysUntil(o.due_at);
              return (
                <div key={o.id} className={`rounded-lg p-4 flex items-start gap-4 bg-base-200 ${urgencyClass(days)}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{o.titulo}</span>
                      <UrgencyBadge days={days} />
                      {o.recorrente && <span className="badge badge-ghost badge-sm">🔁</span>}
                    </div>
                    <p className="text-xs text-base-content/60 mt-1">
                      📅 Vence em {formatDate(o.due_at)}
                      {o.competencia && ` · Competência: ${formatDate(o.competencia)}`}
                    </p>
                    <p className="text-xs mt-1">
                      🏢 <a href={`/atendimento/workspace/${o.cliente_id}`} className="link link-primary">
                        {o.cliente?.lead?.name || 'Cliente'}
                      </a>
                      {o.responsavel && <> · 👤 {o.responsavel.name}</>}
                    </p>
                  </div>
                  <button onClick={() => handleComplete(o.id)} className="btn btn-success btn-sm btn-outline shrink-0">
                    ✓ Concluir
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
