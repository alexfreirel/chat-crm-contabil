'use client';
import { useState, useEffect } from 'react';

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
  { value: 'ABERTURA',        label: 'Abertura/Alteração' },
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

const AGENT_API = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_AGENT_FISCAL_URL ||
      (!window.location.hostname.includes('localhost')
        ? `${window.location.origin}/agente-fiscal-api`
        : 'http://localhost:5000'))
  : 'http://localhost:5000';

async function syncEmpresaAgenteFiscal(nome: string, cnpj: string, usuario: string, senha: string, inscricao_estadual?: string) {
  const cnpjClean = cnpj.replace(/\D/g, '');
  if (cnpjClean.length !== 14 || !usuario || !senha) return;

  const listRes = await fetch(`${AGENT_API}/api/empresas`);
  if (!listRes.ok) throw new Error('Agente Fiscal indisponível');
  const empresas: any[] = await listRes.json();

  const idx = empresas.findIndex((e: any) => e.cnpj === cnpjClean);
  if (idx >= 0) {
    // Atualiza empresa existente
    await fetch(`${AGENT_API}/api/empresas/${idx}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: nome || empresas[idx].nome, usuario, senha, inscricao_estadual: inscricao_estadual || '' }),
    });
  } else {
    // Cadastra nova empresa
    const res = await fetch(`${AGENT_API}/api/empresas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, cnpj: cnpjClean, usuario, senha, inscricao_estadual: inscricao_estadual || '' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao cadastrar empresa');
    }
  }
}

export default function TabFichaContabil({ cliente, onRefresh }: { cliente: any; onRefresh: () => void }) {
  const ficha = cliente?.lead?.ficha_contabil || {};
  const leadId = cliente?.lead?.id;
  const clienteId = cliente?.id;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string; role: string }[]>([]);

  useEffect(() => {
    fetch(`${API}/users/lawyers`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(d => setUsers(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sefazSync, setSefazSync] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const [activeSection, setActiveSection] = useState<string>('contato');
  const skipNextSync = useState({ current: false })[0]; // ref via useState para estabilidade

  // ── Contato / Lead ──
  const [leadPhone, setLeadPhone]         = useState(cliente?.lead?.phone || '');
  const [leadName, setLeadName]           = useState(cliente?.lead?.name || '');
  const [savingLead, setSavingLead]       = useState(false);
  const [leadSaved, setLeadSaved]         = useState(false);
  const [leadSearch, setLeadSearch]       = useState('');
  const [leadResults, setLeadResults]     = useState<any[]>([]);
  const [showLinkLead, setShowLinkLead]   = useState(false);
  const debounceRef = useState<any>(null);

  useEffect(() => {
    if (leadSearch.length < 2) { setLeadResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`${API}/leads?search=${encodeURIComponent(leadSearch)}&limit=10`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const d = await res.json();
      setLeadResults(Array.isArray(d) ? d : (d.data || []));
    }, 300);
    return () => clearTimeout(t);
  }, [leadSearch]);

  async function saveLeadContact() {
    if (!leadId) return;
    setSavingLead(true);
    setSaveError(null);
    try {
      const res = await fetch(`${API}/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ name: leadName, phone: leadPhone }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // Telefone normalizado já pertence a outro lead (duplicata com/sem 9º dígito)
        // Religar automaticamente o ClienteContabil ao lead correto (o do WhatsApp)
        if (res.status === 409 && err.conflicting_lead_id) {
          const relinkRes = await fetch(`${API}/clientes-contabil/${clienteId}/details`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({ lead_id: err.conflicting_lead_id }),
          });
          if (relinkRes.ok) {
            setLeadSaved(true);
            onRefresh();
            setTimeout(() => setLeadSaved(false), 3000);
            return;
          }
        }
        setSaveError(`❌ Erro ao salvar contato: ${err.message || res.status}`);
        return;
      }
      setLeadSaved(true);
      onRefresh();
      setTimeout(() => setLeadSaved(false), 3000);
    } catch (e: any) {
      setSaveError(`❌ Erro de comunicação: ${e.message}`);
    } finally {
      setSavingLead(false);
    }
  }

  async function linkLead(lead: any) {
    await fetch(`${API}/clientes-contabil/${clienteId}/details`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify({ lead_id: lead.id }),
    });
    setShowLinkLead(false);
    setLeadSearch('');
    setLeadResults([]);
    onRefresh();
  }

  function buildForm(f: any) {
    return {
      razao_social:        f.razao_social || '',
      nome_fantasia:       f.nome_fantasia || '',
      cnpj:                f.cnpj || '',
      cpf:                 f.cpf || '',
      data_abertura:       f.data_abertura ? f.data_abertura.slice(0, 10) : '',
      regime_tributario:   f.regime_tributario || '',
      porte:               f.porte || '',
      natureza_juridica:   f.natureza_juridica || '',
      cnae_principal:      f.cnae_principal || '',
      cnae_secundarios:    (f.cnae_secundarios || []).join(', '),
      inscricao_estadual:  f.inscricao_estadual || '',
      inscricao_municipal: f.inscricao_municipal || '',
      faturamento_mensal:  formatCurrency(f.faturamento_mensal),
      faturamento_anual:   formatCurrency(f.faturamento_anual),
      cep:                 f.cep || '',
      logradouro:          f.logradouro || '',
      numero:              f.numero || '',
      complemento:         f.complemento || '',
      bairro:              f.bairro || '',
      cidade:              f.cidade || '',
      estado:              f.estado || '',
      email_contabil:      f.email_contabil || '',
      email_fiscal:        f.email_fiscal || '',
      telefone_empresa:    f.telefone_empresa || '',
      banco:               f.banco || '',
      agencia:             f.agencia || '',
      conta:               f.conta || '',
      acesso_receita:      f.acesso_receita || '',
      acesso_sefaz:        f.acesso_sefaz || '',
      senha_sefaz:         f.senha_sefaz || '',
      acesso_prefeitura:   f.acesso_prefeitura || '',
      tem_funcionarios:    f.tem_funcionarios || false,
      qtd_funcionarios:    f.qtd_funcionarios || '',
      tem_pro_labore:      f.tem_pro_labore || false,
      regime_contratacao:  f.regime_contratacao || '',
      resp_fiscal:         f.resp_fiscal || '',
      resp_pessoal:        f.resp_pessoal || '',
      resp_contabil:       f.resp_contabil || '',
      sistema_erp:         f.sistema_erp || '',
      sistema_nf:          f.sistema_nf || '',
      sistema_folha:       f.sistema_folha || '',
      escritorio_anterior: f.escritorio_anterior || '',
      data_transicao:      f.data_transicao ? f.data_transicao.slice(0, 10) : '',
      servicos:            f.servicos || [],
      observacoes:         f.observacoes || '',
    };
  }

  const [form, setForm] = useState(() => buildForm(ficha));

  const [socios, setSocios] = useState<Socio[]>(
    Array.isArray(ficha.socios) && ficha.socios.length > 0
      ? ficha.socios
      : [emptySocio()],
  );

  // Sincroniza form e sócios quando os dados do cliente mudam (após save/refresh)
  useEffect(() => {
    // Pula o sync logo após um save bem-sucedido (evita reset do form)
    if (skipNextSync.current) { skipNextSync.current = false; return; }
    const f = cliente?.lead?.ficha_contabil || {};
    setForm(buildForm(f));
    setSocios(
      Array.isArray(f.socios) && f.socios.length > 0 ? f.socios : [emptySocio()],
    );
    setLeadPhone(cliente?.lead?.phone || '');
    setLeadName(cliente?.lead?.name || '');
  }, [cliente]);

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
    if (!leadId) {
      setSaveError('❌ Nenhum lead vinculado. Vá até a aba "Contato" e vincule um lead antes de salvar.');
      return;
    }
    setSaving(true);
    setSaved(false);
    setSaveError(null);
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
      const res = await fetch(`${API}/ficha-contabil/${leadId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveError(`❌ Erro ao salvar: ${err.message || res.status}`);
        return;
      }
      setSaved(true);
      skipNextSync.current = true; // não resetar o form no próximo useEffect
      onRefresh();
      setTimeout(() => setSaved(false), 3000);

      // Sincronizar credenciais com o Agente Fiscal SEFAZ automaticamente
      if (form.cnpj && form.acesso_sefaz && form.senha_sefaz) {
        setSefazSync('syncing');
        try {
          const nome = form.razao_social || leadName || '';
          await syncEmpresaAgenteFiscal(nome, form.cnpj, form.acesso_sefaz, form.senha_sefaz, form.inscricao_estadual);
          setSefazSync('ok');
          setTimeout(() => setSefazSync('idle'), 4000);
        } catch (e: any) {
          setSefazSync('error');
          setTimeout(() => setSefazSync('idle'), 6000);
        }
      }
    } catch (e: any) {
      setSaveError(`❌ Erro de comunicação: ${e.message}`);
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
    { id: 'contato',    label: '📞 Contato',              fields: [] },
    { id: 'empresa',    label: '🏢 Empresa',             fields: ['razao_social', 'cnpj', 'regime_tributario', 'porte'] },
    { id: 'socios',     label: '👥 Sócios',               fields: [] },
    { id: 'endereco',   label: '📍 Endereço',             fields: ['cep', 'cidade'] },
    { id: 'contatos',   label: '🔐 Acessos',              fields: ['email_contabil', 'banco'] },
    { id: 'dp',         label: '👥 Responsáveis',           fields: [] },
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

      {/* ── Seção: Contato ── */}
      {activeSection === 'contato' && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body p-4 space-y-4">
            <h3 className="font-bold text-sm">📞 Contato / Lead Vinculado</h3>

            {leadId ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="form-control">
                    <label className="label py-0"><span className="label-text text-xs">Nome</span></label>
                    <input className="input input-bordered input-sm" value={leadName}
                      onChange={e => setLeadName(e.target.value)} placeholder="Nome completo" />
                  </div>
                  <div className="form-control">
                    <label className="label py-0"><span className="label-text text-xs">Telefone / WhatsApp</span></label>
                    <input className="input input-bordered input-sm" type="tel" value={leadPhone}
                      onChange={e => setLeadPhone(e.target.value)} placeholder="(00) 00000-0000" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={saveLeadContact} disabled={savingLead}
                    className="btn btn-primary btn-sm">
                    {savingLead ? 'Salvando...' : 'Salvar contato'}
                  </button>
                  {leadSaved && <span className="text-xs text-success">✅ Salvo!</span>}
                  <button onClick={() => setShowLinkLead(v => !v)}
                    className="btn btn-ghost btn-sm ml-auto">
                    🔗 Trocar lead vinculado
                  </button>
                </div>

                {showLinkLead && (
                  <div className="border-t border-base-300 pt-3 space-y-2">
                    <p className="text-xs font-semibold text-base-content/60">Buscar outro lead para vincular</p>
                    <input className="input input-bordered input-sm w-full" placeholder="Nome ou telefone..."
                      value={leadSearch} onChange={e => setLeadSearch(e.target.value)} autoFocus />
                    {leadResults.length > 0 && (
                      <div className="bg-base-100 border border-base-300 rounded-lg max-h-48 overflow-y-auto">
                        {leadResults.map((l: any) => (
                          <button key={l.id} onClick={() => linkLead(l)}
                            className="w-full text-left px-3 py-2 hover:bg-base-200 border-b border-base-300/50 last:border-0">
                            <p className="text-sm font-medium">{l.name || '(sem nome)'}</p>
                            <p className="text-xs text-base-content/50">{l.phone}</p>
                          </button>
                        ))}
                      </div>
                    )}
                    {leadSearch.length >= 2 && leadResults.length === 0 && (
                      <p className="text-xs text-base-content/50">Nenhum lead encontrado</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <div className="alert alert-warning py-2 text-sm">
                  ⚠️ Nenhum lead vinculado a este cliente
                </div>
                <p className="text-xs text-base-content/60">Vincule um lead existente para habilitar o WhatsApp e o histórico de conversas.</p>
                <input className="input input-bordered input-sm w-full" placeholder="Buscar lead por nome ou telefone..."
                  value={leadSearch} onChange={e => setLeadSearch(e.target.value)} />
                {leadResults.length > 0 && (
                  <div className="bg-base-100 border border-base-300 rounded-lg max-h-48 overflow-y-auto">
                    {leadResults.map((l: any) => (
                      <button key={l.id} onClick={() => linkLead(l)}
                        className="w-full text-left px-3 py-2 hover:bg-base-200 border-b border-base-300/50 last:border-0">
                        <p className="text-sm font-medium">{l.name || '(sem nome)'}</p>
                        <p className="text-xs text-base-content/50">{l.phone}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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
                <label className="label py-0"><span className="label-text text-xs">Acesso Prefeitura</span></label>
                <input className="input input-bordered input-sm" value={form.acesso_prefeitura} onChange={e => set('acesso_prefeitura', e.target.value)} />
              </div>
            </div>

            {/* Portal do Contribuinte — SEFAZ */}
            <div className="divider my-1 text-xs font-bold text-base-content/50">PORTAL DO CONTRIBUINTE — SEFAZ</div>
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-blue-400 font-semibold">🔐 Credenciais sincronizadas automaticamente com o Agente Fiscal</p>
                {sefazSync === 'syncing' && (
                  <span className="text-xs text-blue-400 flex items-center gap-1">
                    <span className="loading loading-spinner loading-xs" /> Sincronizando...
                  </span>
                )}
                {sefazSync === 'ok' && (
                  <span className="text-xs text-success font-semibold">✅ Sincronizado com Agente Fiscal</span>
                )}
                {sefazSync === 'error' && (
                  <span className="text-xs text-warning font-semibold">⚠️ Salvo na ficha, mas Agente Fiscal indisponível</span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="form-control">
                  <label className="label py-0"><span className="label-text text-xs">Usuário (login SEFAZ)</span></label>
                  <input
                    className="input input-bordered input-sm"
                    value={form.acesso_sefaz}
                    onChange={e => set('acesso_sefaz', e.target.value)}
                    placeholder="CPF ou código de acesso"
                    autoComplete="off"
                  />
                </div>
                <div className="form-control">
                  <label className="label py-0"><span className="label-text text-xs">Senha SEFAZ</span></label>
                  <input
                    className="input input-bordered input-sm"
                    type="password"
                    value={form.senha_sefaz}
                    onChange={e => set('senha_sefaz', e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <p className="text-[10px] text-base-content/40">
                Ao salvar a ficha com usuário e senha preenchidos, a empresa será cadastrada/atualizada automaticamente na aba <strong>Empresas</strong> do Agente Fiscal SEFAZ.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Seção: Responsáveis ── */}
      {activeSection === 'dp' && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body p-4 space-y-4">
            <h3 className="font-bold text-sm">👥 Responsáveis por Setor</h3>
            <p className="text-xs text-base-content/50">Defina o responsável de cada área para este cliente.</p>
            <div className="space-y-3">
              {([
                { key: 'resp_fiscal',   label: 'Fiscal',   emoji: '📊' },
                { key: 'resp_pessoal',  label: 'Pessoal',  emoji: '👷' },
                { key: 'resp_contabil', label: 'Contábil', emoji: '📒' },
              ] as const).map(({ key, label, emoji }) => (
                <div key={key} className="flex items-center gap-3 bg-base-100 rounded-lg px-4 py-3 border border-base-300">
                  <span className="text-sm font-bold w-24 shrink-0">{emoji} {label}</span>
                  <select
                    className="select select-bordered select-sm flex-1"
                    value={(form as any)[key]}
                    onChange={e => set(key, e.target.value)}
                  >
                    <option value="">— Não definido —</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name}{u.role ? ` (${u.role})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {users.length === 0 && (
              <p className="text-xs text-warning">Nenhum usuário encontrado. Verifique a conexão com a API.</p>
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
      <div className="sticky bottom-0 bg-base-100 border-t border-base-200 -mx-6 px-6 py-3 space-y-2">
        {saveError && (
          <div className="alert alert-error py-2 text-sm">
            {saveError}
            <button className="ml-auto btn btn-ghost btn-xs" onClick={() => setSaveError(null)}>✕</button>
          </div>
        )}
        {!leadId && !saveError && (
          <div className="alert alert-warning py-2 text-sm">
            ⚠️ Sem lead vinculado — vá em <strong>📞 Contato</strong> e vincule um lead para habilitar o salvamento.
          </div>
        )}
        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving || !leadId} className="btn btn-primary btn-sm flex-1 max-w-xs">
            {saving
              ? <><span className="loading loading-spinner loading-xs" /> Salvando...</>
              : saved
              ? '✅ Salvo!'
              : '💾 Salvar ficha'}
          </button>
          {saved && <span className="text-xs text-success">Ficha atualizada com sucesso!</span>}
        </div>
      </div>
    </div>
  );
}
