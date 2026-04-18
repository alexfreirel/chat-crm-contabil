'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:44001/api';

const STATUS_COLORS: Record<string, string> = {
  PENDENTE: 'badge-warning',
  PAGO:     'badge-success',
  ATRASADO: 'badge-error',
};

const TIPOS_HONORARIO = [
  { value: 'CONTABILIDADE_MENSAL',    label: 'Contabilidade Mensal',       recorrente: true  },
  { value: 'FOLHA_PAGAMENTO',         label: 'Folha de Pagamento (DP)',     recorrente: true  },
  { value: 'ABERTURA_EMPRESA',        label: 'Abertura de Empresa',         recorrente: false },
  { value: 'ENCERRAMENTO_EMPRESA',    label: 'Encerramento de Empresa',     recorrente: false },
  { value: 'IRPF',                    label: 'IRPF',                        recorrente: false },
  { value: 'CONSULTORIA',             label: 'Consultoria Tributária',      recorrente: false },
  { value: 'PARCELAMENTO',            label: 'Regularização Parcelada',     recorrente: true  },
  { value: 'PLANEJAMENTO_TRIBUTARIO', label: 'Planejamento Tributário',     recorrente: false },
  { value: 'RECUPERACAO_CREDITO',     label: 'Recuperação de Crédito',      recorrente: false },
  { value: 'OUTROS',                  label: 'Outros',                      recorrente: false },
];

const PAYMENT_METHODS = ['PIX', 'BOLETO', 'CARTAO', 'TRANSFERENCIA', 'DINHEIRO', 'CHEQUE'];

function authHeaders(json?: boolean) {
  const h: Record<string, string> = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

function fmtBRL(v: number | string) {
  return `R$ ${parseFloat(String(v)).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function fmtCompetencia(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

export default function TabHonorarios({ clienteId, onRefresh }: { clienteId: string; onRefresh: () => void }) {
  const [honorarios, setHonorarios]   = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activeView, setActiveView]   = useState<'honorarios' | 'inadimplencia'>('honorarios');

  // Modals
  const [showCreate, setShowCreate]           = useState(false);
  const [showParcelas, setShowParcelas]       = useState<string | null>(null); // honorarioId
  const [showReajuste, setShowReajuste]       = useState<string | null>(null);
  const [showAddParcela, setShowAddParcela]   = useState<string | null>(null);

  // Forms
  const [createForm, setCreateForm] = useState({
    tipo: 'CONTABILIDADE_MENSAL', valor: '', dia_vencimento: 10, notas: '',
  });
  const [parcelasForm, setParcelasForm] = useState({ meses: 12, competencia_inicio: '' });
  const [reajusteForm, setReajusteForm] = useState({ percentual: '', motivo: '' });
  const [addParcelaForm, setAddParcelaForm] = useState({
    competencia: '', amount: '', due_date: '', payment_method: '', notas: '',
  });

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => { fetchData(); }, [clienteId]);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/honorarios-contabil/cliente/${clienteId}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      setHonorarios(Array.isArray(data) ? data : []);
    } catch {
      setHonorarios([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    try {
      const res = await fetch(`${API}/honorarios-contabil/cliente/${clienteId}`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ ...createForm, valor: parseFloat(createForm.valor) }),
      });
      if (!res.ok) throw new Error();
      setShowCreate(false);
      setCreateForm({ tipo: 'CONTABILIDADE_MENSAL', valor: '', dia_vencimento: 10, notas: '' });
      showToast('Honorário criado!');
      await fetchData();
      onRefresh();
    } catch { showToast('Erro ao criar honorário', 'error'); }
  }

  async function handleToggleAtivo(h: any) {
    await fetch(`${API}/honorarios-contabil/${h.id}`, {
      method: 'PATCH',
      headers: authHeaders(true),
      body: JSON.stringify({ ativo: !h.ativo }),
    });
    await fetchData();
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover honorário e todas as parcelas?')) return;
    await fetch(`${API}/honorarios-contabil/${id}`, {
      method: 'DELETE', headers: authHeaders(),
    });
    showToast('Removido');
    await fetchData();
    onRefresh();
  }

  async function handleGenerateParcelas() {
    if (!showParcelas) return;
    try {
      const res = await fetch(`${API}/honorarios-contabil/${showParcelas}/gerar-parcelas`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ meses: parcelasForm.meses, competencia_inicio: parcelasForm.competencia_inicio }),
      });
      const data = await res.json();
      showToast(`${data.criadas} parcela(s) gerada(s)!`);
      setShowParcelas(null);
      await fetchData();
    } catch { showToast('Erro ao gerar parcelas', 'error'); }
  }

  async function handleReajuste() {
    if (!showReajuste) return;
    try {
      const res = await fetch(`${API}/honorarios-contabil/${showReajuste}/reajuste`, {
        method: 'PATCH',
        headers: authHeaders(true),
        body: JSON.stringify({ percentual: parseFloat(reajusteForm.percentual), motivo: reajusteForm.motivo }),
      });
      if (!res.ok) throw new Error();
      showToast('Reajuste aplicado!');
      setShowReajuste(null);
      setReajusteForm({ percentual: '', motivo: '' });
      await fetchData();
    } catch { showToast('Erro ao aplicar reajuste', 'error'); }
  }

  async function handleAddParcela() {
    if (!showAddParcela) return;
    try {
      await fetch(`${API}/honorarios-contabil/${showAddParcela}/parcelas`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          ...addParcelaForm,
          amount: parseFloat(addParcelaForm.amount),
        }),
      });
      showToast('Parcela adicionada!');
      setShowAddParcela(null);
      setAddParcelaForm({ competencia: '', amount: '', due_date: '', payment_method: '', notas: '' });
      await fetchData();
    } catch { showToast('Erro ao adicionar parcela', 'error'); }
  }

  async function handleMarkPaid(parcelaId: string, pm?: string) {
    await fetch(`${API}/honorarios-contabil/parcelas/${parcelaId}/pagar`, {
      method: 'PATCH',
      headers: authHeaders(true),
      body: JSON.stringify({ payment_method: pm }),
    });
    await fetchData();
    onRefresh();
  }

  async function handleDeleteParcela(parcelaId: string) {
    if (!confirm('Remover esta parcela?')) return;
    await fetch(`${API}/honorarios-contabil/parcelas/${parcelaId}`, {
      method: 'DELETE', headers: authHeaders(),
    });
    await fetchData();
  }

  // Summary stats
  const totalMensalAtivo = honorarios
    .filter(h => h.ativo && ['CONTABILIDADE_MENSAL', 'FOLHA_PAGAMENTO', 'PARCELAMENTO'].includes(h.tipo))
    .reduce((s, h) => s + parseFloat(String(h.valor)), 0);

  const allParcelas = honorarios.flatMap(h => h.parcelas || []);
  const qtdAtrasadas = allParcelas.filter(p => p.status === 'ATRASADO').length;
  const totalAtrasado = allParcelas.filter(p => p.status === 'ATRASADO').reduce((s, p) => s + parseFloat(String(p.amount)), 0);
  const qtdPendentes = allParcelas.filter(p => p.status === 'PENDENTE').length;

  // Current competencia default
  function defaultCompetencia() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  return (
    <div className="p-5 max-w-4xl space-y-4">
      {/* Toast */}
      {toast && (
        <div className="toast toast-top toast-end z-50">
          <div className={`alert ${toast.type === 'error' ? 'alert-error' : 'alert-success'} py-2 px-4 text-sm`}>
            {toast.msg}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-base-200 rounded-xl p-4 border border-base-300">
          <p className="text-xs text-base-content/50">Mensalidade recorrente</p>
          <p className="text-xl font-bold text-primary mt-1">{fmtBRL(totalMensalAtivo)}</p>
        </div>
        <div className={`bg-base-200 rounded-xl p-4 border ${qtdAtrasadas > 0 ? 'border-error/40' : 'border-base-300'}`}>
          <p className="text-xs text-base-content/50">Parcelas atrasadas</p>
          <p className={`text-xl font-bold mt-1 ${qtdAtrasadas > 0 ? 'text-error' : 'text-success'}`}>
            {qtdAtrasadas} {qtdAtrasadas > 0 && <span className="text-sm">({fmtBRL(totalAtrasado)})</span>}
          </p>
        </div>
        <div className="bg-base-200 rounded-xl p-4 border border-base-300">
          <p className="text-xs text-base-content/50">A receber (pendentes)</p>
          <p className="text-xl font-bold text-warning mt-1">{qtdPendentes}</p>
        </div>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="tabs tabs-boxed w-fit">
          <button className={`tab tab-sm ${activeView === 'honorarios' ? 'tab-active' : ''}`} onClick={() => setActiveView('honorarios')}>
            💰 Honorários
          </button>
          <button className={`tab tab-sm ${activeView === 'inadimplencia' ? 'tab-active' : ''}`} onClick={() => setActiveView('inadimplencia')}>
            🔴 Em atraso {qtdAtrasadas > 0 && <span className="ml-1 badge badge-error badge-sm">{qtdAtrasadas}</span>}
          </button>
        </div>
        <button onClick={() => setShowCreate(v => !v)} className="btn btn-primary btn-sm">
          + Novo honorário
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="card bg-base-200 border border-base-300 p-4 space-y-3">
          <p className="font-semibold text-sm">Novo honorário</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="form-control col-span-2">
              <label className="label py-0"><span className="label-text text-xs">Tipo</span></label>
              <select className="select select-bordered select-sm" value={createForm.tipo}
                onChange={e => setCreateForm(f => ({ ...f, tipo: e.target.value }))}>
                {TIPOS_HONORARIO.map(t => (
                  <option key={t.value} value={t.value}>{t.label}{t.recorrente ? ' (recorrente)' : ''}</option>
                ))}
              </select>
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Valor (R$)</span></label>
              <input className="input input-bordered input-sm" type="number" step="0.01" min={0}
                value={createForm.valor} onChange={e => setCreateForm(f => ({ ...f, valor: e.target.value }))} placeholder="0,00" />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Dia de vencimento</span></label>
              <input className="input input-bordered input-sm" type="number" min={1} max={31}
                value={createForm.dia_vencimento} onChange={e => setCreateForm(f => ({ ...f, dia_vencimento: parseInt(e.target.value) }))} />
            </div>
            <div className="form-control col-span-2">
              <label className="label py-0"><span className="label-text text-xs">Observações</span></label>
              <input className="input input-bordered input-sm" value={createForm.notas}
                onChange={e => setCreateForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observações (opcional)" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} className="btn btn-primary btn-sm">Salvar</button>
            <button onClick={() => setShowCreate(false)} className="btn btn-ghost btn-sm">Cancelar</button>
          </div>
        </div>
      )}

      {/* Honorários list */}
      {activeView === 'honorarios' && (
        <>
          {loading ? (
            <div className="flex justify-center py-10"><span className="loading loading-spinner" /></div>
          ) : honorarios.length === 0 ? (
            <p className="text-center text-sm text-base-content/40 py-8">💰 Nenhum honorário cadastrado</p>
          ) : (
            <div className="space-y-4">
              {honorarios.map(h => (
                <HonorarioCard
                  key={h.id}
                  honorario={h}
                  onToggleAtivo={() => handleToggleAtivo(h)}
                  onDelete={() => handleDelete(h.id)}
                  onGerarParcelas={() => { setShowParcelas(h.id); setParcelasForm({ meses: 12, competencia_inicio: defaultCompetencia() }); }}
                  onReajuste={() => { setShowReajuste(h.id); }}
                  onAddParcela={() => { setShowAddParcela(h.id); }}
                  onMarkPaid={handleMarkPaid}
                  onDeleteParcela={handleDeleteParcela}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Inadimplência view */}
      {activeView === 'inadimplencia' && (
        <InadimplenciaView honorarios={honorarios} onMarkPaid={handleMarkPaid} />
      )}

      {/* Modal: Gerar Parcelas */}
      {showParcelas && (
        <Modal title="📅 Gerar Parcelas Mensais" onClose={() => setShowParcelas(null)}>
          <div className="space-y-3">
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Competência inicial (mês/ano)</span></label>
              <input type="month" className="input input-bordered input-sm"
                value={parcelasForm.competencia_inicio}
                onChange={e => setParcelasForm(f => ({ ...f, competencia_inicio: e.target.value }))} />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Quantidade de meses</span></label>
              <input type="number" className="input input-bordered input-sm" min={1} max={60}
                value={parcelasForm.meses}
                onChange={e => setParcelasForm(f => ({ ...f, meses: parseInt(e.target.value) }))} />
            </div>
            <p className="text-xs text-base-content/50">
              Competências já existentes serão ignoradas automaticamente.
              O vencimento de cada parcela será calculado com base no dia de vencimento do honorário.
            </p>
            <div className="flex gap-2 mt-2">
              <button onClick={handleGenerateParcelas} className="btn btn-primary btn-sm">Gerar</button>
              <button onClick={() => setShowParcelas(null)} className="btn btn-ghost btn-sm">Cancelar</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Reajuste */}
      {showReajuste && (
        <Modal title="📈 Aplicar Reajuste" onClose={() => setShowReajuste(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 mb-1">
              {[{ label: 'INPC ~4%', val: 4 }, { label: 'IPCA ~5%', val: 5 }, { label: 'IGPM ~6%', val: 6 }].map(p => (
                <button key={p.val} className="btn btn-outline btn-xs"
                  onClick={() => setReajusteForm(f => ({ ...f, percentual: String(p.val), motivo: p.label }))}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Percentual de reajuste (%)</span></label>
              <input type="number" step="0.01" className="input input-bordered input-sm"
                value={reajusteForm.percentual}
                onChange={e => setReajusteForm(f => ({ ...f, percentual: e.target.value }))}
                placeholder="Ex: 4.62" />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Motivo (opcional)</span></label>
              <input className="input input-bordered input-sm"
                value={reajusteForm.motivo}
                onChange={e => setReajusteForm(f => ({ ...f, motivo: e.target.value }))}
                placeholder="Ex: Reajuste anual INPC 2025" />
            </div>
            <p className="text-xs text-base-content/50">
              O histórico de reajustes é registrado automaticamente nas observações do honorário.
            </p>
            <div className="flex gap-2 mt-2">
              <button onClick={handleReajuste} disabled={!reajusteForm.percentual} className="btn btn-primary btn-sm">
                Aplicar reajuste
              </button>
              <button onClick={() => setShowReajuste(null)} className="btn btn-ghost btn-sm">Cancelar</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Add Parcela Manual */}
      {showAddParcela && (
        <Modal title="➕ Adicionar Parcela" onClose={() => setShowAddParcela(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Competência (mês/ano)</span></label>
                <input type="month" className="input input-bordered input-sm"
                  value={addParcelaForm.competencia}
                  onChange={e => setAddParcelaForm(f => ({ ...f, competencia: e.target.value }))} />
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Valor (R$)</span></label>
                <input type="number" step="0.01" className="input input-bordered input-sm"
                  value={addParcelaForm.amount}
                  onChange={e => setAddParcelaForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0,00" />
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Data de vencimento</span></label>
                <input type="date" className="input input-bordered input-sm"
                  value={addParcelaForm.due_date}
                  onChange={e => setAddParcelaForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Forma de pagamento</span></label>
                <select className="select select-bordered select-sm"
                  value={addParcelaForm.payment_method}
                  onChange={e => setAddParcelaForm(f => ({ ...f, payment_method: e.target.value }))}>
                  <option value="">—</option>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-control col-span-2">
                <label className="label py-0"><span className="label-text text-xs">Observações</span></label>
                <input className="input input-bordered input-sm"
                  value={addParcelaForm.notas}
                  onChange={e => setAddParcelaForm(f => ({ ...f, notas: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddParcela} disabled={!addParcelaForm.amount || !addParcelaForm.due_date}
                className="btn btn-primary btn-sm">Salvar</button>
              <button onClick={() => setShowAddParcela(null)} className="btn btn-ghost btn-sm">Cancelar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ─── HonorarioCard ─────────────────────────────────────────────────── */
function HonorarioCard({ honorario: h, onToggleAtivo, onDelete, onGerarParcelas, onReajuste, onAddParcela, onMarkPaid, onDeleteParcela }: {
  honorario: any;
  onToggleAtivo: () => void;
  onDelete: () => void;
  onGerarParcelas: () => void;
  onReajuste: () => void;
  onAddParcela: () => void;
  onMarkPaid: (id: string, pm?: string) => void;
  onDeleteParcela: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pmModal, setPmModal]   = useState<string | null>(null); // parcelaId waiting for pm

  const tipoInfo = TIPOS_HONORARIO.find(t => t.value === h.tipo);
  const parcelas = h.parcelas || [];
  const atrasadas = parcelas.filter((p: any) => p.status === 'ATRASADO').length;
  const pagas = parcelas.filter((p: any) => p.status === 'PAGO').length;
  const pendentes = parcelas.filter((p: any) => p.status === 'PENDENTE').length;

  return (
    <div className={`card border ${h.ativo ? 'bg-base-200 border-base-300' : 'bg-base-300/50 border-base-300 opacity-60'}`}>
      <div className="card-body p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{tipoInfo?.label || h.tipo.replace(/_/g, ' ')}</span>
              {tipoInfo?.recorrente && <span className="badge badge-outline badge-xs">recorrente</span>}
              {!h.ativo && <span className="badge badge-ghost badge-sm">Inativo</span>}
              {atrasadas > 0 && <span className="badge badge-error badge-sm">{atrasadas} atrasada{atrasadas > 1 ? 's' : ''}</span>}
            </div>
            <p className="text-xl font-bold text-primary mt-1">{fmtBRL(h.valor)}</p>
            {h.dia_vencimento && <p className="text-xs text-base-content/50">Vence dia {h.dia_vencimento} do mês</p>}
          </div>

          {/* Actions */}
          <div className="flex gap-1 flex-wrap justify-end">
            <button onClick={onGerarParcelas} className="btn btn-ghost btn-xs" title="Gerar parcelas">📅</button>
            <button onClick={onReajuste} className="btn btn-ghost btn-xs" title="Reajuste">📈</button>
            <button onClick={onAddParcela} className="btn btn-ghost btn-xs" title="Adicionar parcela">➕</button>
            <button onClick={onToggleAtivo} className="btn btn-ghost btn-xs" title={h.ativo ? 'Desativar' : 'Ativar'}>
              {h.ativo ? '⏸️' : '▶️'}
            </button>
            <button onClick={onDelete} className="btn btn-ghost btn-xs text-error" title="Excluir">🗑️</button>
          </div>
        </div>

        {/* Notas (history) */}
        {h.notas && (
          <details className="text-xs text-base-content/60">
            <summary className="cursor-pointer hover:text-base-content">Histórico / Observações</summary>
            <pre className="mt-1 whitespace-pre-wrap font-sans">{h.notas}</pre>
          </details>
        )}

        {/* Parcelas summary + toggle */}
        {parcelas.length > 0 && (
          <>
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-2 text-xs text-base-content/60 hover:text-base-content"
            >
              <span>{expanded ? '▼' : '▶'}</span>
              <span>{parcelas.length} parcela{parcelas.length > 1 ? 's' : ''}</span>
              {pagas > 0 && <span className="badge badge-success badge-xs">{pagas} paga{pagas > 1 ? 's' : ''}</span>}
              {pendentes > 0 && <span className="badge badge-warning badge-xs">{pendentes} pendente{pendentes > 1 ? 's' : ''}</span>}
              {atrasadas > 0 && <span className="badge badge-error badge-xs">{atrasadas} atrasada{atrasadas > 1 ? 's' : ''}</span>}
            </button>

            {expanded && (
              <div className="space-y-1 border-t border-base-300 pt-3 mt-1">
                {parcelas.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between text-sm gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`badge badge-sm ${STATUS_COLORS[p.status]}`}>{p.status}</span>
                      {p.competencia && <span className="text-xs text-base-content/50">{fmtCompetencia(p.competencia)}</span>}
                      <span className="text-xs">{fmtDate(p.due_date)}</span>
                      <span className="font-medium">{fmtBRL(p.amount)}</span>
                      {p.payment_method && <span className="badge badge-outline badge-xs">{p.payment_method}</span>}
                      {p.paid_at && <span className="text-xs text-success">pago {fmtDate(p.paid_at)}</span>}
                    </div>
                    <div className="flex gap-1">
                      {p.status !== 'PAGO' && (
                        <button onClick={() => setPmModal(p.id)} className="btn btn-success btn-xs">Pagar</button>
                      )}
                      <button onClick={() => onDeleteParcela(p.id)} className="btn btn-ghost btn-xs text-error">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Payment method modal (inline) */}
      {pmModal && (
        <PaymentMethodModal
          onConfirm={pm => { onMarkPaid(pmModal, pm); setPmModal(null); }}
          onCancel={() => setPmModal(null)}
        />
      )}
    </div>
  );
}

/* ─── InadimplenciaView ─────────────────────────────────────────────── */
function InadimplenciaView({ honorarios, onMarkPaid }: { honorarios: any[]; onMarkPaid: (id: string, pm?: string) => void }) {
  const atrasadas = honorarios.flatMap(h =>
    (h.parcelas || []).filter((p: any) => p.status === 'ATRASADO').map((p: any) => ({ ...p, honorario: h }))
  );

  if (atrasadas.length === 0) {
    return (
      <div className="text-center py-12 text-base-content/40">
        <p className="text-4xl mb-2">✅</p>
        <p className="text-sm">Nenhuma parcela em atraso!</p>
      </div>
    );
  }

  const total = atrasadas.reduce((s, p) => s + parseFloat(String(p.amount)), 0);

  return (
    <div className="space-y-3">
      <div className="alert alert-error py-2">
        <span className="font-semibold">Total em atraso: {fmtBRL(total)}</span>
        <span className="text-sm">— {atrasadas.length} parcela{atrasadas.length > 1 ? 's' : ''}</span>
      </div>
      {atrasadas.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()).map(p => (
        <div key={p.id} className="flex items-center justify-between gap-2 p-3 rounded-lg bg-error/10 border border-error/30">
          <div>
            <p className="text-sm font-medium">{TIPOS_HONORARIO.find(t => t.value === p.honorario.tipo)?.label || p.honorario.tipo}</p>
            <p className="text-xs text-base-content/60">
              {p.competencia && <>{fmtCompetencia(p.competencia)} · </>}
              Venc. {fmtDate(p.due_date)} · {fmtBRL(p.amount)}
            </p>
          </div>
          <button onClick={() => onMarkPaid(p.id)} className="btn btn-success btn-sm">Quitar</button>
        </div>
      ))}
    </div>
  );
}

/* ─── Modal wrapper ─────────────────────────────────────────────────── */
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card bg-base-100 shadow-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="card-body p-5">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-base">{title}</h3>
            <button onClick={onClose} className="btn btn-ghost btn-xs">✕</button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ─── Payment method picker ─────────────────────────────────────────── */
function PaymentMethodModal({ onConfirm, onCancel }: { onConfirm: (pm?: string) => void; onCancel: () => void }) {
  const [pm, setPm] = useState('PIX');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="card bg-base-100 shadow-xl w-72" onClick={e => e.stopPropagation()}>
        <div className="card-body p-5 space-y-3">
          <h3 className="font-bold text-sm">Forma de pagamento</h3>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map(m => (
              <button key={m} onClick={() => setPm(m)}
                className={`btn btn-sm ${pm === m ? 'btn-primary' : 'btn-outline'}`}>{m}</button>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => onConfirm(pm)} className="btn btn-success btn-sm flex-1">Confirmar</button>
            <button onClick={onCancel} className="btn btn-ghost btn-sm">Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
