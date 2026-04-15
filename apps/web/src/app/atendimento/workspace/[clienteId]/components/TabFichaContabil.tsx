'use client';
import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:44001/api';

const REGIMES = ['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI', 'ISENTO'];
const PORTES = ['MEI', 'ME', 'EPP', 'MEDIO', 'GRANDE'];
const SERVICOS = [
  { value: 'BPO_FISCAL', label: 'BPO Fiscal' },
  { value: 'BPO_CONTABIL', label: 'BPO Contábil' },
  { value: 'DP', label: 'Departamento Pessoal' },
  { value: 'ABERTURA', label: 'Abertura de Empresa' },
  { value: 'IR_PF', label: 'IRPF' },
  { value: 'IR_PJ', label: 'IRPJ' },
  { value: 'CONSULTORIA', label: 'Consultoria Tributária' },
];

export default function TabFichaContabil({ cliente, onRefresh }: { cliente: any; onRefresh: () => void }) {
  const ficha = cliente?.lead?.ficha_contabil || {};
  const leadId = cliente?.lead?.id;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    razao_social: ficha.razao_social || '',
    nome_fantasia: ficha.nome_fantasia || '',
    cnpj: ficha.cnpj || '',
    cpf: ficha.cpf || '',
    regime_tributario: ficha.regime_tributario || '',
    porte: ficha.porte || '',
    cnae_principal: ficha.cnae_principal || '',
    inscricao_estadual: ficha.inscricao_estadual || '',
    inscricao_municipal: ficha.inscricao_municipal || '',
    cep: ficha.cep || '',
    logradouro: ficha.logradouro || '',
    numero: ficha.numero || '',
    complemento: ficha.complemento || '',
    bairro: ficha.bairro || '',
    cidade: ficha.cidade || '',
    estado: ficha.estado || '',
    email_contabil: ficha.email_contabil || '',
    email_fiscal: ficha.email_fiscal || '',
    telefone_empresa: ficha.telefone_empresa || '',
    banco: ficha.banco || '',
    agencia: ficha.agencia || '',
    conta: ficha.conta || '',
    acesso_prefeitura: ficha.acesso_prefeitura || '',
    acesso_sefaz: ficha.acesso_sefaz || '',
    acesso_receita: ficha.acesso_receita || '',
    tem_funcionarios: ficha.tem_funcionarios || false,
    qtd_funcionarios: ficha.qtd_funcionarios || '',
    tem_pro_labore: ficha.tem_pro_labore || false,
    servicos: ficha.servicos || [],
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const toggleServico = (v: string) => {
    setForm(f => ({
      ...f,
      servicos: f.servicos.includes(v) ? f.servicos.filter((s: string) => s !== v) : [...f.servicos, v],
    }));
  };

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`${API}/ficha-contabil/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(form),
      });
      onRefresh();
    } finally { setSaving(false); }
  }

  const pct = ficha.completion_pct || 0;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Progress */}
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span className="font-medium">Completude da ficha</span>
          <span className={pct >= 80 ? 'text-success' : pct >= 40 ? 'text-warning' : 'text-error'}>{pct}%</span>
        </div>
        <progress className={`progress w-full ${pct >= 80 ? 'progress-success' : pct >= 40 ? 'progress-warning' : 'progress-error'}`} value={pct} max="100" />
      </div>

      {/* Dados da empresa */}
      <div className="card bg-base-200 border border-base-300">
        <div className="card-body p-4">
          <h3 className="font-bold text-sm mb-4">🏢 Dados da Empresa</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Razão Social</span></label>
              <input className="input input-bordered input-sm" value={form.razao_social} onChange={e => set('razao_social', e.target.value)} />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Nome Fantasia</span></label>
              <input className="input input-bordered input-sm" value={form.nome_fantasia} onChange={e => set('nome_fantasia', e.target.value)} />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">CNPJ</span></label>
              <input className="input input-bordered input-sm" value={form.cnpj} onChange={e => set('cnpj', e.target.value)} placeholder="00.000.000/0000-00" />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">CPF (MEI/PF)</span></label>
              <input className="input input-bordered input-sm" value={form.cpf} onChange={e => set('cpf', e.target.value)} placeholder="000.000.000-00" />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Regime Tributário</span></label>
              <select className="select select-bordered select-sm" value={form.regime_tributario} onChange={e => set('regime_tributario', e.target.value)}>
                <option value="">Selecionar...</option>
                {REGIMES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Porte</span></label>
              <select className="select select-bordered select-sm" value={form.porte} onChange={e => set('porte', e.target.value)}>
                <option value="">Selecionar...</option>
                {PORTES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">CNAE Principal</span></label>
              <input className="input input-bordered input-sm" value={form.cnae_principal} onChange={e => set('cnae_principal', e.target.value)} placeholder="0000-0/00" />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Insc. Estadual</span></label>
              <input className="input input-bordered input-sm" value={form.inscricao_estadual} onChange={e => set('inscricao_estadual', e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* Endereço */}
      <div className="card bg-base-200 border border-base-300">
        <div className="card-body p-4">
          <h3 className="font-bold text-sm mb-4">📍 Endereço</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">CEP</span></label>
              <input className="input input-bordered input-sm" value={form.cep} onChange={e => set('cep', e.target.value)} placeholder="00000-000" />
            </div>
            <div className="form-control md:col-span-2">
              <label className="label py-0"><span className="label-text text-xs">Logradouro</span></label>
              <input className="input input-bordered input-sm" value={form.logradouro} onChange={e => set('logradouro', e.target.value)} />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Número</span></label>
              <input className="input input-bordered input-sm" value={form.numero} onChange={e => set('numero', e.target.value)} />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Bairro</span></label>
              <input className="input input-bordered input-sm" value={form.bairro} onChange={e => set('bairro', e.target.value)} />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Cidade / UF</span></label>
              <div className="flex gap-1">
                <input className="input input-bordered input-sm flex-1" value={form.cidade} onChange={e => set('cidade', e.target.value)} placeholder="Cidade" />
                <input className="input input-bordered input-sm w-14" value={form.estado} onChange={e => set('estado', e.target.value)} placeholder="UF" maxLength={2} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contatos & Acessos */}
      <div className="card bg-base-200 border border-base-300">
        <div className="card-body p-4">
          <h3 className="font-bold text-sm mb-4">🔐 Contatos & Acessos</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">E-mail Contábil</span></label>
              <input className="input input-bordered input-sm" type="email" value={form.email_contabil} onChange={e => set('email_contabil', e.target.value)} />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">E-mail Fiscal</span></label>
              <input className="input input-bordered input-sm" type="email" value={form.email_fiscal} onChange={e => set('email_fiscal', e.target.value)} />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Acesso Receita Federal</span></label>
              <input className="input input-bordered input-sm" value={form.acesso_receita} onChange={e => set('acesso_receita', e.target.value)} placeholder="Código de acesso / Gov.br" />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Acesso SEFAZ</span></label>
              <input className="input input-bordered input-sm" value={form.acesso_sefaz} onChange={e => set('acesso_sefaz', e.target.value)} />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Acesso Prefeitura</span></label>
              <input className="input input-bordered input-sm" value={form.acesso_prefeitura} onChange={e => set('acesso_prefeitura', e.target.value)} />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs">Telefone da Empresa</span></label>
              <input className="input input-bordered input-sm" value={form.telefone_empresa} onChange={e => set('telefone_empresa', e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* DP */}
      <div className="card bg-base-200 border border-base-300">
        <div className="card-body p-4">
          <h3 className="font-bold text-sm mb-4">👥 Departamento Pessoal</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="checkbox checkbox-sm" checked={form.tem_funcionarios} onChange={e => set('tem_funcionarios', e.target.checked)} />
              <span className="text-sm">Possui funcionários registrados</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="checkbox checkbox-sm" checked={form.tem_pro_labore} onChange={e => set('tem_pro_labore', e.target.checked)} />
              <span className="text-sm">Possui pró-labore</span>
            </label>
            {form.tem_funcionarios && (
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Qtd. Funcionários</span></label>
                <input className="input input-bordered input-sm" type="number" min={0} value={form.qtd_funcionarios} onChange={e => set('qtd_funcionarios', parseInt(e.target.value))} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Serviços contratados */}
      <div className="card bg-base-200 border border-base-300">
        <div className="card-body p-4">
          <h3 className="font-bold text-sm mb-4">📋 Serviços Contratados</h3>
          <div className="flex flex-wrap gap-2">
            {SERVICOS.map(s => (
              <label key={s.value} className="flex items-center gap-1.5 cursor-pointer bg-base-100 border border-base-300 rounded-lg px-3 py-1.5 hover:border-primary transition-colors">
                <input type="checkbox" className="checkbox checkbox-xs checkbox-primary" checked={form.servicos.includes(s.value)} onChange={() => toggleServico(s.value)} />
                <span className="text-sm">{s.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} className="btn btn-primary w-full">
        {saving ? <span className="loading loading-spinner loading-sm" /> : '💾 Salvar Ficha'}
      </button>
    </div>
  );
}
