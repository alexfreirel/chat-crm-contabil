'use client';
import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:44001/api';

const REGIMES = ['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI', 'ISENTO'];
const PORTES = ['MEI', 'ME', 'EPP', 'MEDIO', 'GRANDE'];
const NATUREZAS = ['EMPRESÁRIO INDIVIDUAL', 'MEI', 'EIRELI', 'LTDA', 'SA', 'SLU', 'ASSOCIAÇÃO', 'COOPERATIVA'];
const REGIMES_CONTRATACAO = ['CLT', 'PJ', 'AUTONOMO', 'MISTO'];
const SERVICOS = [
  { value: 'CLIENTE_EFETIVO', label: '⭐ Cliente Efetivo (BPO Fiscal + Contábil + DP + IRPJ)' },
  { value: 'BPO_FISCAL',      label: 'BPO Fiscal' },
  { value: 'BPO_CONTABIL',    label: 'BPO Contábil' },
  { value: 'DP',              label: 'Departamento Pessoal' },
  { value: 'ABERTURA',        label: 'Abertura de Empresa' },
  { value: 'ENCERRAMENTO',    label: 'Encerramento' },
  { value: 'IR_PF',           label: 'IRPF' },
  { value: 'IR_PJ',           label: 'IRPJ' },
  { value: 'CONSULTORIA',     label: 'Consultoria Tributária' },
  { value: 'OUTRO',           label: 'Outro' },
];

type Socio = { nome: string; cpf: string; percentual: string; pro_labore: string };

const emptySocio = (): Socio => ({ nome: '', cpf: '', percentual: '', pro_labore: '' });

function formatCurrency(val: any): string {
  if (!val && val !== 0) return '';
  return Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseCurrency(str: string): number | '' {
  if (!str) return '';
  const n = parseFloat(str.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? '' : n;
}

export default function TabFichaContabil({ cliente, onRefresh }: { cliente: any; onRefresh: () => void }) {
  const ficha = cliente?.lead?.ficha_contabil || {};
  const leadId = cliente?.lead?.id;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('empresa');

  const [form, setForm] = useState({
    // Dados da empresa
    razao_social:       ficha.razao_social || '',
    nome_fantasia:      ficha.nome_fantasia || '',
    cnpj:               ficha.cnpj || '',
    cpf:                ficha.cpf || '',
    data_abertura:      ficha.data_abertura ? ficha.data_abertura.slice(0, 10) : '',
    regime_tributario:  ficha.regime_tributario || '',
    porte:              ficha.porte || '',
    natureza_juridica:  ficha.natureza_juridica || '',
    cnae_principal:     ficha.cnae_principal || '',
    cnae_secundarios:   (ficha.cnae_secundarios || []).join(', '),
    inscricao_estadual: ficha.inscricao_estadual || '',
    inscricao_municipal:ficha.inscricao_municipal || '',
    // Faturamento
    faturamento_mensal: formatCurrency(ficha.faturamento_mensal),
    faturamento_anual:  formatCurrency(ficha.faturamento_anual),
    // Endereço
    cep:        ficha.cep || '',
    logradouro: ficha.logradouro || '',
    numero:     ficha.numero || '',
    complemento:ficha.complemento || '',
    bairro:     ficha.bairro || '',
    cidade:     ficha.cidade || '',
    estado:     ficha.estado || '',
    // Contatos & Acessos
    email_contabil:    ficha.email_contabil || '',
    email_fiscal:      ficha.email_fiscal || '',
    telefone_empresa:  ficha.telefone_empresa || '',
    banco:             ficha.banco || '',
    agencia:           ficha.agencia || '',
    conta:             ficha.conta || '',
    acesso_receita:    ficha.acesso_receita || '',
    acesso_sefaz:      ficha.acesso_sefaz || '',
    acesso_prefeitura: ficha.acesso_prefeitura || '',
    // Departamento pessoal
    tem_funcionarios:     ficha.tem_funcionarios || false,
    qtd_funcionarios:     ficha.qtd_funcionarios || '',
    tem_pro_labore:       ficha.tem_pro_labore || false,
    regime_contratacao:   ficha.regime_contratacao || '',
    // Sistemas
    sistema_erp:   ficha.sistema_erp || '',
    sistema_nf:    ficha.sistema_nf || '',
    sistema_folha: ficha.sistema_folha || '',
    // Contabilidade anterior
    escritorio_anterior: ficha.escritorio_anterior || '',
    data_transicao:      ficha.data_transicao ? ficha.data_transicao.slice(0, 10) : '',
    // Serviços contratados
    servicos: ficha.servicos || [],
    // Observações
    observacoes: ficha.observacoes || '',
  });

  const [socios, setSocios] = useState<Socio[]>(
    Array.isArray(ficha.socios) && ficha.socios.length > 0
      ? ficha.socios
      : [emptySocio()],
  );

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const toggleServico = (v: string) => {
    setForm(f => ({
      ...f,
      servicos: f.servicos.includes(v)
        ? f.servicos.filter((s: string) => s !== v)
        : [...f.servicos, v],
    }));
  };

  function updateSocio(idx: number, key: keyof Socio, value: string) {
    setSocios(prev => prev.map((s, i) => i === idx ? { ...s, [key]: value } : s));
  }
  function addSocio() { setSocios(prev => [...prev, emptySocio()]); }
  function removeSocio(idx: number) {
    setSocios(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : [emptySocio()]);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const payload = {
        ...form,
        faturamento_mensal: parseCurrency(form.faturamento_mensal) || null,
        faturamento_anual:  parseCurrency(form.faturamento_anual)  || null,
        qtd_funcionarios: form.qtd_funcionarios ? parseInt(String(form.qtd_funcionarios)) : null,
        cnae_secundarios: form.cnae_secundarios
          ? form.cnae_secundarios.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [],
        socios: socios.filter(s => s.nome.trim()),
      };
      await fetch(`${API}/ficha-contabil/${leadId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(payload),
      });
      setSaved(true);
      onRefresh();
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleFinalizar() {
    if (!confirm('Marcar ficha como finalizada? Isso define completude em 100%.')) return;
    await fetch(`${API}/ficha-contabil/${leadId}/finalizar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    onRefresh();
  }

  const pct = ficha.completion_pct || 0;

  const sections = [
    { id: 'empresa',    label: '🏢 Empresa',             fields: ['razao_social', 'cnpj', 'regime_tributario', 'porte'] },
    { id: 'socios',     label: '👥 Sócios',               fields: [] },
    { id: 'endereco',   label: '📍 Endereço',             fields: ['cep', 'cidade'] },
    { id: 'contatos',   label: '🔐 Contatos & Acessos',   fields: ['email_contabil', 'banco'] },
    { id: 'dp',         label: '👷 Dep. Pessoal',          fields: [] },
    { id: 'sistemas',   label: '💻 Sistemas',             fields: [] },
    { id: 'anterior',   label: '🔄 Contab. Anterior',     fields: [] },
    { id: 'servicos',   label: '📋 Serviços',             fields: [] },
    { id: 'obs',        label: '📝 Observações',          fields: [] },
  ];

  function SectionBtn({ id, label }: { id: string; label: string }) {
    return (
      <button
        onClick={() => setActiveSection(id)}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
          activeSection === id
            ? 'bg-primary text-primary-content'
            : 'bg-base-200 text-base-content/70 hover:bg-base-300'
        }`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      {/* Progress */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="font-semibold text-sm">Completude da ficha</span>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-bold ${pct >= 80 ? 'text-success' : pct >= 40 ? 'text-warning' : 'text-error'}`}>
              {pct}%
            </span>
            {pct < 100 && (
              <button onClick={handleFinalizar} className="btn btn-ghost btn-xs text-primary">
                Marcar 100%
              </button>
            )}
          </div>
        </div>
        <progress
          className={`progress w-full ${pct >= 80 ? 'progress-success' : pct >= 40 ? 'progress-warning' : 'progress-error'}`}
          value={pct} max="100"
        />
        {ficha.finalizado && (
          <p className="text-xs text-success mt-1">✅ Ficha finalizada</p>
        )}
      </div>

      {/* Navegação de seções */}
      <div className="flex gap-2 flex-wrap">
        {sections.map(s => <SectionBtn key={s.id} id={s.id} label={s.label} />)}
      </div>

      {/* ── Seção: Empresa ── */}
      {activeSection === 'empresa' && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body p-4 space-y-4">
            <h3 className="font-bold text-sm">🏢 Dados da Empresa</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Razão Social *</span></label>
                <input className="input input-bordered input-sm" value={form.razao_social} onChange={e => set('razao_social', e.target.value)} />
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Nome Fantasia</span></label>
                <input className="input input-bordered input-sm" value={form.nome_fantasia} onChange={e => set('nome_fantasia', e.target.value)} />
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">CNPJ *</span></label>
                <input className="input input-bordered input-sm" value={form.cnpj} onChange={e => set('cnpj', e.target.value)} placeholder="00.000.000/0000-00" />
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">CPF (MEI / PF)</span></label>
                <input className="input input-bordered input-sm" value={form.cpf} onChange={e => set('cpf', e.target.value)} placeholder="000.000.000-00" />
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Data de Abertura</span></label>
                <input className="input input-bordered input-sm" type="date" value={form.data_abertura} onChange={e => set('data_abertura', e.target.value)} />
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Natureza Jurídica</span></label>
                <select className="select select-bordered select-sm" value={form.natureza_juridica} onChange={e => set('natureza_juridica', e.target.value)}>
                  <option value="">Selecionar...</option>
                  {NATUREZAS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Regime Tributário *</span></label>
                <select className="select select-bordered select-sm" value={form.regime_tributario} onChange={e => set('regime_tributario', e.target.value)}>
                  <option value="">Selecionar...</option>
                  {REGIMES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Porte *</span></label>
                <select className="select select-bordered select-sm" value={form.porte} onChange={e => set('porte', e.target.value)}>
                  <option value="">Selecionar...</option>
                  {PORTES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">CNAE Principal *</span></label>
                <input className="input input-bordered input-sm" value={form.cnae_principal} onChange={e => set('cnae_principal', e.target.value)} placeholder="0000-0/00" />
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">CNAEs Secundários (separar por vírgula)</span></label>
                <input className="input input-bordered input-sm" value={form.cnae_secundarios} onChange={e => set('cnae_secundarios', e.target.value)} placeholder="0000-0/01, 0000-0/02" />
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Inscrição Estadual</span></label>
                <input className="input input-bordered input-sm" value={form.inscricao_estadual} onChange={e => set('inscricao_estadual', e.target.value)} />
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Inscrição Municipal</span></label>
                <input className="input input-bordered input-sm" value={form.inscricao_municipal} onChange={e => set('inscricao_municipal', e.target.value)} />
              </div>
            </div>

            {/* Faturamento */}
            <div className="divider my-2 text-xs font-bold text-base-content/50">FATURAMENTO ESTIMADO</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Faturamento Mensal (R$) *</span></label>
                <input
                  className="input input-bordered input-sm"
                  value={form.faturamento_mensal}
                  onChange={e => set('faturamento_mensal', e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Faturamento Anual (R$)</span></label>
                <input
                  className="input input-bordered input-sm"
                  value={form.faturamento_anual}
                  onChange={e => set('faturamento_anual', e.target.value)}
                  placeholder="0,00"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Seção: Sócios ── */}
      {activeSection === 'socios' && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body p-4 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-sm">👥 Sócios / Responsáveis</h3>
              <button onClick={addSocio} className="btn btn-ghost btn-xs text-primary">+ Adicionar sócio</button>
            </div>
            {socios.map((s, idx) => (
              <div key={idx} className="bg-base-100 border border-base-300 rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-base-content/60">Sócio {idx + 1}</span>
                  <button onClick={() => removeSocio(idx)} className="btn btn-ghost btn-xs text-error">✕</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="form-control">
                    <label className="label py-0"><span className="label-text text-xs">Nome completo</span></label>
                    <input className="input input-bordered input-sm" value={s.nome} onChange={e => updateSocio(idx, 'nome', e.target.value)} placeholder="Nome do sócio" />
                  </div>
                  <div className="form-control">
                    <label className="label py-0"><span className="label-text text-xs">CPF</span></label>
                    <input className="input input-bordered input-sm" value={s.cpf} onChange={e => updateSocio(idx, 'cpf', e.target.value)} placeholder="000.000.000-00" />
                  </div>
                  <div className="form-control">
                    <label className="label py-0"><span className="label-text text-xs">% Participação</span></label>
                    <input className="input input-bordered input-sm" type="number" min={0} max={100} step={0.01} value={s.percentual} onChange={e => updateSocio(idx, 'percentual', e.target.value)} placeholder="50" />
                  </div>
                  <div className="form-control">
                    <label className="label py-0"><span className="label-text text-xs">Pró-labore (R$)</span></label>
                    <input className="input input-bordered input-sm" value={s.pro_labore} onChange={e => updateSocio(idx, 'pro_labore', e.target.value)} placeholder="0,00" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Seção: Endereço ── */}
      {activeSection === 'endereco' && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body p-4">
            <h3 className="font-bold text-sm mb-4">📍 Endereço Comercial / Fiscal</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">CEP *</span></label>
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
                <label className="label py-0"><span className="label-text text-xs">Complemento</span></label>
                <input className="input input-bordered input-sm" value={form.complemento} onChange={e => set('complemento', e.target.value)} />
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Bairro</span></label>
                <input className="input input-bordered input-sm" value={form.bairro} onChange={e => set('bairro', e.target.value)} />
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Cidade *</span></label>
                <input className="input input-bordered input-sm" value={form.cidade} onChange={e => set('cidade', e.target.value)} />
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Estado (UF)</span></label>
                <input className="input input-bordered input-sm" value={form.estado} onChange={e => set('estado', e.target.value)} placeholder="SP" maxLength={2} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Seção: Contatos & Acessos ── */}
      {activeSection === 'contatos' && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body p-4 space-y-4">
            <h3 className="font-bold text-sm">🔐 Contatos & Acessos</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">E-mail Contábil *</span></label>
                <input className="input input-bordered input-sm" type="email" value={form.email_contabil} onChange={e => set('email_contabil', e.target.value)} />
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">E-mail Fiscal</span></label>
                <input className="input input-bordered input-sm" type="email" value={form.email_fiscal} onChange={e => set('email_fiscal', e.target.value)} />
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Telefone da Empresa</span></label>
                <input className="input input-bordered input-sm" value={form.telefone_empresa} onChange={e => set('telefone_empresa', e.target.value)} />
              </div>
            </div>
            <div className="divider my-1 text-xs font-bold text-base-content/50">DADOS BANCÁRIOS</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Banco *</span></label>
                <input className="input input-bordered input-sm" value={form.banco} onChange={e => set('banco', e.target.value)} placeholder="Ex: Banco do Brasil" />
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Agência *</span></label>
                <input className="input input-bordered input-sm" value={form.agencia} onChange={e => set('agencia', e.target.value)} />
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Conta *</span></label>
                <input className="input input-bordered input-sm" value={form.conta} onChange={e => set('conta', e.target.value)} />
              </div>
            </div>
            <div className="divider my-1 text-xs font-bold text-base-content/50">ACESSOS DE SISTEMAS</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
            </div>
          </div>
        </div>
      )}

      {/* ── Seção: Departamento Pessoal ── */}
      {activeSection === 'dp' && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body p-4 space-y-4">
            <h3 className="font-bold text-sm">👷 Departamento Pessoal</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="checkbox checkbox-sm checkbox-primary" checked={form.tem_funcionarios} onChange={e => set('tem_funcionarios', e.target.checked)} />
                <div>
                  <span className="font-medium text-sm">Possui funcionários registrados</span>
                  <p className="text-xs text-base-content/50">CLT, PJ ou autônomos</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="checkbox checkbox-sm checkbox-primary" checked={form.tem_pro_labore} onChange={e => set('tem_pro_labore', e.target.checked)} />
                <div>
                  <span className="font-medium text-sm">Possui pró-labore</span>
                  <p className="text-xs text-base-content/50">Remuneração dos sócios via folha</p>
                </div>
              </label>
            </div>
            {form.tem_funcionarios && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="form-control">
                  <label className="label py-0"><span className="label-text text-xs">Qtd. Funcionários</span></label>
                  <input className="input input-bordered input-sm" type="number" min={0} value={form.qtd_funcionarios} onChange={e => set('qtd_funcionarios', e.target.value)} />
                </div>
                <div className="form-control">
                  <label className="label py-0"><span className="label-text text-xs">Regime de Contratação</span></label>
                  <select className="select select-bordered select-sm" value={form.regime_contratacao} onChange={e => set('regime_contratacao', e.target.value)}>
                    <option value="">Selecionar...</option>
                    {REGIMES_CONTRATACAO.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Seção: Sistemas ── */}
      {activeSection === 'sistemas' && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body p-4">
            <h3 className="font-bold text-sm mb-4">💻 Sistemas Utilizados</h3>
            <p className="text-xs text-base-content/50 mb-3">Informe os softwares atuais do cliente para identificar necessidades de integração</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">ERP / Sistema de Gestão</span></label>
                <input className="input input-bordered input-sm" value={form.sistema_erp} onChange={e => set('sistema_erp', e.target.value)} placeholder="Ex: Omie, Bling, SAP, Totvs..." />
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Emissor de Nota Fiscal</span></label>
                <input className="input input-bordered input-sm" value={form.sistema_nf} onChange={e => set('sistema_nf', e.target.value)} placeholder="Ex: NFe.io, Nota Express, prefeitura..." />
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Sistema de Folha de Pagamento</span></label>
                <input className="input input-bordered input-sm" value={form.sistema_folha} onChange={e => set('sistema_folha', e.target.value)} placeholder="Ex: Domínio, Protheus, Folhamatic..." />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Seção: Contabilidade Anterior ── */}
      {activeSection === 'anterior' && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body p-4">
            <h3 className="font-bold text-sm mb-4">🔄 Contabilidade Anterior</h3>
            <p className="text-xs text-base-content/50 mb-3">Informações sobre o escritório de contabilidade anterior do cliente</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="form-control md:col-span-2">
                <label className="label py-0"><span className="label-text text-xs">Escritório / Contador Anterior</span></label>
                <input className="input input-bordered input-sm" value={form.escritorio_anterior} onChange={e => set('escritorio_anterior', e.target.value)} placeholder="Nome do escritório ou contador" />
              </div>
              <div className="form-control">
                <label className="label py-0"><span className="label-text text-xs">Data prevista de transição / início</span></label>
                <input className="input input-bordered input-sm" type="date" value={form.data_transicao} onChange={e => set('data_transicao', e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Seção: Serviços ── */}
      {activeSection === 'servicos' && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body p-4">
            <h3 className="font-bold text-sm mb-4">📋 Serviços Contratados</h3>
            <div className="flex flex-wrap gap-2">
              {SERVICOS.map(s => (
                <label
                  key={s.value}
                  className={`flex items-center gap-2 cursor-pointer border rounded-lg px-3 py-2 transition-colors ${
                    form.servicos.includes(s.value)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-base-300 bg-base-100 hover:border-primary/40'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs checkbox-primary"
                    checked={form.servicos.includes(s.value)}
                    onChange={() => toggleServico(s.value)}
                  />
                  <span className="text-sm">{s.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Seção: Observações ── */}
      {activeSection === 'obs' && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body p-4">
            <h3 className="font-bold text-sm mb-4">📝 Observações do Contador</h3>
            <p className="text-xs text-base-content/50 mb-2">Informações internas, particularidades do cliente, urgências, pendências.</p>
            <textarea
              className="textarea textarea-bordered w-full min-h-[180px] text-sm"
              value={form.observacoes}
              onChange={e => set('observacoes', e.target.value)}
              placeholder="Ex: Cliente tem pendência de regularização junto à Receita. Prazo negociado até março/2026. Sócio majoritário é o João (tel: ...)."
            />
          </div>
        </div>
      )}

      {/* Salvar */}
      <div className="flex items-center gap-3 sticky bottom-0 bg-base-100 border-t border-base-200 -mx-6 px-6 py-3">
        <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm flex-1 max-w-xs">
          {saving
            ? <><span className="loading loading-spinner loading-xs" /> Salvando...</>
            : saved
            ? '✅ Salvo!'
            : '💾 Salvar ficha'}
        </button>
        {saved && <span className="text-xs text-success">Ficha atualizada com sucesso</span>}
      </div>
    </div>
  );
}
