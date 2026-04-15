'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:44001/api';

const TIPOS = [
  'DAS_MENSAL','PGDAS','SPED_FISCAL','EFD_CONTRIB','ECF','ECD',
  'DCTF','DEFIS','DASN','DIRF','RAIS','eSocial','FGTS','FOLHA',
  'IRPF','NOTA_FISCAL','CERTIDAO','OUTRO',
];

function daysUntil(d: string) { return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000); }
function urgencyBadge(days: number) {
  if (days < 0) return <span className="badge badge-error badge-xs">Vencida</span>;
  if (days <= 1) return <span className="badge badge-error badge-xs">{days === 0 ? 'Hoje' : 'Amanhã'}</span>;
  if (days <= 5) return <span className="badge badge-warning badge-xs">{days}d</span>;
  return <span className="badge badge-ghost badge-xs">{days}d</span>;
}

export default function TabObrigacoes({ clienteId, onRefresh }: { clienteId: string; onRefresh: () => void }) {
  const [obrigacoes, setObrigacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ tipo: '', titulo: '', due_at: '', recorrente: false, frequencia: 'MENSAL', alert_days: 3 });

  useEffect(() => { fetch_(); }, [clienteId]);

  async function fetch_() {
    setLoading(true);
    const res = await fetch(`${API}/obrigacoes/cliente/${clienteId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    setObrigacoes(await res.json());
    setLoading(false);
  }

  async function handleCreate() {
    await fetch(`${API}/obrigacoes/cliente/${clienteId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(form),
    });
    setShowForm(false);
    fetch_();
  }

  async function handleComplete(id: string) {
    await fetch(`${API}/obrigacoes/${id}/complete`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    fetch_();
  }

  async function handleDelete(id: string) {
    await fetch(`${API}/obrigacoes/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    fetch_();
  }

  const pendentes = obrigacoes.filter(o => !o.completed);
  const concluidas = obrigacoes.filter(o => o.completed);

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div className="flex justify-between items-center">
        <h3 className="font-bold">Obrigações Fiscais</h3>
        <button onClick={() => setShowForm(v => !v)} className="btn btn-primary btn-sm">+ Adicionar</button>
      </div>

      {showForm && (
        <div className="card bg-base-200 border border-base-300 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Tipo</span></label>
              <select className="select select-bordered select-sm" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                <option value="">Selecionar...</option>
                {TIPOS.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Título</span></label>
              <input className="input input-bordered input-sm" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: PGDAS Março/2025" />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Vencimento</span></label>
              <input className="input input-bordered input-sm" type="date" value={form.due_at} onChange={e => setForm(f => ({ ...f, due_at: e.target.value }))} />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Alertar (dias antes)</span></label>
              <input className="input input-bordered input-sm" type="number" min={1} value={form.alert_days} onChange={e => setForm(f => ({ ...f, alert_days: parseInt(e.target.value) }))} />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="checkbox checkbox-sm" checked={form.recorrente} onChange={e => setForm(f => ({ ...f, recorrente: e.target.checked }))} />
            <span className="text-sm">Obrigação recorrente</span>
          </label>
          <div className="flex gap-2">
            <button onClick={handleCreate} className="btn btn-primary btn-sm">Salvar</button>
            <button onClick={() => setShowForm(false)} className="btn btn-ghost btn-sm">Cancelar</button>
          </div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-10"><span className="loading loading-spinner" /></div> : (
        <>
          {pendentes.length === 0 && <p className="text-center text-sm text-base-content/40 py-8">✅ Sem obrigações pendentes</p>}
          <div className="space-y-2">
            {pendentes.map(o => {
              const days = daysUntil(o.due_at);
              return (
                <div key={o.id} className="flex items-center gap-3 p-3 rounded-lg bg-base-200 border border-base-300">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{o.titulo}</span>
                      {urgencyBadge(days)}
                      {o.recorrente && <span className="badge badge-ghost badge-xs">🔁</span>}
                    </div>
                    <p className="text-xs text-base-content/50">{new Date(o.due_at).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => handleComplete(o.id)} className="btn btn-success btn-xs">✓</button>
                    <button onClick={() => handleDelete(o.id)} className="btn btn-ghost btn-xs text-error">✕</button>
                  </div>
                </div>
              );
            })}
          </div>
          {concluidas.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-base-content/60">✅ {concluidas.length} concluída(s)</summary>
              <div className="space-y-2 mt-2">
                {concluidas.map(o => (
                  <div key={o.id} className="flex items-center gap-3 p-3 rounded-lg bg-base-200/50 opacity-60">
                    <span className="text-sm line-through">{o.titulo}</span>
                    <span className="badge badge-success badge-xs ml-auto">✓</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
