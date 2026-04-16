'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:44001/api';

const STATUS_COLORS: Record<string, string> = {
  PENDENTE: 'badge-warning', PAGO: 'badge-success', ATRASADO: 'badge-error',
};

export default function TabHonorarios({ clienteId, onRefresh }: { clienteId: string; onRefresh: () => void }) {
  const [honorarios, setHonorarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ tipo: 'MENSALIDADE', valor: '', dia_vencimento: 10, notas: '' });

  useEffect(() => { fetch_(); }, [clienteId]);

  async function fetch_() {
    setLoading(true);
    const res = await fetch(`${API}/honorarios-contabil/cliente/${clienteId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    setHonorarios(await res.json());
    setLoading(false);
  }

  async function handleCreate() {
    await fetch(`${API}/honorarios-contabil/cliente/${clienteId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify({ ...form, valor: parseFloat(form.valor) }),
    });
    setShowForm(false);
    fetch_();
  }

  async function handleMarkPaid(parcelaId: string) {
    await fetch(`${API}/honorarios-contabil/parcelas/${parcelaId}/pagar`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    fetch_();
  }

  const totalMensal = honorarios.filter(h => h.tipo === 'MENSALIDADE' && h.ativo).reduce((s, h) => s + parseFloat(h.valor), 0);
  const atrasadas = honorarios.flatMap(h => h.parcelas || []).filter(p => p.status === 'ATRASADO').length;

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div className="grid grid-cols-2 gap-4 mb-2">
        <div className="stat bg-base-200 rounded-lg p-4">
          <div className="stat-title text-xs">Mensalidade ativa</div>
          <div className="stat-value text-xl text-primary">R$ {totalMensal.toFixed(2).replace('.', ',')}</div>
        </div>
        <div className="stat bg-base-200 rounded-lg p-4">
          <div className="stat-title text-xs">Parcelas atrasadas</div>
          <div className={`stat-value text-xl ${atrasadas > 0 ? 'text-error' : 'text-success'}`}>{atrasadas}</div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h3 className="font-bold">Honorários</h3>
        <button onClick={() => setShowForm(v => !v)} className="btn btn-primary btn-sm">+ Novo</button>
      </div>

      {showForm && (
        <div className="card bg-base-200 border border-base-300 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Tipo</span></label>
              <select className="select select-bordered select-sm" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                <option value="MENSALIDADE">Mensalidade</option>
                <option value="SERVICO_AVULSO">Serviço Avulso</option>
                <option value="IMPLANTACAO">Implantação</option>
              </select>
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Valor (R$)</span></label>
              <input className="input input-bordered input-sm" type="number" step="0.01" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} placeholder="0,00" />
            </div>
            {form.tipo === 'MENSALIDADE' && (
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Dia vencimento</span></label>
                <input className="input input-bordered input-sm" type="number" min={1} max={31} value={form.dia_vencimento} onChange={e => setForm(f => ({ ...f, dia_vencimento: parseInt(e.target.value) }))} />
              </div>
            )}
            <div className="form-control col-span-2">
              <label className="label py-0"><span className="label-text text-xs">Observações</span></label>
              <input className="input input-bordered input-sm" value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} className="btn btn-primary btn-sm">Salvar</button>
            <button onClick={() => setShowForm(false)} className="btn btn-ghost btn-sm">Cancelar</button>
          </div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-10"><span className="loading loading-spinner" /></div> : (
        <div className="space-y-4">
          {honorarios.length === 0 ? (
            <p className="text-center text-sm text-base-content/40 py-8">💰 Nenhum honorário cadastrado</p>
          ) : honorarios.map(h => (
            <div key={h.id} className="card bg-base-200 border border-base-300">
              <div className="card-body p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{h.tipo.replace(/_/g, ' ')}</span>
                      {!h.ativo && <span className="badge badge-ghost badge-sm">Inativo</span>}
                    </div>
                    <p className="text-lg font-bold text-primary mt-1">R$ {parseFloat(h.valor).toFixed(2).replace('.', ',')}</p>
                    {h.dia_vencimento && <p className="text-xs text-base-content/50">Vence dia {h.dia_vencimento} do mês</p>}
                    {h.notas && <p className="text-xs text-base-content/50 mt-1">{h.notas}</p>}
                  </div>
                </div>

                {h.parcelas?.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-semibold text-base-content/50">PARCELAS</p>
                    {h.parcelas.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className={`badge badge-sm ${STATUS_COLORS[p.status]}`}>{p.status}</span>
                          <span className="text-xs text-base-content/60">{new Date(p.due_date).toLocaleDateString('pt-BR')}</span>
                          <span>R$ {parseFloat(p.amount).toFixed(2).replace('.', ',')}</span>
                        </div>
                        {p.status !== 'PAGO' && (
                          <button onClick={() => handleMarkPaid(p.id)} className="btn btn-success btn-xs">Pagar</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
