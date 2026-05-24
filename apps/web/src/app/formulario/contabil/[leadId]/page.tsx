'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:44001/api';

const REGIMES = [
  { value: 'MEI',              label: 'MEI — Microempreendedor Individual' },
  { value: 'SIMPLES_NACIONAL', label: 'Simples Nacional' },
  { value: 'LUCRO_PRESUMIDO',  label: 'Lucro Presumido' },
  { value: 'LUCRO_REAL',       label: 'Lucro Real' },
  { value: 'ISENTO',           label: 'Isento / Não tributado' },
];
const PORTES = [
  { value: 'MEI',    label: 'MEI' },
  { value: 'ME',     label: 'ME — Microempresa' },
  { value: 'EPP',    label: 'EPP — Empresa de Pequeno Porte' },
  { value: 'MEDIO',  label: 'Médio porte' },
  { value: 'GRANDE', label: 'Grande porte' },
];

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<Step, string> = {
  1: 'Dados da empresa',
  2: 'Sócios',
  3: 'Sistemas & Histórico',
  4: 'Revisão',
};

type Socio = { nome: string; cpf: string; percentual: string };
const emptySocio = (): Socio => ({ nome: '', cpf: '', percentual: '' });

export default function FormularioContabilPage() {
  const params = useParams();
  const leadId = params?.leadId as string;

  const [step, setStep] = useState<Step>(1);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    razao_social:       '',
    nome_fantasia:      '',
    cnpj:               '',
    cpf:                '',
    data_abertura:      '',
    regime_tributario:  '',
    porte:              '',
    cnae_principal:     '',
    inscricao_estadual: '',
    inscricao_municipal:'',
    cep:                '',
    logradouro:         '',
    numero:             '',
    complemento:        '',
    bairro:             '',
    cidade:             '',
    estado:             '',
    email_contabil:     '',
    telefone_empresa:   '',
    faturamento_mensal: '',
    tem_funcionarios:   false,
    qtd_funcionarios:   '',
    tem_pro_labore:     false,
    sistema_erp:        '',
    sistema_nf:         '',
    sistema_folha:      '',
    escritorio_anterior:'',
    data_transicao:     '',
    observacoes:        '',
  });

  const [socios, setSocios] = useState<Socio[]>([emptySocio()]);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  // Carregar dados existentes da ficha
  useEffect(() => {
    if (!leadId) return;
    fetch(`${API}/ficha-contabil/publico/${leadId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setForm(f => ({
            ...f,
            razao_social:       data.razao_social || '',
            nome_fantasia:      data.nome_fantasia || '',
            cnpj:               data.cnpj || '',
            cpf:                data.cpf || '',
            data_abertura:      data.data_abertura ? data.data_abertura.slice(0, 10) : '',
            regime_tributario:  data.regime_tributario || '',
            porte:              data.porte || '',
            cnae_principal:     data.cnae_principal || '',
            inscricao_estadual: data.inscricao_estadual || '',
            inscricao_municipal:data.inscricao_municipal || '',
            cep:                data.cep || '',
            logradouro:         data.logradouro || '',
            numero:             data.numero || '',
            complemento:        data.complemento || '',
            bairro:             data.bairro || '',
            cidade:             data.cidade || '',
            estado:             data.estado || '',
            email_contabil:     data.email_contabil || '',
            telefone_empresa:   data.telefone_empresa || '',
            faturamento_mensal: data.faturamento_mensal ? String(data.faturamento_mensal) : '',
            tem_funcionarios:   data.tem_funcionarios || false,
            qtd_funcionarios:   data.qtd_funcionarios ? String(data.qtd_funcionarios) : '',
            tem_pro_labore:     data.tem_pro_labore || false,
            sistema_erp:        data.sistema_erp || '',
            sistema_nf:         data.sistema_nf || '',
            sistema_folha:      data.sistema_folha || '',
            escritorio_anterior:data.escritorio_anterior || '',
            data_transicao:     data.data_transicao ? data.data_transicao.slice(0, 10) : '',
            observacoes:        data.observacoes || '',
          }));
          if (Array.isArray(data.socios) && data.socios.length > 0) {
            setSocios(data.socios);
          }
          // Se já estava finalizado, mostrar sucesso
          if (data.finalizado) setSubmitted(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [leadId]);

  function updateSocio(idx: number, key: keyof Socio, value: string) {
    setSocios(prev => prev.map((s, i) => i === idx ? { ...s, [key]: value } : s));
  }

  async function saveStep(nextStep?: Step) {
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        faturamento_mensal: form.faturamento_mensal
          ? parseFloat(form.faturamento_mensal.replace(',', '.'))
          : null,
        qtd_funcionarios: form.qtd_funcionarios ? parseInt(form.qtd_funcionarios) : null,
        socios: socios.filter(s => s.nome.trim()),
      };
      const res = await fetch(`${API}/ficha-contabil/publico/${leadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Erro ao salvar');
      if (nextStep) setStep(nextStep);
    } catch (e: any) {
      setError(e.message || 'Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        faturamento_mensal: form.faturamento_mensal
          ? parseFloat(form.faturamento_mensal.replace(',', '.'))
          : null,
        qtd_funcionarios: form.qtd_funcionarios ? parseInt(form.qtd_funcionarios) : null,
        socios: socios.filter(s => s.nome.trim()),
      };
      const res = await fetch(`${API}/ficha-contabil/publico/${leadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Erro ao enviar');
      setSubmitted(true);
    } catch (e: any) {
      setError(e.message || 'Erro ao enviar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  function InputField({ label, name, type = 'text', placeholder = '', required = false }: {
    label: string; name: string; type?: string; placeholder?: string; required?: boolean;
  }) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}{required && <span className="text-red-500 ml-1">*</span>}
        </label>
        <input
          type={type}
          value={(form as any)[name] || ''}
          onChange={e => set(name, e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
    );
  }

  function SelectField({ label, name, options, required = false }: {
    label: string; name: string;
    options: { value: string; label: string }[];
    required?: boolean;
  }) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}{required && <span className="text-red-500 ml-1">*</span>}
        </label>
        <select
          value={(form as any)[name] || ''}
          onChange={e => set(name, e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">Selecionar...</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background bg-grid">
        <div className="text-center">
          <div
            className="rounded-full h-14 w-14 border-2 border-transparent mx-auto mb-4 animate-spin-slow"
            style={{
              borderTopColor: 'var(--neon-cyan)',
              borderRightColor: 'var(--neon-magenta)',
              boxShadow: '0 0 24px var(--color-xp-glow)',
            }}
          />
          <p className="text-muted-foreground text-sm font-semibold uppercase tracking-widest">
            Carregando formulário…
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background bg-grid px-4 relative overflow-hidden">
        {/* radial glow */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle at center, var(--color-quest-glow) 0%, transparent 60%)' }}
        />
        <div className="max-w-md w-full text-center bg-card border border-border card-holographic rounded-2xl shadow-2xl p-10 relative z-10 animate-level-up">
          <div
            className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-5 glow-quest"
            style={{ background: 'linear-gradient(135deg, var(--color-quest) 0%, var(--neon-cyan) 100%)' }}
          >
            <span className="text-4xl">✓</span>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground mb-2">
            Missão concluída
          </div>
          <h1 className="text-3xl font-black text-foreground mb-3 text-holographic inline-block">
            Ficha enviada!
          </h1>
          <p className="text-text-secondary text-sm leading-relaxed">
            Obrigado pelas informações. Nossa equipe vai analisar os dados e entrar em contato em breve.
          </p>
          <p className="text-muted-foreground text-xs mt-5">
            Você pode fechar esta janela.
          </p>
        </div>
      </div>
    );
  }

  const totalSteps = 4;
  const pctBar = ((step - 1) / (totalSteps - 1)) * 100;

  return (
    <div className="min-h-screen bg-background bg-grid">
      {/* Header */}
      <div className="bg-card/95 backdrop-blur-md border-b border-border px-4 py-4 sticky top-0 z-20">
        <div className="max-w-xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center glow-cyan card-holographic"
              style={{ background: 'linear-gradient(135deg, var(--color-xp-start), var(--color-xp-end))' }}
            >
              <span className="text-white text-sm font-black">C</span>
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">
                Ficha <span className="text-holographic">Contábil</span>
              </p>
              <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">
                Etapa {step} de {totalSteps} • {STEP_LABELS[step]}
              </p>
            </div>
          </div>

          {/* Barra de progresso gamificada */}
          <div className="relative">
            <div className="flex justify-between mb-1">
              {([1, 2, 3, 4] as Step[]).map(s => {
                const done = s < step;
                const current = s === step;
                return (
                  <div key={s} className="flex flex-col items-center">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                        done
                          ? 'text-white glow-quest'
                          : current
                          ? 'text-white glow-cyan scale-110'
                          : 'bg-bg-tertiary text-muted-foreground border border-border'
                      }`}
                      style={
                        done
                          ? { background: 'var(--color-quest)' }
                          : current
                          ? { background: 'linear-gradient(135deg, var(--color-xp-start), var(--color-xp-end))' }
                          : undefined
                      }
                    >
                      {done ? '✓' : s}
                    </div>
                    <span className={`text-[9px] mt-1 font-bold uppercase tracking-wider ${
                      current ? 'text-foreground' : 'text-muted-foreground'
                    }`}>
                      {STEP_LABELS[s]}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="xp-bar-track h-1.5 mt-2">
              <div className="xp-bar-fill" style={{ width: `${pctBar}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            ⚠️ {error}
          </div>
        )}

        {/* ── Step 1: Dados da empresa ── */}
        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-bold text-gray-900 text-lg">🏢 Dados da empresa</h2>
            <div className="grid grid-cols-1 gap-4">
              {InputField({ label: 'Razão Social', name: 'razao_social', required: true })}
              {InputField({ label: 'Nome Fantasia', name: 'nome_fantasia' })}
              {InputField({ label: 'CNPJ', name: 'cnpj', placeholder: '00.000.000/0000-00' })}
              {InputField({ label: 'CPF (para MEI ou Pessoa Física)', name: 'cpf', placeholder: '000.000.000-00' })}
              {InputField({ label: 'Data de Abertura', name: 'data_abertura', type: 'date' })}
              {SelectField({ label: 'Regime Tributário', name: 'regime_tributario', options: REGIMES, required: true })}
              {SelectField({ label: 'Porte da Empresa', name: 'porte', options: PORTES })}
              {InputField({ label: 'CNAE Principal', name: 'cnae_principal', placeholder: '0000-0/00' })}
            </div>

            <hr className="border-gray-100" />
            <h3 className="font-semibold text-gray-700 text-sm">📍 Endereço</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">{InputField({ label: 'CEP', name: 'cep', placeholder: '00000-000' })}</div>
              <div className="col-span-2">{InputField({ label: 'Logradouro', name: 'logradouro' })}</div>
              {InputField({ label: 'Número', name: 'numero' })}
              {InputField({ label: 'Complemento', name: 'complemento' })}
              <div className="col-span-2">{InputField({ label: 'Bairro', name: 'bairro' })}</div>
              {InputField({ label: 'Cidade', name: 'cidade', required: true })}
              {InputField({ label: 'UF', name: 'estado', placeholder: 'SP' })}
            </div>

            <hr className="border-gray-100" />
            <h3 className="font-semibold text-gray-700 text-sm">📞 Contato</h3>
            <div className="grid grid-cols-1 gap-4">
              {InputField({ label: 'E-mail da empresa', name: 'email_contabil', type: 'email', required: true })}
              {InputField({ label: 'Telefone / WhatsApp', name: 'telefone_empresa' })}
            </div>

            <hr className="border-gray-100" />
            <h3 className="font-semibold text-gray-700 text-sm">💰 Faturamento estimado</h3>
            {InputField({ label: 'Faturamento Mensal (R$)', name: 'faturamento_mensal', placeholder: '0,00' })}
          </div>
        )}

        {/* ── Step 2: Sócios ── */}
        {step === 2 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-bold text-gray-900 text-lg">👥 Sócios / Responsáveis</h2>
            <p className="text-sm text-gray-500">Informe os sócios da empresa. Se for MEI ou autônomo, coloque seu próprio nome.</p>

            {socios.map((s, idx) => (
              <div key={idx} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-700">Sócio {idx + 1}</span>
                  {socios.length > 1 && (
                    <button
                      onClick={() => setSocios(prev => prev.filter((_, i) => i !== idx))}
                      className="text-red-400 text-xs hover:text-red-600"
                    >
                      Remover
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nome completo <span className="text-red-500">*</span></label>
                    <input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={s.nome} onChange={e => updateSocio(idx, 'nome', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">CPF</label>
                    <input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={s.cpf} onChange={e => updateSocio(idx, 'cpf', e.target.value)} placeholder="000.000.000-00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">% de Participação</label>
                    <input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      type="number" min={0} max={100} step={0.01}
                      value={s.percentual} onChange={e => updateSocio(idx, 'percentual', e.target.value)} placeholder="50" />
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={() => setSocios(prev => [...prev, emptySocio()])}
              className="w-full py-2 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors"
            >
              + Adicionar sócio
            </button>

            <hr className="border-gray-100" />
            <h3 className="font-semibold text-gray-700 text-sm">👷 Funcionários</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer bg-gray-50 rounded-xl p-3 border border-gray-200">
                <input type="checkbox" className="w-4 h-4 accent-blue-600"
                  checked={form.tem_funcionarios} onChange={e => set('tem_funcionarios', e.target.checked)} />
                <div>
                  <p className="text-sm font-medium text-gray-700">Possui funcionários registrados</p>
                  <p className="text-xs text-gray-400">CLT, PJ, autônomos</p>
                </div>
              </label>
              {form.tem_funcionarios && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Quantidade de funcionários</label>
                  <input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    type="number" min={0}
                    value={form.qtd_funcionarios} onChange={e => set('qtd_funcionarios', e.target.value)} />
                </div>
              )}
              <label className="flex items-center gap-3 cursor-pointer bg-gray-50 rounded-xl p-3 border border-gray-200">
                <input type="checkbox" className="w-4 h-4 accent-blue-600"
                  checked={form.tem_pro_labore} onChange={e => set('tem_pro_labore', e.target.checked)} />
                <div>
                  <p className="text-sm font-medium text-gray-700">Possui pró-labore</p>
                  <p className="text-xs text-gray-400">Os sócios recebem via folha de pagamento</p>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* ── Step 3: Sistemas & Histórico ── */}
        {step === 3 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
            <h2 className="font-bold text-gray-900 text-lg">💻 Sistemas & Histórico</h2>

            <div className="space-y-4">
              <h3 className="font-semibold text-gray-700 text-sm">Sistemas utilizados</h3>
              <p className="text-xs text-gray-400">Informe quais softwares você já usa. Isso nos ajuda a integrar melhor.</p>
              {InputField({ label: 'ERP / Sistema de Gestão', name: 'sistema_erp', placeholder: 'Ex: Omie, Bling, SAP, Totvs...' })}
              {InputField({ label: 'Emissor de Nota Fiscal', name: 'sistema_nf', placeholder: 'Ex: NFe.io, portal da prefeitura...' })}
              {InputField({ label: 'Software de Folha de Pagamento', name: 'sistema_folha', placeholder: 'Ex: Domínio, Protheus...' })}
            </div>

            <hr className="border-gray-100" />

            <div className="space-y-4">
              <h3 className="font-semibold text-gray-700 text-sm">🔄 Contabilidade anterior</h3>
              {InputField({ label: 'Nome do escritório ou contador anterior', name: 'escritorio_anterior', placeholder: 'Deixe em branco se não tinha' })}
              {InputField({ label: 'Data prevista de início dos serviços conosco', name: 'data_transicao', type: 'date' })}
            </div>

            <hr className="border-gray-100" />

            <div className="space-y-2">
              <h3 className="font-semibold text-gray-700 text-sm">📝 Observações</h3>
              <p className="text-xs text-gray-400">Algo importante que devemos saber? Urgências, pendências, informações adicionais.</p>
              <textarea
                value={form.observacoes}
                onChange={e => set('observacoes', e.target.value)}
                rows={4}
                placeholder="Ex: Tenho uma autuação fiscal em andamento. Precisamos regularizar o eSocial urgente..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>
        )}

        {/* ── Step 4: Revisão ── */}
        {step === 4 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-bold text-gray-900 text-lg">✅ Revisão</h2>
            <p className="text-sm text-gray-500">Confira os dados antes de enviar. Você pode voltar para corrigir qualquer informação.</p>

            <div className="space-y-3 text-sm">
              <ReviewItem label="Razão Social" value={form.razao_social} />
              <ReviewItem label="CNPJ / CPF" value={form.cnpj || form.cpf} />
              <ReviewItem label="Regime Tributário" value={form.regime_tributario?.replace(/_/g, ' ')} />
              <ReviewItem label="Porte" value={form.porte} />
              <ReviewItem label="Cidade" value={form.cidade ? `${form.cidade}/${form.estado}` : ''} />
              <ReviewItem label="E-mail" value={form.email_contabil} />
              <ReviewItem label="Faturamento Mensal" value={form.faturamento_mensal ? `R$ ${form.faturamento_mensal}` : ''} />
              <ReviewItem label="Sócios" value={socios.filter(s => s.nome).map(s => s.nome).join(', ')} />
              <ReviewItem label="Funcionários" value={form.tem_funcionarios ? `Sim (${form.qtd_funcionarios || '?'})` : 'Não'} />
              {form.sistema_erp && <ReviewItem label="ERP" value={form.sistema_erp} />}
              {form.escritorio_anterior && <ReviewItem label="Escritório anterior" value={form.escritorio_anterior} />}
              {form.observacoes && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-yellow-700 mb-1">Observações</p>
                  <p className="text-xs text-gray-600 whitespace-pre-line">{form.observacoes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navegação */}
        <div className="flex gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep(s => (s - 1) as Step)}
              className="flex-1 py-3 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ← Voltar
            </button>
          )}
          {step < 4 ? (
            <button
              onClick={() => saveStep((step + 1) as Step)}
              disabled={saving}
              className="flex-1 py-3 bg-blue-600 rounded-xl text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Salvando...</>
              ) : (
                'Próximo →'
              )}
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 py-3 bg-green-600 rounded-xl text-sm font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Enviando...</>
              ) : (
                '✓ Enviar ficha'
              )}
            </button>
          )}
        </div>

        <p className="text-center text-xs text-gray-400">
          Seus dados são confidenciais e usados apenas pelo escritório contábil.
        </p>
      </div>
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
      <span className="text-gray-500 font-medium shrink-0">{label}</span>
      <span className="text-gray-900 text-right">{value}</span>
    </div>
  );
}
