'use client';

import { useState } from 'react';
import {
  Calculator, FileText, Building2, Users, TrendingUp,
  Receipt, ClipboardList, BookOpen, Plus, Search,
  CheckCircle2, ChevronDown, ChevronUp, Star,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Servico {
  id: string;
  categoria: string;
  nome: string;
  descricao: string;
  detalhes: string[];
  regime: string[];
  periodicidade: 'Mensal' | 'Anual' | 'Avulso';
  destaque?: boolean;
}

// ─── Catálogo de serviços contábeis ───────────────────────────────────────────

const CATEGORIAS = [
  { id: 'TODOS',         label: 'Todos',                icon: <BookOpen size={16} /> },
  { id: 'CONTABILIDADE', label: 'Contabilidade',        icon: <Calculator size={16} /> },
  { id: 'FISCAL',        label: 'Fiscal / Tributário',  icon: <Receipt size={16} /> },
  { id: 'PESSOAL',       label: 'Depto. Pessoal',       icon: <Users size={16} /> },
  { id: 'ABERTURA',      label: 'Abertura / Alteração', icon: <Building2 size={16} /> },
  { id: 'CONSULTORIA',   label: 'Consultoria',          icon: <TrendingUp size={16} /> },
  { id: 'DECLARACOES',   label: 'Declarações',          icon: <FileText size={16} /> },
];

const SERVICOS: Servico[] = [
  // CONTABILIDADE
  {
    id: '1',
    categoria: 'CONTABILIDADE',
    nome: 'Contabilidade Mensal',
    descricao: 'Escrituração contábil completa com emissão de balancetes e demonstrativos.',
    detalhes: [
      'Lançamentos contábeis mensais',
      'Balancete de verificação',
      'DRE — Demonstração de Resultado',
      'Controle patrimonial',
      'Relatórios gerenciais',
    ],
    regime: ['Simples Nacional', 'Lucro Presumido', 'Lucro Real'],
    periodicidade: 'Mensal',
    destaque: true,
  },
  {
    id: '2',
    categoria: 'CONTABILIDADE',
    nome: 'Balanço Patrimonial Anual',
    descricao: 'Elaboração e assinatura do balanço patrimonial com notas explicativas.',
    detalhes: [
      'Balanço Patrimonial completo',
      'Notas explicativas',
      'Assinatura de contador responsável',
      'Publicação (quando obrigatório)',
    ],
    regime: ['Lucro Presumido', 'Lucro Real'],
    periodicidade: 'Anual',
  },

  // FISCAL
  {
    id: '3',
    categoria: 'FISCAL',
    nome: 'Apuração de Impostos — Simples Nacional',
    descricao: 'Apuração mensal do DAS e envio ao Simples Nacional.',
    detalhes: [
      'Apuração mensal do DAS',
      'Conferência de faturamento',
      'Enquadramento de atividades',
      'Acompanhamento de sublimites',
    ],
    regime: ['Simples Nacional', 'MEI'],
    periodicidade: 'Mensal',
    destaque: true,
  },
  {
    id: '4',
    categoria: 'FISCAL',
    nome: 'Apuração de Impostos — Lucro Presumido',
    descricao: 'Apuração trimestral de IRPJ, CSLL, PIS, COFINS e DCTF.',
    detalhes: [
      'IRPJ e CSLL trimestrais',
      'PIS e COFINS mensais',
      'DCTF mensal',
      'SPED Contribuições',
    ],
    regime: ['Lucro Presumido'],
    periodicidade: 'Mensal',
  },
  {
    id: '5',
    categoria: 'FISCAL',
    nome: 'SPED Fiscal e Contábil',
    descricao: 'Geração, validação e transmissão dos arquivos SPED.',
    detalhes: [
      'ECD — Escrituração Contábil Digital',
      'ECF — Escrituração Contábil Fiscal',
      'EFD — Escrituração Fiscal Digital',
      'Transmissão e recibo de entrega',
    ],
    regime: ['Lucro Presumido', 'Lucro Real'],
    periodicidade: 'Anual',
  },

  // PESSOAL
  {
    id: '6',
    categoria: 'PESSOAL',
    nome: 'Folha de Pagamento',
    descricao: 'Processamento mensal da folha com todos os encargos trabalhistas.',
    detalhes: [
      'Cálculo de salários e encargos',
      'FGTS e INSS patronal',
      'IRRF dos funcionários',
      'Holerites digitais',
      'eSocial mensal',
    ],
    regime: ['Simples Nacional', 'Lucro Presumido', 'Lucro Real'],
    periodicidade: 'Mensal',
    destaque: true,
  },
  {
    id: '7',
    categoria: 'PESSOAL',
    nome: 'Admissão e Rescisão',
    descricao: 'Elaboração de contratos, registro e rescisão de funcionários.',
    detalhes: [
      'Contrato de trabalho',
      'Registro no eSocial',
      'Cálculo de verbas rescisórias',
      'Termo de rescisão (TRCT)',
      'Homologação',
    ],
    regime: ['Simples Nacional', 'Lucro Presumido', 'Lucro Real'],
    periodicidade: 'Avulso',
  },
  {
    id: '8',
    categoria: 'PESSOAL',
    nome: '13º Salário e Férias',
    descricao: 'Cálculo de 13º salário e folha de férias com IRRF e INSS.',
    detalhes: [
      'Cálculo de férias',
      'Cálculo de 13º (1ª e 2ª parcelas)',
      'DARF de IRRF',
      'Holerites específicos',
    ],
    regime: ['Simples Nacional', 'Lucro Presumido', 'Lucro Real'],
    periodicidade: 'Avulso',
  },

  // ABERTURA
  {
    id: '9',
    categoria: 'ABERTURA',
    nome: 'Abertura de Empresa',
    descricao: 'Processo completo de abertura de empresa com definição de regime tributário.',
    detalhes: [
      'Consulta de viabilidade',
      'Elaboração do contrato social',
      'Registro na Junta Comercial',
      'CNPJ, Inscrição Estadual e Municipal',
      'Alvará de funcionamento',
      'Enquadramento no regime tributário',
    ],
    regime: ['MEI', 'Simples Nacional', 'Lucro Presumido'],
    periodicidade: 'Avulso',
    destaque: true,
  },
  {
    id: '10',
    categoria: 'ABERTURA',
    nome: 'Alteração Contratual',
    descricao: 'Alterações no contrato social: sócios, endereço, objeto social.',
    detalhes: [
      'Elaboração da alteração',
      'Registro na Junta Comercial',
      'Atualização de cadastros',
      'CNPJ atualizado',
    ],
    regime: ['Simples Nacional', 'Lucro Presumido', 'Lucro Real'],
    periodicidade: 'Avulso',
  },
  {
    id: '11',
    categoria: 'ABERTURA',
    nome: 'Encerramento de Empresa',
    descricao: 'Baixa de CNPJ e encerramento de todas as obrigações acessórias.',
    detalhes: [
      'Distrato social',
      'Baixa na Junta Comercial',
      'Baixa de CNPJ, IE e IM',
      'Declarações finais',
      'Certidões negativas',
    ],
    regime: ['Simples Nacional', 'Lucro Presumido', 'Lucro Real'],
    periodicidade: 'Avulso',
  },

  // DECLARAÇÕES
  {
    id: '12',
    categoria: 'DECLARACOES',
    nome: 'IRPF — Imposto de Renda Pessoa Física',
    descricao: 'Elaboração e transmissão da declaração anual de IRPF.',
    detalhes: [
      'Coleta e organização de documentos',
      'Lançamento de rendimentos e deduções',
      'Declaração de bens e direitos',
      'Transmissão via e-CAC',
      'Acompanhamento do processamento',
    ],
    regime: ['PF'],
    periodicidade: 'Anual',
    destaque: true,
  },
  {
    id: '13',
    categoria: 'DECLARACOES',
    nome: 'DEFIS — Declaração do Simples Nacional',
    descricao: 'Entrega anual da DEFIS para empresas optantes pelo Simples Nacional.',
    detalhes: [
      'Preenchimento da DEFIS',
      'Informações de sócios',
      'Transmissão no Portal do Simples',
      'Recibo de entrega',
    ],
    regime: ['Simples Nacional'],
    periodicidade: 'Anual',
  },
  {
    id: '14',
    categoria: 'DECLARACOES',
    nome: 'PGDAS-D — Apuração Simples',
    descricao: 'Declaração mensal de apuração do Simples Nacional.',
    detalhes: [
      'Apuração mensal',
      'Cálculo do DAS',
      'Transmissão no PGDAS-D',
      'Guia de pagamento',
    ],
    regime: ['Simples Nacional'],
    periodicidade: 'Mensal',
  },

  // CONSULTORIA
  {
    id: '15',
    categoria: 'CONSULTORIA',
    nome: 'Planejamento Tributário',
    descricao: 'Análise e otimização da carga tributária da empresa.',
    detalhes: [
      'Levantamento da situação atual',
      'Comparativo de regimes tributários',
      'Simulações de economia fiscal',
      'Relatório com recomendações',
      'Reunião de apresentação',
    ],
    regime: ['Simples Nacional', 'Lucro Presumido', 'Lucro Real'],
    periodicidade: 'Avulso',
    destaque: true,
  },
  {
    id: '16',
    categoria: 'CONSULTORIA',
    nome: 'Consultoria Contábil',
    descricao: 'Suporte especializado para questões contábeis e fiscais pontuais.',
    detalhes: [
      'Análise de situações específicas',
      'Orientação sobre obrigações',
      'Pareceres técnicos',
      'Acompanhamento em fiscalizações',
    ],
    regime: ['Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'MEI', 'PF'],
    periodicidade: 'Avulso',
  },
];

// ─── Cores por categoria ───────────────────────────────────────────────────────

const CATEGORIA_COLORS: Record<string, string> = {
  CONTABILIDADE: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  FISCAL:        'bg-amber-500/15 text-amber-400 border-amber-500/30',
  PESSOAL:       'bg-green-500/15 text-green-400 border-green-500/30',
  ABERTURA:      'bg-purple-500/15 text-purple-400 border-purple-500/30',
  DECLARACOES:   'bg-red-500/15 text-red-400 border-red-500/30',
  CONSULTORIA:   'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
};

const PERIODO_COLORS: Record<string, string> = {
  Mensal:  'bg-emerald-500/10 text-emerald-400',
  Anual:   'bg-violet-500/10 text-violet-400',
  Avulso:  'bg-slate-500/10 text-slate-400',
};

// ─── Document classification ──────────────────────────────────────────────────

const TIPOS_DOCUMENTOS = [
  { id: 'CLIENTE',         label: 'Documentos do Cliente',       desc: 'RG, CPF, CNPJ, contrato social, etc.',          cor: 'bg-blue-500/15 text-blue-400',    icone: <ClipboardList size={18} /> },
  { id: 'NFE',             label: 'NF-e / NFS-e',                desc: 'Notas fiscais de entrada e saída.',              cor: 'bg-amber-500/15 text-amber-400',  icone: <Receipt size={18} /> },
  { id: 'FOLHA',           label: 'Folha de Pagamento',          desc: 'Holerites, rescisões, férias, 13º.',             cor: 'bg-green-500/15 text-green-400',  icone: <Users size={18} /> },
  { id: 'IMPOSTOS',        label: 'Impostos / Declarações',      desc: 'DAS, DARF, DCTF, DEFIS, IRPF, ECF.',            cor: 'bg-red-500/15 text-red-400',      icone: <FileText size={18} /> },
  { id: 'BALANCETE',       label: 'Balancetes / DRE',            desc: 'Balancetes, DRE, balanço patrimonial.',          cor: 'bg-cyan-500/15 text-cyan-400',    icone: <TrendingUp size={18} /> },
  { id: 'CONTRATO_SOCIAL', label: 'Contrato Social',             desc: 'Contrato, alterações, atas de reunião.',        cor: 'bg-purple-500/15 text-purple-400',icone: <Building2 size={18} /> },
  { id: 'CONTRATOS',       label: 'Contratos de Serviço',        desc: 'Contratos com clientes e fornecedores.',        cor: 'bg-indigo-500/15 text-indigo-400',icone: <FileText size={18} /> },
  { id: 'PROCURACOES',     label: 'Procurações',                 desc: 'Procurações para representação fiscal.',        cor: 'bg-orange-500/15 text-orange-400',icone: <CheckCircle2 size={18} /> },
  { id: 'OUTROS',          label: 'Outros',                      desc: 'Documentos não classificados.',                 cor: 'bg-slate-500/15 text-slate-400',  icone: <BookOpen size={18} /> },
];

// ─── Card de serviço ─────────────────────────────────────────────────────────

function ServicoCard({ servico }: { servico: Servico }) {
  const [expanded, setExpanded] = useState(false);
  const catColor = CATEGORIA_COLORS[servico.categoria] ?? 'bg-slate-500/15 text-slate-400';
  const perColor = PERIODO_COLORS[servico.periodicidade] ?? 'bg-slate-500/10 text-slate-400';

  return (
    <div className={`rounded-xl border bg-base-200 transition-all duration-200 ${servico.destaque ? 'border-[#A89048]/40' : 'border-base-300'}`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {servico.destaque && (
                <span className="flex items-center gap-1 text-xs font-semibold text-[#A89048]">
                  <Star size={11} fill="currentColor" /> Destaque
                </span>
              )}
              <span className={`badge badge-xs border ${catColor}`}>
                {CATEGORIAS.find(c => c.id === servico.categoria)?.label}
              </span>
              <span className={`badge badge-xs ${perColor}`}>{servico.periodicidade}</span>
            </div>
            <h3 className="font-semibold text-base-content text-sm">{servico.nome}</h3>
            <p className="text-xs text-base-content/60 mt-1 leading-relaxed">{servico.descricao}</p>
          </div>
          <button
            onClick={() => setExpanded(v => !v)}
            className="btn btn-ghost btn-xs btn-square shrink-0 mt-1"
            aria-label="Expandir detalhes"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* Regimes */}
        <div className="flex flex-wrap gap-1 mt-3">
          {servico.regime.map(r => (
            <span key={r} className="badge badge-xs badge-outline text-base-content/50">{r}</span>
          ))}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-base-300 pt-3">
          <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2">O que está incluído</p>
          <ul className="space-y-1">
            {servico.detalhes.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-base-content/70">
                <CheckCircle2 size={13} className="text-[#A89048] mt-0.5 shrink-0" />
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ServicosPage() {
  const [categoriaSelecionada, setCategoriaSelecionada] = useState('TODOS');
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState<'servicos' | 'documentos'>('servicos');

  const servicosFiltrados = SERVICOS.filter(s => {
    const matchCategoria = categoriaSelecionada === 'TODOS' || s.categoria === categoriaSelecionada;
    const matchBusca = !busca || s.nome.toLowerCase().includes(busca.toLowerCase()) || s.descricao.toLowerCase().includes(busca.toLowerCase());
    return matchCategoria && matchBusca;
  });

  const destaques = servicosFiltrados.filter(s => s.destaque);
  const demais = servicosFiltrados.filter(s => !s.destaque);

  return (
    <div className="flex flex-col h-full bg-base-100">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-base-200 shrink-0">
        <div className="flex items-center gap-3">
          <Calculator size={22} className="text-[#A89048]" />
          <div>
            <h1 className="text-base font-bold text-base-content">Serviços Contábeis</h1>
            <p className="text-xs text-base-content/50">Catálogo de serviços e classificação de documentos</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge badge-outline badge-sm">{SERVICOS.length} serviços</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-4 shrink-0">
        <button
          onClick={() => setAba('servicos')}
          className={`btn btn-sm rounded-lg ${aba === 'servicos' ? 'btn-primary' : 'btn-ghost'}`}
        >
          <Calculator size={14} /> Serviços
        </button>
        <button
          onClick={() => setAba('documentos')}
          className={`btn btn-sm rounded-lg ${aba === 'documentos' ? 'btn-primary' : 'btn-ghost'}`}
        >
          <FileText size={14} /> Classificação de Documentos
        </button>
      </div>

      {/* ── ABA SERVIÇOS ─────────────────────────────────────────────────────── */}
      {aba === 'servicos' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Filtros */}
          <div className="px-6 pt-3 pb-3 shrink-0 space-y-3">
            {/* Busca */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
              <input
                type="text"
                placeholder="Buscar serviço…"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                className="input input-sm input-bordered w-full pl-8"
              />
            </div>
            {/* Categorias */}
            <div className="flex flex-wrap gap-1">
              {CATEGORIAS.map(c => (
                <button
                  key={c.id}
                  onClick={() => setCategoriaSelecionada(c.id)}
                  className={`btn btn-xs gap-1 ${categoriaSelecionada === c.id ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                >
                  {c.icon} {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {servicosFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-base-content/40 gap-2">
                <Calculator size={32} />
                <p className="text-sm">Nenhum serviço encontrado</p>
              </div>
            ) : (
              <div className="space-y-5">
                {destaques.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[#A89048] uppercase tracking-wide mb-2 flex items-center gap-1">
                      <Star size={12} fill="currentColor" /> Em destaque
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {destaques.map(s => <ServicoCard key={s.id} servico={s} />)}
                    </div>
                  </div>
                )}
                {demais.length > 0 && (
                  <div>
                    {destaques.length > 0 && (
                      <p className="text-xs font-semibold text-base-content/40 uppercase tracking-wide mb-2">Demais serviços</p>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {demais.map(s => <ServicoCard key={s.id} servico={s} />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ABA DOCUMENTOS ───────────────────────────────────────────────────── */}
      {aba === 'documentos' && (
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <p className="text-xs text-base-content/50 mb-4">
            Classificação utilizada nas pastas de documentos de cada cliente no workspace.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {TIPOS_DOCUMENTOS.map(tipo => (
              <div key={tipo.id} className="rounded-xl border border-base-300 bg-base-200 p-4 flex gap-3 items-start">
                <div className={`p-2 rounded-lg ${tipo.cor} shrink-0`}>
                  {tipo.icone}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-base-content">{tipo.label}</p>
                  <p className="text-xs text-base-content/50 mt-0.5 leading-relaxed">{tipo.desc}</p>
                  <span className="mt-2 inline-block badge badge-xs badge-outline text-base-content/40 font-mono">{tipo.id}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
