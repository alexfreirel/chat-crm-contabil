'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  CheckCircle2, AlertTriangle, Clock, FileText,
  CreditCard, Building2, User, RefreshCw, MessageCircle,
  ChevronRight, Calendar, DollarSign, ShieldCheck, Download, FileSignature,
  Palette, Check, LogOut, Receipt, Banknote,
} from 'lucide-react';
import axios from 'axios';
import { useTheme } from 'next-themes';
import { THEMES } from '@/components/ThemeSwitcher';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';

// ── Cliente do portal (sem auth, usa token na URL) ────────────────────────────
const portalApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005',
});

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface PortalInfo {
  cliente: {
    id: string;
    nome: string;
    email: string | null;
    phone: string | null;
    stage: string;
    service_type: string;
    regime_tributario: string | null;
    contador: string | null;
  };
  resumo: {
    totalObrigacoes: number;
    vencidas: number;
    concluidas: number;
    pendentes: number;
    totalPendente: number;
    totalPago: number;
  };
}

interface Obrigacao {
  id: string;
  tipo: string;
  titulo: string;
  due_at: string;
  completed: boolean;
  status: 'CONCLUIDA' | 'VENCIDA' | 'PENDENTE';
}

interface Documento {
  id: string;
  name: string;
  folder: string;
  mime_type: string | null;
  size: number | null;
  competencia: string | null;
  created_at: string;
}

interface Parcela {
  id: string;
  amount: number;
  due_date: string;
  paid_at: string | null;
  status: string;
  payment_method: string | null;
  competencia: string | null;
  tipo: string | null;
}

interface ContratoArquivo {
  id: string;
  titulo: string;
  anexadoEm: string | null;
}

interface CertidaoArquivo {
  id: string;
  nome: string;
  tipo: string;
  atualizadaEm: string | null;
}

interface ImpostoArquivo {
  id: string;
  nome: string;
  tipo: string;
  competencia: string;
  atualizadaEm: string | null;
}

const IMPOSTOS_TITULOS: Record<string, { titulo: string; grupo: string }> = {
  simples:         { titulo: 'Simples Nacional',                grupo: 'Federal' },
  pis_cofins:      { titulo: 'PIS e COFINS',                    grupo: 'Federal' },
  irpj_csll:       { titulo: 'IRPJ e CSLL',                     grupo: 'Federal' },
  federal_outros:  { titulo: 'Outros',                          grupo: 'Federal' },
  pgdas:           { titulo: 'PGDAS-D Simples Nacional',        grupo: 'Federal' },
  icms_antecipado: { titulo: 'ICMS Antecipado e FECOEP',        grupo: 'Estadual' },
  icms_st:         { titulo: 'ICMS Subst. Tributária e FECOEP', grupo: 'Estadual' },
  icms_normal:     { titulo: 'ICMS Normal',                     grupo: 'Estadual' },
  estadual_outros: { titulo: 'Outros',                          grupo: 'Estadual' },
  iss:             { titulo: 'ISS',                             grupo: 'Municipal' },
};

const FOLHA_TITULOS: Record<string, { titulo: string; grupo: string }> = {
  resumo:        { titulo: 'Resumo da Folha', grupo: 'Folha do mês' },
  contracheques: { titulo: 'Contra-cheques',  grupo: 'Folha do mês' },
  fgts:          { titulo: 'FGTS',            grupo: 'Folha do mês' },
  inss:          { titulo: 'INSS',            grupo: 'Folha do mês' },
  admissao:      { titulo: 'Admissão',        grupo: 'Movimentações' },
  rescisao:      { titulo: 'Rescisão',        grupo: 'Movimentações' },
  ferias:        { titulo: 'Férias',          grupo: 'Movimentações' },
};

const MESES_NOME =['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const rotuloCompetencia = (c: string) => {
  const [a, m] = c.split('-').map(Number);
  return a && m ? `${MESES_NOME[m - 1]} de ${a}` : c;
};

const CERTIDOES_TIPOS = [
  { tipo: 'cnd',         titulo: 'CND Federal',  subtitulo: 'Receita Federal' },
  { tipo: 'fgts',        titulo: 'CRF FGTS',     subtitulo: 'Caixa' },
  { tipo: 'trabalhista', titulo: 'Trabalhista',  subtitulo: 'TST' },
  { tipo: 'falencia',    titulo: 'Falência',     subtitulo: 'TJAL' },
  { tipo: 'estadual',    titulo: 'Estadual',     subtitulo: 'SEFAZ-AL' },
  { tipo: 'municipal',   titulo: 'Municipal',    subtitulo: 'Prefeitura de Arapiraca' },
];

// ── Utilitários ────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const STAGE_LABELS: Record<string, string> = {
  ONBOARDING: 'Onboarding',
  ATIVO: 'Ativo',
  SUSPENSO: 'Suspenso',
  ENCERRADO: 'Encerrado',
};

const REGIME_LABELS: Record<string, string> = {
  SIMPLES_NACIONAL: 'Simples Nacional',
  LUCRO_PRESUMIDO: 'Lucro Presumido',
  LUCRO_REAL: 'Lucro Real',
  MEI: 'MEI',
  ISENTO: 'Isento',
};

const FOLDER_LABELS: Record<string, string> = {
  FISCAL: 'Fiscal',
  CONTABIL: 'Contábil',
  PESSOAL: 'Pessoal',
  PAYROLL: 'Folha',
  SOCIETARIO: 'Societário',
  OUTROS: 'Outros',
};

// ── Componentes ────────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: 'CONCLUIDA' | 'VENCIDA' | 'PENDENTE' }) {
  if (status === 'CONCLUIDA') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
      <CheckCircle2 size={11} /> Concluída
    </span>
  );
  if (status === 'VENCIDA') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
      <AlertTriangle size={11} /> Vencida
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
      <Clock size={11} /> Pendente
    </span>
  );
}

function PaymentChip({ status }: { status: string }) {
  if (status === 'PAGO') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
      <CheckCircle2 size={11} /> Pago
    </span>
  );
  if (status === 'ATRASADO') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
      <AlertTriangle size={11} /> Atrasado
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
      <Clock size={11} /> Pendente
    </span>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────

type TabId = 'resumo' | 'impostos' | 'folha' | 'documentos' | 'certidoes' | 'contratos' | 'financeiro';

const card = 'bg-card rounded-xl border border-border';

export default function PortalClientePage() {
  const params = useParams();
  const router = useRouter();
  const token  = params.token as string;
  const { theme, setTheme } = useTheme();

  const [info, setInfo]             = useState<PortalInfo | null>(null);
  const [impostos, setImpostos]     = useState<ImpostoArquivo[]>([]);
  const [folha, setFolha]           = useState<ImpostoArquivo[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [parcelas, setParcelas]     = useState<Parcela[]>([]);
  const [certidoes, setCertidoes]   = useState<CertidaoArquivo[]>([]);
  const [contratos, setContratos]   = useState<ContratoArquivo[]>([]);
  const [tab, setTab]               = useState<TabId>('resumo');
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [themeOpen, setThemeOpen]   = useState(false);
  const [mounted, setMounted]       = useState(false);
  const themeRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Fecha o menu de temas ao clicar fora
  useEffect(() => {
    if (!themeOpen) return;
    const onClick = (e: MouseEvent) => {
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) setThemeOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [themeOpen]);

  useEffect(() => {
    if (!token) return;
    async function load() {
      setLoading(true);
      try {
        const [infoRes, impRes, folhaRes, docRes, parRes, certRes, contrRes] = await Promise.all([
          portalApi.get(`/portal/info/${token}`),
          portalApi.get(`/portal/impostos/${token}`).catch(() => ({ data: [] })),
          portalApi.get(`/portal/folha/${token}`).catch(() => ({ data: [] })),
          portalApi.get(`/portal/documentos/${token}`),
          portalApi.get(`/portal/parcelas/${token}`),
          portalApi.get(`/portal/certidoes/${token}`).catch(() => ({ data: [] })),
          portalApi.get(`/portal/contratos/${token}`).catch(() => ({ data: [] })),
        ]);
        setInfo(infoRes.data);
        setImpostos(impRes.data ?? []);
        setFolha(folhaRes.data ?? []);
        setDocumentos(docRes.data ?? []);
        setParcelas(parRes.data ?? []);
        setCertidoes(certRes.data ?? []);
        setContratos(contrRes.data ?? []);
      } catch (err: any) {
        if (err.response?.status === 401) {
          setError('Sessão expirada ou inválida. Entre novamente com seu CNPJ e senha.');
        } else {
          setError('Erro ao carregar os dados. Tente novamente mais tarde.');
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <RefreshCw size={24} className="text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Carregando seu portal...</p>
      </div>
    </div>
  );

  if (error || !info) return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-sm text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
          <AlertTriangle size={28} className="text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Acesso inválido</h2>
        <p className="text-sm text-muted-foreground">{error ?? 'Token inválido.'}</p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => router.push('/portal')}
            className="bg-primary text-primary-foreground text-sm font-semibold px-5 py-2.5 rounded-xl"
          >
            Ir para o login
          </button>
          <a
            href="https://wa.me/5582982344993"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            <MessageCircle size={16} /> Contatar o escritório
          </a>
        </div>
      </div>
    </div>
  );

  const { cliente, resumo } = info;

  const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'resumo',      label: 'Resumo',      icon: <Building2 size={18} /> },
    { id: 'impostos',    label: 'Impostos',    icon: <Receipt size={18} /> },
    { id: 'folha',       label: 'Folha de Pagamento', icon: <Banknote size={18} /> },
    { id: 'documentos',  label: 'Documentos',  icon: <FileText size={18} /> },
    { id: 'certidoes',   label: 'Certidões',   icon: <ShieldCheck size={18} /> },
    { id: 'contratos',   label: 'Contratos',   icon: <FileSignature size={18} /> },
    { id: 'financeiro',  label: 'Financeiro',  icon: <DollarSign size={18} /> },
  ];

  // Última certidão de cada tipo (a API já devolve da mais recente para a mais antiga)
  const certidaoPorTipo = new Map<string, CertidaoArquivo>();
  for (const c of certidoes) if (!certidaoPorTipo.has(c.tipo)) certidaoPorTipo.set(c.tipo, c);

  // Alvará de Funcionamento (anexado no Portal do Contador junto das certidões)
  const alvara = certidaoPorTipo.get('alvara');

  // Impostos agrupados por competência (mais recente primeiro)
  const impostosPorCompetencia = new Map<string, ImpostoArquivo[]>();
  for (const i of impostos) {
    if (!i.competencia) continue;
    impostosPorCompetencia.set(i.competencia, [...(impostosPorCompetencia.get(i.competencia) || []), i]);
  }
  const competenciasImpostos = [...impostosPorCompetencia.keys()].sort().reverse();

  // Folha de pagamento agrupada por competência (mais recente primeiro)
  const folhaPorCompetencia = new Map<string, ImpostoArquivo[]>();
  for (const f of folha) {
    if (!f.competencia) continue;
    folhaPorCompetencia.set(f.competencia, [...(folhaPorCompetencia.get(f.competencia) || []), f]);
  }
  const competenciasFolha = [...folhaPorCompetencia.keys()].sort().reverse();

  const sair = () => router.push('/portal');

  return (
    <div className="min-h-screen md:h-screen md:overflow-hidden bg-background text-foreground flex flex-col md:flex-row">

      {/* ── Sidebar (desktop) ── */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-card">
        <div className="px-4 py-4 border-b border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/logo.png" alt="Lexcon" className="h-8 w-auto" />
          <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Portal do Cliente</p>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium shadow-sm transition-colors ${
                tab === t.id
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-border space-y-1.5 relative" ref={themeRef}>
          <a
            href="https://wa.me/5582982344993"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground shadow-sm transition-colors"
          >
            <MessageCircle size={18} /> Falar com o escritório
          </a>

          <button
            onClick={() => setThemeOpen(o => !o)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium shadow-sm transition-colors ${
              themeOpen ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            }`}
          >
            <Palette size={18} /> Aparência
          </button>

          {themeOpen && mounted && (
            <div className="absolute bottom-full left-3 right-3 mb-2 bg-card border border-border rounded-xl p-3 flex flex-col gap-1.5 shadow-2xl z-30">
              <p className="text-[11px] font-bold text-muted-foreground uppercase ml-1 mb-1 tracking-wider">Temas</p>
              {THEMES.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setTheme(t.id); setThemeOpen(false); }}
                  className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm text-foreground transition-colors hover:bg-accent ${theme === t.id ? 'bg-accent' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-3.5 h-3.5 rounded-full border border-border shadow-inner" style={{ background: t.color }} />
                    {t.name}
                  </div>
                  {theme === t.id && <Check size={14} className="text-primary" />}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={sair}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive shadow-sm transition-colors"
          >
            <LogOut size={18} /> Sair
          </button>
        </div>
      </aside>

      {/* ── Topo + abas (mobile) ── */}
      <header className="md:hidden bg-card border-b border-border sticky top-0 z-20">
        <div className="px-4 py-3 flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/logo.png" alt="Lexcon" className="h-7 w-auto" />
          <div className="flex items-center gap-1">
            {mounted && THEMES.map(t => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                title={t.name}
                aria-label={`Tema ${t.name}`}
                className={`w-5 h-5 rounded-full border ${theme === t.id ? 'ring-2 ring-primary ring-offset-1 ring-offset-card' : 'border-border'}`}
                style={{ background: t.color }}
              />
            ))}
            <button onClick={sair} className="ml-2 text-muted-foreground" aria-label="Sair"><LogOut size={16} /></button>
          </div>
        </div>
        <div className="flex overflow-x-auto px-2">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
                tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Conteúdo ── */}
      <div className="flex-1 md:overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full px-4 md:px-8 py-6 space-y-4">

          {/* Cabeçalho do cliente */}
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <User size={22} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-foreground text-xl leading-tight truncate">{cliente.nome}</h1>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {STAGE_LABELS[cliente.stage] ?? cliente.stage}
                </span>
                {cliente.regime_tributario && (
                  <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    {REGIME_LABELS[cliente.regime_tributario] ?? cliente.regime_tributario}
                  </span>
                )}
                {cliente.contador && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    Contador: {cliente.contador}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ─── Resumo ──────────────────────────────────────────────── */}
          {tab === 'resumo' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Total de Obrigações', value: resumo.totalObrigacoes, color: 'text-foreground' },
                  { label: 'Pendentes', value: resumo.pendentes, color: 'text-amber-500' },
                  { label: 'Vencidas', value: resumo.vencidas, color: 'text-red-500' },
                  { label: 'Concluídas', value: resumo.concluidas, color: 'text-emerald-500' },
                ].map(s => (
                  <div key={s.label} className={`${card} p-4`}>
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className={`${card} p-4`}>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <CreditCard size={15} className="text-primary" /> Situação Financeira
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Total em Aberto</p>
                    <p className="text-lg font-bold text-amber-500">{fmtBRL(resumo.totalPendente)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Pago</p>
                    <p className="text-lg font-bold text-emerald-500">{fmtBRL(resumo.totalPago)}</p>
                  </div>
                </div>
              </div>

              {resumo.vencidas > 0 && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-500">
                      Atenção: {resumo.vencidas} obrigação{resumo.vencidas > 1 ? 'ões' : ''} vencida{resumo.vencidas > 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Entre em contato com o escritório para regularização.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {([
                  ['impostos', 'Ver Impostos'],
                  ['certidoes', 'Ver Certidões'],
                  ['financeiro', 'Ver Pagamentos'],
                ] as [TabId, string][]).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={`${card} p-4 flex items-center justify-between hover:bg-accent/50 transition-colors`}
                  >
                    <span className="text-sm font-medium text-foreground">{label}</span>
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ─── Obrigações ──────────────────────────────────────────── */}
          {tab === 'impostos' && (
            <div className={`${card} overflow-hidden`}>
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Impostos</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Guias mensais disponibilizadas pelo escritório. A data indica quando cada guia foi anexada ou atualizada.
                </p>
              </div>
              {competenciasImpostos.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">Nenhum imposto disponível</div>
              ) : (
                competenciasImpostos.map(comp => (
                  <div key={comp}>
                    <div className="px-4 py-2 bg-muted/40 border-y border-border/60 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {rotuloCompetencia(comp)}
                    </div>
                    <div className="divide-y divide-border/60">
                      {impostosPorCompetencia.get(comp)!.map(i => {
                        const info = IMPOSTOS_TITULOS[i.tipo];
                        return (
                          <div key={i.id} className="flex items-center gap-3 px-4 py-3.5">
                            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                              <Receipt size={16} className="text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{info?.titulo ?? i.nome}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {info?.grupo ?? 'Imposto'}
                                {i.atualizadaEm ? ` · ${fmtDate(i.atualizadaEm)}` : ''}
                              </p>
                            </div>
                            <a
                              href={`${API}/portal/impostos/${token}/${i.id}/download`}
                              className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            >
                              <Download size={13} /> Baixar
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ─── Folha de Pagamento ──────────────────────────────────── */}
          {tab === 'folha' && (
            <div className={`${card} overflow-hidden`}>
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Folha de Pagamento</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Resumo da folha, contra-cheques, FGTS, INSS, admissões, rescisões e férias disponibilizados pelo escritório.
                </p>
              </div>
              {competenciasFolha.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">Nenhum documento de folha disponível</div>
              ) : (
                competenciasFolha.map(comp => (
                  <div key={comp}>
                    <div className="px-4 py-2 bg-muted/40 border-y border-border/60 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {rotuloCompetencia(comp)}
                    </div>
                    <div className="divide-y divide-border/60">
                      {folhaPorCompetencia.get(comp)!.map(f => {
                        const info = FOLHA_TITULOS[f.tipo];
                        return (
                          <div key={f.id} className="flex items-center gap-3 px-4 py-3.5">
                            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                              <Banknote size={16} className="text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{info?.titulo ?? f.nome}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {info?.grupo ?? 'Folha'}
                                {f.atualizadaEm ? ` · ${fmtDate(f.atualizadaEm)}` : ''}
                              </p>
                            </div>
                            <a
                              href={`${API}/portal/folha/${token}/${f.id}/download`}
                              className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            >
                              <Download size={13} /> Baixar
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ─── Documentos ──────────────────────────────────────────── */}
          {tab === 'documentos' && (
            <div className={`${card} overflow-hidden`}>
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Documentos ({documentos.length + (alvara ? 1 : 0)})</h3>
              </div>
              {documentos.length === 0 && !alvara ? (
                <div className="py-10 text-center text-muted-foreground text-sm">Nenhum documento disponível</div>
              ) : (
                <div className="divide-y divide-border/60">
                  {alvara && (
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <FileText size={16} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">Alvará de Funcionamento</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {alvara.atualizadaEm ? `Anexado em ${fmtDate(alvara.atualizadaEm)}` : ''}
                        </p>
                      </div>
                      <a
                        href={`${API}/portal/certidoes/${token}/${alvara.id}/download`}
                        className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      >
                        <Download size={13} /> Baixar
                      </a>
                    </div>
                  )}
                  {documentos.map(doc => (
                    <div key={doc.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <FileText size={16} className="text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {FOLDER_LABELS[doc.folder] ?? doc.folder}
                          {doc.competencia ? ` · ${fmtDate(doc.competencia)}` : ''}
                          · Enviado {fmtDate(doc.created_at)}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {doc.size ? `${(doc.size / 1024).toFixed(0)} KB` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Certidões ───────────────────────────────────────────── */}
          {tab === 'certidoes' && (
            <div className={`${card} overflow-hidden`}>
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Certidões da empresa</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Emitidas pelo escritório. A data indica quando cada certidão foi anexada ou atualizada.
                </p>
              </div>
              <div className="divide-y divide-border/60">
                {CERTIDOES_TIPOS.map(c => {
                  const arq = certidaoPorTipo.get(c.tipo);
                  return (
                    <div key={c.tipo} className="flex items-center gap-3 px-4 py-3.5">
                      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <ShieldCheck size={16} className={arq ? 'text-primary' : 'text-muted-foreground'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{c.titulo}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {c.subtitulo}
                          {arq?.atualizadaEm ? ` · ${fmtDate(arq.atualizadaEm)}` : ''}
                        </p>
                      </div>
                      {arq ? (
                        <a
                          href={`${API}/portal/certidoes/${token}/${arq.id}/download`}
                          className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                        >
                          <Download size={13} /> Baixar
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">Ainda não disponível</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Contratos ───────────────────────────────────────────── */}
          {tab === 'contratos' && (
            <div className={`${card} overflow-hidden`}>
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Contratos sociais e alterações</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Contrato de constituição e alterações contratuais da empresa, na ordem em que foram anexados.
                </p>
              </div>
              {contratos.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">Nenhum contrato disponível</div>
              ) : (
                <div className="divide-y divide-border/60">
                  {contratos.map(c => (
                    <div key={c.id} className="flex items-center gap-3 px-4 py-3.5">
                      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <FileSignature size={16} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{c.titulo}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {c.anexadoEm ? `Anexado em ${fmtDate(c.anexadoEm)}` : ''}
                        </p>
                      </div>
                      <a
                        href={`${API}/portal/contratos/${token}/${c.id}/download`}
                        className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      >
                        <Download size={13} /> Baixar
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Financeiro ──────────────────────────────────────────── */}
          {tab === 'financeiro' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className={`${card} p-4`}>
                  <p className="text-xs text-muted-foreground">Em Aberto</p>
                  <p className="text-xl font-bold text-amber-500">{fmtBRL(resumo.totalPendente)}</p>
                </div>
                <div className={`${card} p-4`}>
                  <p className="text-xs text-muted-foreground">Total Pago</p>
                  <p className="text-xl font-bold text-emerald-500">{fmtBRL(resumo.totalPago)}</p>
                </div>
              </div>

              <div className={`${card} overflow-hidden`}>
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">Histórico de Pagamentos ({parcelas.length})</h3>
                </div>
                {parcelas.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground text-sm">Nenhum lançamento encontrado</div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {parcelas.map(p => (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {fmtBRL(p.amount)}
                            {p.tipo && <span className="text-muted-foreground font-normal"> — {p.tipo}</span>}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Venc. {fmtDate(p.due_date)}
                            {p.paid_at ? ` · Pago em ${fmtDate(p.paid_at)}` : ''}
                            {p.competencia ? ` · Ref. ${fmtDate(p.competencia)}` : ''}
                          </p>
                        </div>
                        <PaymentChip status={p.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <p className="pt-4 pb-2 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Lexcon Assessoria Contábil · Acesso seguro
          </p>
        </div>
      </div>
    </div>
  );
}
