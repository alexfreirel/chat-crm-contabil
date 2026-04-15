'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Building2,
  FileText,
  MapPin,
  Users,
  Briefcase,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  Lock,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FichaContabil {
  // Dados da empresa
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  cpf: string;
  data_abertura: string;
  regime_tributario: string;
  porte: string;
  natureza_juridica: string;
  cnae_principal: string;
  inscricao_estadual: string;
  inscricao_municipal: string;
  // Endereço
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  // Contato
  email_contabil: string;
  telefone_empresa: string;
  // Departamento Pessoal
  tem_funcionarios: boolean;
  qtd_funcionarios: string;
  tem_pro_labore: boolean;
  // Serviços
  servicos: string[];
}

const REGIMES = [
  { value: 'MEI', label: 'MEI — Microempreendedor Individual' },
  { value: 'SIMPLES_NACIONAL', label: 'Simples Nacional' },
  { value: 'LUCRO_PRESUMIDO', label: 'Lucro Presumido' },
  { value: 'LUCRO_REAL', label: 'Lucro Real' },
  { value: 'ISENTO', label: 'Isento / Sem fins lucrativos' },
];

const PORTES = [
  { value: 'MEI', label: 'MEI' },
  { value: 'ME', label: 'ME — Microempresa' },
  { value: 'EPP', label: 'EPP — Empresa de Pequeno Porte' },
  { value: 'MEDIO', label: 'Médio Porte' },
  { value: 'GRANDE', label: 'Grande Porte' },
];

const SERVICOS_OPCOES = [
  { value: 'BPO_CONTABIL', label: 'BPO Contábil (escrituração contábil)' },
  { value: 'BPO_FISCAL', label: 'BPO Fiscal (escrituração fiscal)' },
  { value: 'DP', label: 'Departamento Pessoal (folha de pagamento)' },
  { value: 'ABERTURA', label: 'Abertura de empresa' },
  { value: 'ENCERRAMENTO', label: 'Encerramento de empresa' },
  { value: 'IR_PF', label: 'Declaração de IR Pessoa Física' },
  { value: 'IR_PJ', label: 'Declaração de IR Pessoa Jurídica' },
  { value: 'CONSULTORIA', label: 'Consultoria Tributária' },
];

const ESTADOS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

// ─── Steps ────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 'empresa',   label: 'Empresa',    icon: Building2 },
  { id: 'endereco',  label: 'Endereço',   icon: MapPin },
  { id: 'contato',   label: 'Contato',    icon: FileText },
  { id: 'pessoal',   label: 'Pessoal',    icon: Users },
  { id: 'servicos',  label: 'Serviços',   icon: Briefcase },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function FormularioCadastroPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [cepLoading, setCepLoading] = useState(false);

  const [form, setForm] = useState<FichaContabil>({
    razao_social: '',
    nome_fantasia: '',
    cnpj: '',
    cpf: '',
    data_abertura: '',
    regime_tributario: '',
    porte: '',
    natureza_juridica: '',
    cnae_principal: '',
    inscricao_estadual: '',
    inscricao_municipal: '',
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
    email_contabil: '',
    telefone_empresa: '',
    tem_funcionarios: false,
    qtd_funcionarios: '',
    tem_pro_labore: false,
    servicos: [],
  });

  // Máscara simples de CNPJ
  function maskCnpj(v: string) {
    return v
      .replace(/\D/g, '')
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .slice(0, 18);
  }

  // Máscara de CEP
  function maskCep(v: string) {
    return v.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 9);
  }

  // Máscara de telefone
  function maskPhone(v: string) {
    const d = v.replace(/\D/g, '');
    if (d.length <= 10)
      return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
    return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').slice(0, 15);
  }

  function set(field: keyof FichaContabil, value: any) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function toggleServico(val: string) {
    setForm(prev => ({
      ...prev,
      servicos: prev.servicos.includes(val)
        ? prev.servicos.filter(s => s !== val)
        : [...prev.servicos, val],
    }));
  }

  async function buscarCep(cep: string) {
    const raw = cep.replace(/\D/g, '');
    if (raw.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm(prev => ({
          ...prev,
          logradouro: data.logradouro || prev.logradouro,
          bairro: data.bairro || prev.bairro,
          cidade: data.localidade || prev.cidade,
          estado: data.uf || prev.estado,
        }));
      }
    } catch {}
    setCepLoading(false);
  }

  async function handleSubmit() {
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, any> = { ...form };
      // Limpar máscaras para envio
      payload.cnpj = form.cnpj.replace(/\D/g, '');
      payload.cep = form.cep.replace(/\D/g, '');
      payload.telefone_empresa = form.telefone_empresa.replace(/\D/g, '');
      payload.qtd_funcionarios = form.tem_funcionarios
        ? parseInt(form.qtd_funcionarios) || 0
        : 0;

      const res = await fetch(`/api/ficha-contabil/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Erro ao salvar');
      setSubmitted(true);
    } catch (e: any) {
      setError('Ocorreu um erro ao salvar. Tente novamente.');
    }
    setSaving(false);
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Cadastro enviado com sucesso!
          </h1>
          <p className="text-gray-500 mb-6">
            Recebemos seus dados. Nossa equipe entrará em contato em breve para
            finalizar seu contrato de serviços contábeis.
          </p>
          <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700">
            Caso tenha dúvidas, entre em contato via WhatsApp com nosso time.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Cadastro Contábil</h1>
          <p className="text-gray-500 mt-2">
            Preencha os dados da sua empresa para agilizarmos o atendimento
          </p>
        </div>

        {/* Progress bar */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-6">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = i < step;
              const active = i === step;
              return (
                <div key={s.id} className="flex items-center flex-1">
                  <button
                    onClick={() => i < step && setStep(i)}
                    className={`flex flex-col items-center gap-1 flex-shrink-0 ${
                      i < step ? 'cursor-pointer' : 'cursor-default'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                        done
                          ? 'bg-green-500 text-white'
                          : active
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {done ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                    </div>
                    <span
                      className={`text-xs font-medium hidden sm:block ${
                        active ? 'text-blue-600' : done ? 'text-green-600' : 'text-gray-400'
                      }`}
                    >
                      {s.label}
                    </span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-1 mx-2 rounded ${
                        i < step ? 'bg-green-400' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">

          {/* ── Step 0: Empresa ── */}
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" /> Dados da Empresa
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Razão Social <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.razao_social}
                    onChange={e => set('razao_social', e.target.value)}
                    placeholder="Nome completo da empresa"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nome Fantasia
                  </label>
                  <input
                    type="text"
                    value={form.nome_fantasia}
                    onChange={e => set('nome_fantasia', e.target.value)}
                    placeholder="Nome comercial (opcional)"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CNPJ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.cnpj}
                    onChange={e => set('cnpj', maskCnpj(e.target.value))}
                    placeholder="00.000.000/0000-00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CPF do Responsável
                  </label>
                  <input
                    type="text"
                    value={form.cpf}
                    onChange={e => set('cpf', e.target.value.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4').slice(0, 14))}
                    placeholder="000.000.000-00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data de Abertura
                  </label>
                  <input
                    type="date"
                    value={form.data_abertura}
                    onChange={e => set('data_abertura', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CNAE Principal
                  </label>
                  <input
                    type="text"
                    value={form.cnae_principal}
                    onChange={e => set('cnae_principal', e.target.value)}
                    placeholder="Ex: 6920-6/01"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Regime Tributário <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.regime_tributario}
                    onChange={e => set('regime_tributario', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">Selecione...</option>
                    {REGIMES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Porte da Empresa
                  </label>
                  <select
                    value={form.porte}
                    onChange={e => set('porte', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">Selecione...</option>
                    {PORTES.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Inscrição Estadual
                  </label>
                  <input
                    type="text"
                    value={form.inscricao_estadual}
                    onChange={e => set('inscricao_estadual', e.target.value)}
                    placeholder="IE (se houver)"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Inscrição Municipal
                  </label>
                  <input
                    type="text"
                    value={form.inscricao_municipal}
                    onChange={e => set('inscricao_municipal', e.target.value)}
                    placeholder="IM (se houver)"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Natureza Jurídica
                  </label>
                  <input
                    type="text"
                    value={form.natureza_juridica}
                    onChange={e => set('natureza_juridica', e.target.value)}
                    placeholder="Ex: 206-2 — Sociedade Empresária Limitada"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 1: Endereço ── */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-600" /> Endereço
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CEP <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={form.cep}
                      onChange={e => {
                        const v = maskCep(e.target.value);
                        set('cep', v);
                        if (v.replace(/\D/g, '').length === 8) buscarCep(v);
                      }}
                      placeholder="00000-000"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                    />
                    {cepLoading && (
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400 absolute right-2 top-2.5" />
                    )}
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Logradouro <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.logradouro}
                    onChange={e => set('logradouro', e.target.value)}
                    placeholder="Rua, Avenida, etc."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Número <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.numero}
                    onChange={e => set('numero', e.target.value)}
                    placeholder="Ex: 123"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Complemento
                  </label>
                  <input
                    type="text"
                    value={form.complemento}
                    onChange={e => set('complemento', e.target.value)}
                    placeholder="Sala, Andar, etc."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bairro
                  </label>
                  <input
                    type="text"
                    value={form.bairro}
                    onChange={e => set('bairro', e.target.value)}
                    placeholder="Bairro"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cidade <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.cidade}
                    onChange={e => set('cidade', e.target.value)}
                    placeholder="Cidade"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Estado <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.estado}
                    onChange={e => set('estado', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">UF</option>
                    {ESTADOS.map(uf => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Contato ── */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" /> Contato da Empresa
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    E-mail Contábil <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={form.email_contabil}
                    onChange={e => set('email_contabil', e.target.value)}
                    placeholder="contato@empresa.com.br"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Usado para envio de documentos e obrigações fiscais
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Telefone da Empresa
                  </label>
                  <input
                    type="tel"
                    value={form.telefone_empresa}
                    onChange={e => set('telefone_empresa', maskPhone(e.target.value))}
                    placeholder="(00) 00000-0000"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700 flex items-start gap-3">
                  <Lock className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>
                    Seus dados são tratados com total sigilo e utilizados apenas para
                    prestação dos serviços contábeis contratados.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Departamento Pessoal ── */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" /> Departamento Pessoal
              </h2>

              <div className="space-y-4">
                <div className="border border-gray-200 rounded-xl p-4 space-y-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.tem_funcionarios}
                      onChange={e => set('tem_funcionarios', e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="font-medium text-gray-900">A empresa possui funcionários?</p>
                      <p className="text-xs text-gray-500">CLT, PJ contratados ou outros vínculos</p>
                    </div>
                  </label>

                  {form.tem_funcionarios && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Quantos funcionários?
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={form.qtd_funcionarios}
                        onChange={e => set('qtd_funcionarios', e.target.value)}
                        placeholder="Ex: 5"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                </div>

                <div className="border border-gray-200 rounded-xl p-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.tem_pro_labore}
                      onChange={e => set('tem_pro_labore', e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="font-medium text-gray-900">Os sócios retiram pró-labore?</p>
                      <p className="text-xs text-gray-500">
                        Remuneração mensal dos sócios administradores
                      </p>
                    </div>
                  </label>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
                  <strong>Por que isso importa?</strong> O DP inclui processamento de folha,
                  FGTS, eSocial, DIRF e RAIS. Sabendo o porte da equipe, dimensionamos
                  melhor o serviço e o honorário mensal.
                </div>
              </div>
            </div>
          )}

          {/* ── Step 4: Serviços ── */}
          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-blue-600" /> Serviços de Interesse
              </h2>
              <p className="text-sm text-gray-500">
                Selecione todos os serviços que sua empresa precisa:
              </p>

              <div className="space-y-2">
                {SERVICOS_OPCOES.map(s => (
                  <label
                    key={s.value}
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                      form.servicos.includes(s.value)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.servicos.includes(s.value)}
                      onChange={() => toggleServico(s.value)}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className={`text-sm font-medium ${
                      form.servicos.includes(s.value) ? 'text-blue-700' : 'text-gray-700'
                    }`}>
                      {s.label}
                    </span>
                  </label>
                ))}
              </div>

              {form.servicos.length === 0 && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  Selecione pelo menos um serviço para continuar.
                </p>
              )}

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                  {error}
                </p>
              )}
            </div>
          )}

          {/* ── Navigation ── */}
          <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
            <button
              onClick={() => setStep(s => Math.max(0, s - 1))}
              disabled={step === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>

            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow"
              >
                Próximo <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={saving || form.servicos.length === 0}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Enviando...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Enviar Cadastro
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-6 text-xs text-gray-400">
          Formulário seguro · Seus dados não são compartilhados com terceiros
        </div>
      </div>
    </div>
  );
}
