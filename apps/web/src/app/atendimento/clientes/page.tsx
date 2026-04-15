'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:44001/api';

const STAGES = [
  { value: '', label: 'Todos' },
  { value: 'ONBOARDING', label: 'Onboarding' },
  { value: 'ATIVO', label: 'Ativos' },
  { value: 'SUSPENSO', label: 'Suspensos' },
  { value: 'ENCERRADO', label: 'Encerrados' },
];

const STAGE_COLORS: Record<string, string> = {
  ONBOARDING: 'bg-blue-100 text-blue-800',
  ATIVO: 'bg-green-100 text-green-800',
  SUSPENSO: 'bg-yellow-100 text-yellow-800',
  ENCERRADO: 'bg-gray-100 text-gray-600',
};

const SERVICE_LABELS: Record<string, string> = {
  BPO_FISCAL: 'BPO Fiscal', BPO_CONTABIL: 'BPO Contábil', DP: 'Dep. Pessoal',
  ABERTURA: 'Abertura', ENCERRAMENTO: 'Encerramento',
  IR_PF: 'IRPF', IR_PJ: 'IRPJ', CONSULTORIA: 'Consultoria', OUTRO: 'Outro',
};

const SERVICE_ICONS: Record<string, string> = {
  BPO_FISCAL: '🧾', BPO_CONTABIL: '📊', DP: '👥', ABERTURA: '🏢',
  ENCERRAMENTO: '🔒', IR_PF: '📋', IR_PJ: '📋', CONSULTORIA: '💡', OUTRO: '📁',
};

export default function ClientesPage() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => { fetchClientes(); }, [stage]);

  async function fetchClientes() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (stage) params.set('stage', stage);
      const res = await fetch(`${API}/clientes-contabil?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setClientes(Array.isArray(data) ? data : (data.data || []));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  const filtered = clientes.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return c.lead?.name?.toLowerCase().includes(s) || c.lead?.phone?.includes(s);
  });

  const counts: Record<string, number> = {
    ONBOARDING: clientes.filter(c => c.stage === 'ONBOARDING').length,
    ATIVO: clientes.filter(c => c.stage === 'ATIVO').length,
    SUSPENSO: clientes.filter(c => c.stage === 'SUSPENSO').length,
    ENCERRADO: clientes.filter(c => c.stage === 'ENCERRADO').length,
  };

  return (
    <div className="flex flex-col h-full bg-base-100">
      <div className="flex items-center justify-between px-6 py-4 border-b border-base-300">
        <div>
          <h1 className="text-xl font-bold">Clientes Contábeis</h1>
          <p className="text-sm text-base-content/60">{filtered.length} cliente(s)</p>
        </div>
      </div>

      {!loading && (
        <div className="grid grid-cols-4 border-b border-base-300">
          {Object.entries(counts).map(([s, n]) => (
            <button key={s} onClick={() => setStage(stage === s ? '' : s)}
              className={`flex flex-col items-center py-3 border-r border-base-300 last:border-r-0 transition-colors ${stage === s ? 'bg-primary/10' : 'hover:bg-base-200'}`}>
              <span className="text-xl font-bold">{n}</span>
              <span className="text-xs text-base-content/60">{STAGES.find(x => x.value === s)?.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-3 px-6 py-3 border-b border-base-300 bg-base-200/40">
        <input type="text" placeholder="Buscar por nome ou telefone..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="input input-bordered input-sm flex-1" />
        <select value={stage} onChange={e => setStage(e.target.value)} className="select select-bordered select-sm">
          {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex justify-center py-20"><span className="loading loading-spinner loading-lg" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-base-content/40">
            <p className="text-5xl mb-4">🏢</p>
            <p className="font-semibold text-lg">Nenhum cliente encontrado</p>
            <p className="text-sm mt-2">Clientes aparecem aqui após conversão de leads</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(c => (
              <a key={c.id} href={`/atendimento/workspace/${c.id}`}
                className="card bg-base-200 border border-base-300 hover:border-primary hover:shadow-md transition-all">
                <div className="card-body p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-2xl">{SERVICE_ICONS[c.service_type] || '📁'}</span>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{c.lead?.name || 'Sem nome'}</p>
                        <p className="text-xs text-base-content/60">{c.lead?.phone}</p>
                      </div>
                    </div>
                    <span className={`badge badge-sm shrink-0 ${STAGE_COLORS[c.stage] || 'badge-ghost'}`}>{c.stage}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="badge badge-primary badge-outline badge-sm">{SERVICE_LABELS[c.service_type] || c.service_type}</span>
                    {c.regime_tributario && (
                      <span className="badge badge-ghost badge-sm text-xs">{c.regime_tributario.replace(/_/g, ' ')}</span>
                    )}
                  </div>
                  <div className="flex justify-between mt-3 text-xs text-base-content/50">
                    <span>👤 {c.accountant?.name || 'Sem especialista'}</span>
                    <span>📋 {c._count?.obrigacoes ?? 0} · 📄 {c._count?.documentos ?? 0}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
