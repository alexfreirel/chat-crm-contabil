'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:44001/api';

const TIPOS_LABELS: Record<string, string> = {
  DAS_MENSAL: 'DAS Mensal', PGDAS: 'PGDAS-D', SPED_FISCAL: 'SPED Fiscal',
  EFD_CONTRIB: 'EFD-Contrib', ECF: 'ECF', ECD: 'ECD', DCTF: 'DCTF',
  DEFIS: 'DEFIS', DASN: 'DASN-SIMEI', DIRF: 'DIRF', RAIS: 'RAIS',
  eSocial: 'eSocial', FGTS: 'FGTS', FOLHA: 'Folha', IRPF: 'IRPF',
  NOTA_FISCAL: 'NF', CERTIDAO: 'Certidão', OUTRO: 'Outro',
};

const TIPOS = Object.entries(TIPOS_LABELS).map(([value, label]) => ({ value, label }));
const REGIMES = ['MEI', 'SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL'];

function daysUntil(d: string) {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

function UrgencyBadge({ days }: { days: number }) {
  if (days < 0)  return <span className="badge badge-error   badge-xs">Vencida {Math.abs(days)}d</span>;
  if (days === 0) return <span className="badge badge-error   badge-xs">Hoje!</span>;
  if (days === 1) return <span className="badge badge-warning badge-xs">Amanhã</span>;
  if (days <= 5) return <span className="badge badge-warning badge-xs">{days}d</span>;
  return              <span className="badge badge-ghost   badge-xs">{days}d</span>;
}

const emptyForm = () => ({
  tipo: '', titulo: '', due_at: '', competencia: '',
  recorrente: false, frequencia: 'MENSAL', alert_days: 3,
});

export default function TabObrigacoes({
  clienteId, cliente, onRefresh,
}: {
  clienteId: string;
  cliente?: any;
  onRefresh: () => void;
}) {
  const [obrigacoes, setObrigacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showGerarModal, setShowGerarModal] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [gerarForm, setGerarForm] = useState({
    regime: cliente?.regime_tributario || '',
    tem_funcionarios: cliente?.lead?.ficha_contabil?.tem_funcionarios ?? false,
    competencia_inicio: new Date().toISOString().slice(0, 7),
  });
  const [gerando, setGerando] = useState(false);
  const [gerarResult, setGerarResult] = useState<{ criadas: number } | null>(null);

  useEffect(() => { fetch_(); }, [clienteId]);

  // Sincronizar regime com dados do cliente ao montar
  useEffect(() => {
    if (cliente?.regime_tributario) {
      setGerarForm(f => ({ ...f, regime: cliente.regime_tributario }));
    }
    if (cliente?.lead?.ficha_contabil?.tem_funcionarios !== undefined) {
      setGerarForm(f => ({ ...f, tem_funcionarios: cliente.lead.ficha_contabil.tem_funcionarios }));
    }
  }, [cliente]);

  async function fetch_() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/obrigacoes/cliente/${clienteId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setObrigacoes(Array.isArray(await res.json()) ? await res.json() : []);
    } catch {
      // retry once
      try {
        const res = await fetch(`${API}/obrigacoes/cliente/${clienteId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        const data = await res.json();
        setObrigacoes(Array.isArray(data) ? data : []);
      } catch { setObrigacoes([]); }
    } finally { setLoading(false); }
  }

  async function handleCreate() {
    if (!form.tipo || !form.titulo || !form.due_at) return;
    await fetch(`${API}/obrigacoes/cliente/${clienteId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(form),
    });
    setForm(emptyForm());
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

  async function handleUncomplete(id: string) {
    await fetch(`${API}/obrigacoes/${id}/uncomplete`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    fetch_();
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta obrigação?')) return;
    await fetch(`${API}/obrigacoes/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    fetch_();
  }

  async function handleGerar() {
    if (!gerarForm.regime) return;
    setGerando(true);
    setGerarResult(null);
    try {
      const res = await fetch(`${API}/obrigacoes/cliente/${clienteId}/gerar-por-regime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(gerarForm),
      });
      const data = await res.json();
      setGerarResult({ criadas: data.criadas ?? 0 });
      fetch_();
    } finally { setGerando(false); }
  }

  const pendentes  = obrigacoes.filter(o => !o.completed);
  const concluidas = obrigacoes.filter(o => o.completed);

  // Contadores de urgência
  const vencidas = pendentes.filter(o => daysUntil(o.due_at) < 0).length;
  const proximas = pendentes.filter(o => daysUntil(o.due_at) >= 0 && daysUntil(o.due_at) <= 7).length;

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <h3 className="font-bold text-base">Obrigações Fiscais</h3>
          <p className="text-xs text-base-content/50 mt-0.5">
            {pendentes.length} pendente{pendentes.length !== 1 ? 's' : ''}
            {vencidas > 0 && <span className="text-error font-bold"> · {vencidas} vencida{vencidas !== 1 ? 's' : ''}</span>}
            {proximas > 0 && <span className="text-warning font-bold"> · {proximas} nos próximos 7 dias</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setShowGerarModal(true); setGerarResult(null); }}
            className="btn btn-ghost btn-sm border border-base-300"
          >
            ⚡ Gerar por regime
          </button>
          <button onClick={() => setShowForm(v => !v)} className="btn btn-primary btn-sm">
            + Adicionar
          </button>
        </div>
      </div>

      {/* Formulário de criação manual */}
      {showForm && (
        <div className="card bg-base-200 border border-base-300 p-4 space-y-3">
          <h4 className="font-bold text-sm">Nova obrigação</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Tipo *</span></label>
              <select className="select select-bordered select-sm" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value, titulo: TIPOS_LABELS[e.target.value] || f.titulo }))}>
                <option value="">Selecionar...</option>
                {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Título *</span></label>
              <input className="input input-bordered input-sm" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: PGDAS Março/2025" />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Vencimento *</span></label>
              <input className="input input-bordered input-sm" type="date" value={form.due_at} onChange={e => setForm(f => ({ ...f, due_at: e.target.value }))} />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Competência (mês de ref.)</span></label>
              <input className="input input-bordered input-sm" type="month" value={form.competencia} onChange={e => setForm(f => ({ ...f, competencia: e.target.value }))} />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Alertar (dias antes)</span></label>
              <input className="input input-bordered input-sm" type="number" min={1} max={30} value={form.alert_days} onChange={e => setForm(f => ({ ...f, alert_days: parseInt(e.target.value) }))} />
            </div>
            <div className="form-control justify-end">
              <label className="flex items-center gap-2 cursor-pointer mt-5">
                <input type="checkbox" className="checkbox checkbox-sm" checked={form.recorrente} onChange={e => setForm(f => ({ ...f, recorrente: e.target.checked }))} />
                <span className="text-sm">Recorrente</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleCreate} disabled={!form.tipo || !form.titulo || !form.due_at} className="btn btn-primary btn-sm">Salvar</button>
            <button onClick={() => { setShowForm(false); setForm(emptyForm()); }} className="btn btn-ghost btn-sm">Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista pendentes */}
      {loading ? (
        <div className="flex justify-center py-10"><span className="loading loading-spinner" /></div>
      ) : (
        <>
          {pendentes.length === 0 && !showForm && (
            <div className="text-center py-8 text-base-content/40">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-sm font-medium">Sem obrigações pendentes</p>
              <p className="text-xs mt-1">Clique em &quot;Gerar por regime&quot; para criar automaticamente</p>
            </div>
          )}
          <div className="space-y-2">
            {pendentes.map(o => {
              const days = daysUntil(o.due_at);
              const isOverdue = days < 0;
              return (
                <div
                  key={o.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    isOverdue
                      ? 'bg-error/5 border-error/30 border-l-4 border-l-error'
                      : days <= 5
                      ? 'bg-warning/5 border-warning/20 border-l-4 border-l-warning'
                      : 'bg-base-200 border-base-300'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{o.titulo}</span>
                      <UrgencyBadge days={days} />
                      {o.recorrente && <span className="badge badge-ghost badge-xs">🔁</span>}
                      <span className="badge badge-outline badge-xs">{TIPOS_LABELS[o.tipo] || o.tipo}</span>
                    </div>
                    <p className="text-xs text-base-content/50 mt-0.5">
                      Vence {new Date(o.due_at).toLocaleDateString('pt-BR')}
                      {o.competencia && ` · Ref: ${new Date(o.competencia).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}`}
                      {o.responsavel && ` · 👤 ${o.responsavel.name}`}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleComplete(o.id)}
                      className="btn btn-success btn-xs btn-outline"
                      title="Marcar como concluída"
                    >✓</button>
                    <button
                      onClick={() => handleDelete(o.id)}
                      className="btn btn-ghost btn-xs text-error"
                      title="Remover"
                    >✕</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Concluídas */}
          {concluidas.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-base-content/50 py-1 hover:text-base-content">
                ✅ {concluidas.length} concluída{concluidas.length !== 1 ? 's' : ''}
              </summary>
              <div className="space-y-1.5 mt-2 pl-2">
                {concluidas.map(o => (
                  <div key={o.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-base-200/50 opacity-60 hover:opacity-80">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm line-through">{o.titulo}</span>
                      {o.completed_at && (
                        <span className="text-xs text-base-content/40 ml-2">
                          {new Date(o.completed_at).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <span className="badge badge-success badge-xs">✓</span>
                      <button onClick={() => handleUncomplete(o.id)} className="btn btn-ghost btn-xs" title="Desfazer">↩</button>
                      <button onClick={() => handleDelete(o.id)} className="btn btn-ghost btn-xs text-error" title="Remover">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {/* Modal: Gerar por regime */}
      {showGerarModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg mb-1">⚡ Gerar obrigações por regime</h3>
            <p className="text-sm text-base-content/60 mb-4">
              Cria automaticamente as obrigações padrão com base no regime tributário do cliente.
              Obrigações já existentes não serão duplicadas.
            </p>

            <div className="space-y-3">
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Regime Tributário</span></label>
                <select
                  className="select select-bordered select-sm"
                  value={gerarForm.regime}
                  onChange={e => setGerarForm(f => ({ ...f, regime: e.target.value }))}
                >
                  <option value="">Selecionar...</option>
                  {REGIMES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Competência de início</span></label>
                <input
                  className="input input-bordered input-sm"
                  type="month"
                  value={gerarForm.competencia_inicio}
                  onChange={e => setGerarForm(f => ({ ...f, competencia_inicio: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={gerarForm.tem_funcionarios}
                  onChange={e => setGerarForm(f => ({ ...f, tem_funcionarios: e.target.checked }))}
                />
                <span className="text-sm">Incluir obrigações trabalhistas (eSocial, FGTS, Folha…)</span>
              </label>
            </div>

            {gerarResult && (
              <div className={`alert mt-4 ${gerarResult.criadas > 0 ? 'alert-success' : 'alert-info'} text-sm py-2`}>
                {gerarResult.criadas > 0
                  ? `✅ ${gerarResult.criadas} obrigação(ões) criada(s) com sucesso!`
                  : 'ℹ️ Nenhuma obrigação nova criada (já existiam todas para este regime).'}
              </div>
            )}

            <div className="modal-action">
              <button onClick={() => { setShowGerarModal(false); setGerarResult(null); }} className="btn btn-ghost btn-sm">Fechar</button>
              <button
                onClick={handleGerar}
                disabled={gerando || !gerarForm.regime}
                className="btn btn-primary btn-sm"
              >
                {gerando ? <><span className="loading loading-spinner loading-xs" /> Gerando...</> : '⚡ Gerar'}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => { setShowGerarModal(false); setGerarResult(null); }} />
        </div>
      )}
    </div>
  );
}
