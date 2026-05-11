'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck, Search, Building2, History, Mail, Download,
  Play, RefreshCw, X, CheckCircle2, AlertTriangle,
  XCircle, ExternalLink, FileText, Loader2,
  Server, DatabaseZap, Users, ArrowRight,
} from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CnpjEntry { cnpj: string; nome: string; clienteId?: string; }
interface Config {
  cnpjs?: CnpjEntry[];
  email: {
    remetente?: string; senha_app?: string;
    destinatarios?: string[];
    smtp_host?: string; smtp_port?: number;
  };
  alertas: { enviar_resumo_diario?: boolean; horario_verificacao?: string; };
}

interface Certidao {
  ok?: boolean; status?: string; descricao?: string; fonte?: string;
}

interface ResultadoCnpj {
  cnpj: string;
  nome_empresa?: string; nome_config?: string;
  certidoes?: {
    cadastral?: Certidao; cnd_federal?: Certidao;
    fgts_crf?: Certidao;
  };
  links_uteis?: Record<string, string>;
  alertas?: string[];
  status_geral?: 'OK' | 'ALERTA' | 'CRITICO' | 'ERRO';
  consultado_em?: string;
}

interface ExecucaoHistorico {
  executado_em: string;
  resultados: ResultadoCnpj[];
}

interface Arquivo {
  nome: string; cnpj: string; cnpj_fmt: string;
  tamanho_kb: number; data: string;
}

type TabId = 'dashboard' | 'consultar' | 'cnpjs' | 'historico' | 'email' | 'certidoes';
type StatusGeral = 'OK' | 'ALERTA' | 'CRITICO' | 'ERRO';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCnpj(c: string) {
  const d = c.replace(/\D/g, '');
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function limparCnpj(c: string) { return c.replace(/\D/g, ''); }

/* ────────────────────────────────────────────────────────────────────────────
   Backend Python do Agente Certidões — apps/agente-fiscal/app_certidoes.py
   Em produção usa /agente-certidoes-api (proxy via Traefik na VPS).
   Em dev local usa http://localhost:5001.
   ──────────────────────────────────────────────────────────────────────────── */
const AGENT_API = process.env.NEXT_PUBLIC_AGENT_CERTIDOES_URL
  || (typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? `${window.location.origin}/agente-certidoes-api`
    : 'http://localhost:5001');

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: StatusGeral }) {
  if (!status) return null;
  const map: Record<StatusGeral, { cls: string; label: string }> = {
    OK: { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'OK' },
    ALERTA: { cls: 'bg-amber-100 text-amber-700 border-amber-200', label: 'ALERTA' },
    CRITICO: { cls: 'bg-red-100 text-red-700 border-red-200', label: 'CRÍTICO' },
    ERRO: { cls: 'bg-gray-100 text-gray-500 border-gray-200', label: 'ERRO' },
  };
  const { cls, label } = map[status] || map.ERRO;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${cls}`}>
      {label}
    </span>
  );
}

function StatusDot({ status }: { status?: StatusGeral }) {
  const cls: Record<string, string> = {
    OK: 'bg-emerald-500',
    ALERTA: 'bg-amber-500',
    CRITICO: 'bg-red-500 animate-pulse',
    ERRO: 'bg-gray-400',
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${cls[status || 'ERRO'] || cls.ERRO}`} />;
}

function CertCard({ titulo, cert, icon: Icon, url }: {
  titulo: string; cert?: Certidao; icon: React.ElementType; url?: string;
}) {
  if (!cert) return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <Icon size={20} className="text-muted-foreground mt-0.5 shrink-0" />
        <div>
          <p className="text-[12px] font-bold text-muted-foreground">{titulo}</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">Não consultado</p>
        </div>
      </div>
    </div>
  );

  let borderCls = 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20';
  let icon = <CheckCircle2 size={14} className="text-emerald-600" />;
  let statusText = cert.status || 'OK';
  const desc = cert.descricao && cert.descricao !== cert.status ? cert.descricao : '';

  const st = (cert.status || '').toUpperCase();
  if (!cert.ok || st === 'POSITIVA' || st === 'IRREGULAR' || st === 'INAPTA') {
    borderCls = 'border-red-200 bg-red-50 dark:bg-red-950/20';
    icon = <XCircle size={14} className="text-red-600" />;
  } else if (st === 'CONSULTAR_MANUALMENTE' || st === 'VERIFICAR') {
    borderCls = 'border-amber-200 bg-amber-50 dark:bg-amber-950/20';
    icon = <AlertTriangle size={14} className="text-amber-600" />;
    statusText = 'Consultar portal';
  }

  return (
    <div className={`rounded-xl border p-4 ${borderCls}`}>
      <div className="flex items-start gap-3">
        <Icon size={20} className="text-foreground/60 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-foreground/70 uppercase tracking-wide">{titulo}</p>
          <p className="text-[13px] font-semibold mt-0.5 flex items-center gap-1">
            {icon} {statusText}
          </p>
          {desc && <p className="text-[11px] text-muted-foreground mt-1">{desc}</p>}
          {cert.fonte && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{cert.fonte}</p>}
          {url && (
            <a
              href={url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-1"
            >
              <ExternalLink size={11} /> Abrir portal
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function AgenteCertidoesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);
  const [, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Consulta ──
  const [consultaRunning, setConsultaRunning] = useState(false);
  const [consultaLogs, setConsultaLogs] = useState<string[]>([]);
  const [consultaResults, setConsultaResults] = useState<ResultadoCnpj[]>([]);
  const [consultaFinished, setConsultaFinished] = useState(false);
  const [selectedCnpjs, setSelectedCnpjs] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logBoxRef = useRef<HTMLDivElement>(null);

  // ── CNPJs (fonte: Clientes Contábeis) ──
  const [cnpjs, setCnpjs] = useState<CnpjEntry[]>([]);
  const [carregandoCnpjs, setCarregandoCnpjs] = useState(false);
  const [totalClientes, setTotalClientes] = useState(0);
  const [clientesSemCnpj, setClientesSemCnpj] = useState(0);

  // ── Histórico ──
  const [historico, setHistorico] = useState<ExecucaoHistorico[]>([]);

  // ── E-mail ──
  const [emailForm, setEmailForm] = useState({
    remetente: '', senha_app: '', destinatarios: '',
    smtp_host: 'smtp.gmail.com', smtp_port: '587',
    enviar_resumo: true, horario: '08:00',
  });
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ── Certidões baixadas ──
  const [arquivos, setArquivos] = useState<Arquivo[]>([]);
  const [dlCnpj, setDlCnpj] = useState('');
  const [dlStatus, setDlStatus] = useState<{ running: boolean; resultado?: { ok: boolean; mensagem: string; nome?: string; cnpj_fmt?: string; url?: string } } | null>(null);

  // ── Dashboard ──
  const [dashResults, setDashResults] = useState<ResultadoCnpj[]>([]);
  const [dashTs, setDashTs] = useState<string | null>(null);
  const [modalData, setModalData] = useState<ResultadoCnpj | null>(null);

  // ── Toast ──
  const [toasts, setToasts] = useState<{ id: number; text: string; type: 'ok' | 'err' }[]>([]);
  const toastId = useRef(0);
  const toast = (text: string, type: 'ok' | 'err' = 'ok') => {
    const id = ++toastId.current;
    setToasts(p => [...p, { id, text, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  };

  // ─── Auth ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/atendimento/login'); return; }
    setLoading(false);
  }, [router]);

  // ─── Verifica agente online ───────────────────────────────────────────────
  const checkAgent = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_API}/api/status`, { signal: AbortSignal.timeout(4000) });
      setAgentOnline(res.ok);
    } catch { setAgentOnline(false); }
  }, []);

  // ─── Carrega config (apenas e-mail/alertas — CNPJs vêm de Clientes Contábeis) ───
  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_API}/api/config`);
      if (!res.ok) return;
      const data: Config = await res.json();
      setConfig(data);
      // preenche e-mail
      const em = data.email || {};
      const al = data.alertas || {};
      setEmailForm({
        remetente: em.remetente || '',
        senha_app: em.senha_app || '',
        destinatarios: (em.destinatarios || []).join('\n'),
        smtp_host: em.smtp_host || 'smtp.gmail.com',
        smtp_port: String(em.smtp_port || 587),
        enviar_resumo: al.enviar_resumo_diario !== false,
        horario: al.horario_verificacao || '08:00',
      });
    } catch { /* agente offline */ }
  }, []);

  // ─── Carrega CNPJs direto dos Clientes Contábeis (fonte única) ────────────
  const carregarCnpjs = useCallback(async () => {
    setCarregandoCnpjs(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/clientes-contabil?limit=500`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      type ClienteRaw = {
        id?: string;
        cpf_cnpj?: string;
        nome_empresa?: string;
        lead?: { name?: string; ficha_contabil?: { cnpj?: string; razao_social?: string } };
      };
      const clientes: ClienteRaw[] = data?.data || data || [];

      const seen = new Set<string>();
      const lista: CnpjEntry[] = [];
      let semCnpj = 0;
      for (const c of clientes) {
        const cnpj = limparCnpj(c.cpf_cnpj || c.lead?.ficha_contabil?.cnpj || '');
        if (cnpj.length !== 14) { semCnpj++; continue; }
        if (seen.has(cnpj)) continue;
        seen.add(cnpj);
        const nome = c.nome_empresa || c.lead?.ficha_contabil?.razao_social || c.lead?.name || cnpj;
        lista.push({ cnpj, nome, clienteId: c.id });
      }
      // Ordena alfabeticamente pelo nome
      lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

      setCnpjs(lista);
      setTotalClientes(clientes.length);
      setClientesSemCnpj(semCnpj);
      // Por padrão, todos selecionados para consulta
      setSelectedCnpjs(prev => prev.size ? prev : new Set(lista.map(l => l.cnpj)));
      setDlCnpj(prev => prev || lista[0]?.cnpj || '');
    } catch { /* offline */ }
    finally { setCarregandoCnpjs(false); }
  }, []);

  // ─── Carrega dashboard ────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    try {
      const [statusRes, histRes] = await Promise.all([
        fetch(`${AGENT_API}/api/status`),
        fetch(`${AGENT_API}/api/historico`),
      ]);
      const status = await statusRes.json();
      const hist: ExecucaoHistorico[] = await histRes.json();

      let results: ResultadoCnpj[] = status.results || [];
      let ts: string | null = status.finished_at;
      if (!results.length && hist.length) {
        const last = hist[hist.length - 1];
        results = last.resultados;
        ts = last.executado_em;
      }
      setDashResults(results);
      setDashTs(ts);
    } catch { /* agente offline */ }
  }, []);

  // ─── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    checkAgent();
    loadConfig();
    loadDashboard();
    carregarCnpjs();
    const interval = setInterval(checkAgent, 30000);
    return () => clearInterval(interval);
  }, [checkAgent, loadConfig, loadDashboard, carregarCnpjs]);

  // Auto-scroll log
  useEffect(() => {
    if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
  }, [consultaLogs]);

  // ─── Consulta ─────────────────────────────────────────────────────────────
  const iniciarConsulta = async () => {
    if (!selectedCnpjs.size) { toast('Selecione ao menos um CNPJ.', 'err'); return; }
    setConsultaRunning(true);
    setConsultaFinished(false);
    setConsultaLogs([]);
    setConsultaResults([]);
    // Envia a lista vinda dos Clientes Contábeis — fonte única de verdade.
    const payload = {
      cnpjs: cnpjs
        .filter(c => selectedCnpjs.has(c.cnpj))
        .map(c => ({ cnpj: c.cnpj, nome: c.nome })),
    };
    try {
      const res = await fetch(`${AGENT_API}/api/consultar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); toast(d.error || 'Erro ao iniciar consulta', 'err'); setConsultaRunning(false); return; }
      pollRef.current = setInterval(pollConsulta, 1200);
    } catch { toast('Agente offline ou inacessível.', 'err'); setConsultaRunning(false); }
  };

  const pollConsulta = async () => {
    try {
      const data = await fetch(`${AGENT_API}/api/status`).then(r => r.json());
      setConsultaLogs(data.logs || []);
      if (!data.running && data.finished_at) {
        if (pollRef.current) clearInterval(pollRef.current);
        setConsultaRunning(false);
        setConsultaFinished(true);
        setConsultaResults(data.results || []);
        loadDashboard();
      }
    } catch { /* silencioso */ }
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // CNPJs são gerenciados em "Clientes Contábeis" — sem cadastro paralelo aqui.

  // ─── Histórico ────────────────────────────────────────────────────────────
  const loadHistorico = useCallback(async () => {
    try {
      const data: ExecucaoHistorico[] = await fetch(`${AGENT_API}/api/historico`).then(r => r.json());
      setHistorico([...data].reverse());
    } catch { /* offline */ }
  }, []);

  // ─── E-mail ───────────────────────────────────────────────────────────────
  const salvarEmail = async () => {
    try {
      await fetch(`${AGENT_API}/api/config/email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remetente: emailForm.remetente,
          senha_app: emailForm.senha_app,
          destinatarios: emailForm.destinatarios.split('\n').map(s => s.trim()).filter(Boolean),
          smtp_host: emailForm.smtp_host,
          smtp_port: parseInt(emailForm.smtp_port),
        }),
      });
      setEmailMsg({ ok: true, text: 'Configurações salvas com sucesso!' });
    } catch { setEmailMsg({ ok: false, text: 'Agente inacessível.' }); }
    setTimeout(() => setEmailMsg(null), 3000);
  };

  // ─── Certidões baixadas ───────────────────────────────────────────────────
  const loadArquivos = useCallback(async () => {
    try {
      const data: Arquivo[] = await fetch(`${AGENT_API}/api/certidoes`).then(r => r.json());
      setArquivos(data);
    } catch { /* offline */ }
  }, []);

  const baixarCND = async () => {
    if (!dlCnpj) { toast('Selecione um CNPJ.', 'err'); return; }
    const cnpjLimpo = limparCnpj(dlCnpj);
    // Copia o CNPJ pra área de transferência ANTES do await — clipboard só
    // funciona dentro do gesto do usuário em alguns browsers. O portal novo
    // da Receita é SPA com hash routing, não aceita CNPJ via querystring.
    let copiado = false;
    try {
      await navigator.clipboard.writeText(cnpjLimpo);
      copiado = true;
    } catch { /* clipboard bloqueado — segue sem copiar */ }
    setDlStatus({ running: true });
    try {
      const res = await fetch(`${AGENT_API}/api/baixar/cnd/${cnpjLimpo}`, { method: 'POST' });
      const data = await res.json();
      const url = data?.resultado?.url;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      setDlStatus({
        ...data,
        resultado: data?.resultado ? {
          ...data.resultado,
          mensagem: copiado
            ? 'CNPJ copiado! No portal, clique no campo "Informe o CNPJ" e cole (Ctrl+V). Depois resolva o captcha e clique em "Emitir Certidão".'
            : data.resultado.mensagem,
        } : data?.resultado,
      });
    } catch {
      setDlStatus({ running: false, resultado: { ok: false, mensagem: 'Agente inacessível.' } });
    }
  };

  // ─── Tab change ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'historico') loadHistorico();
    if (activeTab === 'certidoes') loadArquivos();
    if (activeTab === 'dashboard') loadDashboard();
    // Recarrega CNPJs ao entrar nas abas que dependem deles — capta novos clientes
    if (activeTab === 'cnpjs' || activeTab === 'consultar' || activeTab === 'certidoes') {
      carregarCnpjs();
    }
  }, [activeTab, loadHistorico, loadArquivos, loadDashboard, carregarCnpjs]);

  // ─── Stat calculados (dashboard) ─────────────────────────────────────────
  const totalCnpjs = cnpjs.length;
  const statsOk = dashResults.filter(r => r.status_geral === 'OK').length;
  const statsAlerta = dashResults.filter(r => r.status_geral === 'ALERTA').length;
  const statsCritico = dashResults.filter(r => r.status_geral === 'CRITICO').length;

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 size={28} className="animate-spin text-muted-foreground" />
    </div>
  );

  // ─── Tabs config ──────────────────────────────────────────────────────────
  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard', label: 'Painel', icon: ShieldCheck },
    { id: 'consultar', label: 'Consultar', icon: Search },
    { id: 'cnpjs', label: 'CNPJs', icon: Building2 },
    { id: 'historico', label: 'Histórico', icon: History },
    { id: 'email', label: 'Config. E-mail', icon: Mail },
    { id: 'certidoes', label: 'Certidões', icon: Download },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">

      {/* ── Header ── */}
      <div className="shrink-0 border-b border-border bg-card px-6 pt-5 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={22} className="text-primary" />
              <h1 className="text-2xl font-bold">Agente Certidões</h1>
            </div>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Monitor automático de certidões PJ — Receita Federal e FGTS/CRF
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Status agente */}
            <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground bg-muted rounded-lg px-3 py-1.5">
              <Server size={13} />
              <span>Agente:</span>
              {agentOnline === null
                ? <span className="text-amber-500">Verificando</span>
                : agentOnline
                  ? <span className="text-emerald-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Online</span>
                  : <span className="text-red-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block animate-pulse" />Offline</span>
              }
            </div>
            <button onClick={() => { checkAgent(); loadConfig(); loadDashboard(); }}
              className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 -mb-px">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Conteúdo ── */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* ── PAINEL ── */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 max-w-5xl">
            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total de CNPJs', value: totalCnpjs || '—', color: 'from-blue-600 to-blue-800' },
                { label: 'Regulares', value: dashResults.length ? statsOk : '—', color: 'from-emerald-600 to-emerald-800' },
                { label: 'Com Alertas', value: dashResults.length ? statsAlerta : '—', color: 'from-amber-600 to-amber-800' },
                { label: 'Críticos', value: dashResults.length ? statsCritico : '—', color: 'from-red-600 to-red-800' },
              ].map(card => (
                <div key={card.label} className={`rounded-xl bg-gradient-to-br ${card.color} text-white p-5`}>
                  <div className="text-3xl font-bold">{card.value}</div>
                  <div className="text-[12px] opacity-85 mt-1">{card.label}</div>
                </div>
              ))}
            </div>

            {/* Tabela de resultados */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <span className="font-semibold">Último Resultado</span>
                {dashTs && (
                  <span className="text-[12px] text-muted-foreground">
                    Atualizado: {new Date(dashTs).toLocaleString('pt-BR')}
                  </span>
                )}
              </div>
              {dashResults.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <ShieldCheck size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="text-[13px]">Nenhuma consulta realizada ainda.</p>
                  <button onClick={() => setActiveTab('consultar')}
                    className="mt-3 px-4 py-1.5 text-[12px] bg-primary text-primary-foreground rounded-lg hover:opacity-90">
                    Consultar Agora
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="w-6 px-4 py-3" />
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Empresa</th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Situação Cadastral</th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">CND Federal</th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">FGTS / CRF</th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Alertas</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {dashResults.map((r, i) => {
                        const nome = r.nome_empresa || r.nome_config || r.cnpj;
                        const cad = r.certidoes?.cadastral;
                        const cnd = r.certidoes?.cnd_federal;
                        const fgts = r.certidoes?.fgts_crf;
                        return (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3"><StatusDot status={r.status_geral} /></td>
                            <td className="px-4 py-3">
                              <div className="font-medium">{nome}</div>
                              <div className="text-muted-foreground font-mono text-[11px]">{fmtCnpj(r.cnpj)}</div>
                            </td>
                            <td className="px-4 py-3 text-[12px]">{cad?.status || '—'}</td>
                            <td className="px-4 py-3 text-[12px]">
                              {cnd?.status === 'NEGATIVA' ? '✅ Negativa'
                                : cnd?.status === 'POSITIVA' ? '🚨 Positiva'
                                  : '🔗 Portal'}
                            </td>
                            <td className="px-4 py-3 text-[12px]">
                              {fgts?.status === 'REGULAR' ? '✅ Regular'
                                : fgts?.status === 'IRREGULAR' ? '🚨 Irregular'
                                  : '🔗 Portal'}
                            </td>
                            <td className="px-4 py-3">
                              {(r.alertas || []).length === 0
                                ? <StatusBadge status="OK" />
                                : <div className="flex flex-wrap gap-1">
                                  {r.alertas!.map((a, j) => (
                                    <span key={j} className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${r.status_geral === 'CRITICO' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>{a}</span>
                                  ))}
                                </div>
                              }
                            </td>
                            <td className="px-4 py-3">
                              <button onClick={() => setModalData(r)}
                                className="text-[12px] px-2.5 py-1 border border-border rounded-lg hover:bg-accent transition-colors flex items-center gap-1 text-muted-foreground">
                                <FileText size={12} /> Detalhes
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CONSULTAR ── */}
        {activeTab === 'consultar' && (
          <div className="max-w-5xl grid lg:grid-cols-5 gap-6">
            {/* Seleção */}
            <div className="lg:col-span-2">
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold">Selecionar CNPJs</h2>
                  {carregandoCnpjs && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
                </div>
                {!cnpjs.length ? (
                  <p className="text-[13px] text-muted-foreground">
                    Nenhum cliente PJ com CNPJ encontrado.{' '}
                    <button onClick={() => router.push('/atendimento/clientes-contabil')} className="text-primary underline">
                      Cadastrar cliente
                    </button>
                  </p>
                ) : (
                  <div className="space-y-2 mb-4 max-h-[420px] overflow-y-auto">
                    {cnpjs.map(c => {
                      const id = c.cnpj;
                      const checked = selectedCnpjs.has(id);
                      return (
                        <label key={id} className="flex items-center gap-3 cursor-pointer rounded-lg px-3 py-2 hover:bg-muted/40 transition-colors">
                          <input type="checkbox" checked={checked}
                            onChange={e => setSelectedCnpjs(prev => {
                              const next = new Set(prev);
                              e.target.checked ? next.add(id) : next.delete(id);
                              return next;
                            })}
                            className="rounded border-border"
                          />
                          <div>
                            <div className="text-[13px] font-medium">{c.nome || c.cnpj}</div>
                            <div className="text-[11px] text-muted-foreground font-mono">{fmtCnpj(c.cnpj)}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={iniciarConsulta}
                    disabled={consultaRunning || !cnpjs.length}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-[13px] hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {consultaRunning
                      ? <><Loader2 size={15} className="animate-spin" /> Consultando...</>
                      : <><Play size={14} /> Consultar Selecionados</>
                    }
                  </button>
                  <button onClick={() => setSelectedCnpjs(new Set(cnpjs.map(c => c.cnpj)))}
                    className="w-full text-[12px] py-2 rounded-xl border border-border hover:bg-accent text-muted-foreground transition-colors">
                    Selecionar todos
                  </button>
                </div>
              </div>
            </div>

            {/* Log */}
            <div className="lg:col-span-3 space-y-4">
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <span className="font-semibold">Log da Consulta</span>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${consultaRunning ? 'bg-amber-100 text-amber-700' : consultaFinished ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                    {consultaRunning ? 'Em andamento...' : consultaFinished ? 'Concluído' : 'Aguardando'}
                  </span>
                </div>
                <div ref={logBoxRef}
                  className="bg-[#0d1117] text-[#c9d1d9] font-mono text-[12px] h-52 overflow-y-auto p-4 space-y-0.5">
                  {consultaLogs.length === 0
                    ? <p className="text-[#6e7681]">Clique em "Consultar" para iniciar...</p>
                    : consultaLogs.map((l, i) => {
                      const cls = l.includes('✅') || l.includes('OK') || l.includes('Concluído') ? 'text-[#56d364]'
                        : l.includes('⚠️') || l.includes('ALERTA') ? 'text-[#e3b341]'
                          : l.includes('🚨') || l.includes('❌') || l.includes('CRITICO') ? 'text-[#f85149]'
                            : '';
                      return <p key={i} className={cls}>{l}</p>;
                    })
                  }
                </div>
              </div>

              {/* Resultados pós-consulta */}
              {consultaResults.length > 0 && (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="px-5 py-4 border-b border-border font-semibold">Certidões Consultadas</div>
                  <div className="divide-y divide-border/50">
                    {consultaResults.map((r, i) => {
                      const nome = r.nome_empresa || r.nome_config || r.cnpj;
                      return (
                        <div key={i} className="p-5">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <StatusBadge status={r.status_geral} />
                                <span className="font-semibold">{nome}</span>
                              </div>
                              <span className="text-[11px] text-muted-foreground font-mono">{fmtCnpj(r.cnpj)}</span>
                            </div>
                            <button onClick={() => setModalData(r)}
                              className="text-[12px] px-3 py-1.5 border border-border rounded-lg hover:bg-accent flex items-center gap-1 text-muted-foreground">
                              <FileText size={12} /> Ver detalhes
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <CertCard titulo="Situação Cadastral" cert={r.certidoes?.cadastral} icon={Building2} url={r.links_uteis?.qsa_receita} />
                            <CertCard titulo="CND Federal" cert={r.certidoes?.cnd_federal} icon={ShieldCheck} url={r.links_uteis?.cnd_federal} />
                            <CertCard titulo="FGTS / CRF" cert={r.certidoes?.fgts_crf} icon={ShieldCheck} url={r.links_uteis?.crf_fgts} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CNPJs ── */}
        {activeTab === 'cnpjs' && (
          <div className="max-w-5xl space-y-4">
            {/* Banner explicativo */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
              <DatabaseZap size={20} className="text-primary mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-[13px] font-semibold">Lista sincronizada automaticamente</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  Os CNPJs vêm direto da tela <strong>Clientes Contábeis</strong> (apenas pessoas jurídicas com CNPJ válido).
                  Para adicionar, remover ou editar, gerencie no cadastro de clientes — qualquer alteração aparece aqui em seguida.
                </p>
                <button
                  onClick={() => router.push('/atendimento/clientes-contabil')}
                  className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline"
                >
                  <Users size={13} /> Abrir Clientes Contábeis <ArrowRight size={12} />
                </button>
              </div>
              <button
                onClick={carregarCnpjs}
                disabled={carregandoCnpjs}
                className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border border-border hover:bg-accent text-muted-foreground transition-colors disabled:opacity-50"
                title="Atualizar lista a partir de Clientes Contábeis"
              >
                {carregandoCnpjs
                  ? <><Loader2 size={12} className="animate-spin" /> Atualizando…</>
                  : <><RefreshCw size={12} /> Atualizar</>
                }
              </button>
            </div>

            {/* Resumo numérico */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <div className="text-[11px] text-muted-foreground">Clientes contábeis</div>
                <div className="text-2xl font-bold mt-0.5">{totalClientes || '—'}</div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3">
                <div className="text-[11px] text-emerald-700/80">PJ monitorados (CNPJ válido)</div>
                <div className="text-2xl font-bold mt-0.5 text-emerald-700">{cnpjs.length}</div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
                <div className="text-[11px] text-amber-700/80">Sem CNPJ (PF ou pendente)</div>
                <div className="text-2xl font-bold mt-0.5 text-amber-700">{clientesSemCnpj}</div>
              </div>
            </div>

            {/* Lista */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border font-semibold flex items-center justify-between">
                <span>CNPJs em Monitoramento {cnpjs.length ? `(${cnpjs.length})` : ''}</span>
                {carregandoCnpjs && (
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-normal">
                    <Loader2 size={12} className="animate-spin" /> Sincronizando…
                  </span>
                )}
              </div>
              {!cnpjs.length ? (
                <div className="text-center py-14 text-muted-foreground text-[13px]">
                  <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                  <p>Nenhum cliente contábil PJ com CNPJ encontrado.</p>
                  <button
                    onClick={() => router.push('/atendimento/clientes-contabil')}
                    className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline"
                  >
                    <Users size={13} /> Cadastrar cliente <ArrowRight size={12} />
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-border/50 max-h-[520px] overflow-y-auto">
                  {cnpjs.map((c) => (
                    <div key={c.cnpj} className="flex items-center justify-between px-5 py-3 hover:bg-muted/20 transition-colors">
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium truncate">{c.nome || '—'}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{fmtCnpj(c.cnpj)}</div>
                      </div>
                      {c.clienteId && (
                        <button
                          onClick={() => router.push(`/atendimento/workspace/${c.clienteId}`)}
                          className="text-[12px] px-3 py-1.5 rounded-lg border border-border hover:bg-accent text-muted-foreground transition-colors flex items-center gap-1.5 shrink-0"
                          title="Abrir cadastro do cliente"
                        >
                          <ExternalLink size={12} /> Abrir
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── HISTÓRICO ── */}
        {activeTab === 'historico' && (
          <div className="max-w-4xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Últimas 10 Execuções</h2>
              <button onClick={loadHistorico} className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border hover:bg-accent transition-colors">
                <RefreshCw size={13} /> Atualizar
              </button>
            </div>
            {historico.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <History size={36} className="mx-auto mb-3 opacity-30" />
                <p className="text-[13px]">Nenhuma execução registrada ainda.</p>
              </div>
            ) : historico.map((h, i) => {
              const ts = new Date(h.executado_em).toLocaleString('pt-BR');
              const ok = h.resultados.filter(r => r.status_geral === 'OK').length;
              const al = h.resultados.filter(r => r.status_geral === 'ALERTA').length;
              const cr = h.resultados.filter(r => r.status_geral === 'CRITICO').length;
              return (
                <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <span className="font-medium text-[13px]">{ts}</span>
                    <div className="flex gap-2">
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">{ok} OK</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{al} Alertas</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">{cr} Críticos</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b border-border/50 bg-muted/20">
                          <th className="text-left px-5 py-2.5 font-semibold text-muted-foreground">Status</th>
                          <th className="text-left px-5 py-2.5 font-semibold text-muted-foreground">Empresa</th>
                          <th className="text-left px-5 py-2.5 font-semibold text-muted-foreground">CNPJ</th>
                          <th className="text-left px-5 py-2.5 font-semibold text-muted-foreground">Alertas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {h.resultados.map((r, j) => (
                          <tr key={j} className="border-b border-border/30 hover:bg-muted/10">
                            <td className="px-5 py-2.5"><StatusBadge status={r.status_geral} /></td>
                            <td className="px-5 py-2.5 font-medium">{r.nome_empresa || r.nome_config || r.cnpj}</td>
                            <td className="px-5 py-2.5 font-mono text-muted-foreground">{fmtCnpj(r.cnpj)}</td>
                            <td className="px-5 py-2.5 text-muted-foreground">{(r.alertas || []).join(' | ') || 'Nenhum'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── CONFIG E-MAIL ── */}
        {activeTab === 'email' && (
          <div className="max-w-xl">
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-semibold mb-4">Configuração de E-mail</h2>
              <div className="bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 text-[12px] rounded-lg px-4 py-3 mb-5 border border-blue-200 dark:border-blue-800">
                Para Gmail, crie uma <strong>Senha de App</strong> em Conta Google → Segurança → Verificação em 2 etapas → Senhas de app.
              </div>
              <div className="space-y-4">
                {[
                  { label: 'E-mail Remetente', key: 'remetente', type: 'email', placeholder: 'seu@gmail.com' },
                  { label: 'Senha de App', key: 'senha_app', type: 'password', placeholder: 'xxxx xxxx xxxx xxxx' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-[12px] font-semibold block mb-1">{f.label}</label>
                    <input type={f.type} placeholder={f.placeholder}
                      value={emailForm[f.key as keyof typeof emailForm] as string}
                      onChange={e => setEmailForm(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full px-3 py-2 text-[13px] rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                ))}
                <div>
                  <label className="text-[12px] font-semibold block mb-1">Destinatários (um por linha)</label>
                  <textarea rows={3} placeholder={'destinatario@empresa.com\nfinanceiro@empresa.com'}
                    value={emailForm.destinatarios}
                    onChange={e => setEmailForm(p => ({ ...p, destinatarios: e.target.value }))}
                    className="w-full px-3 py-2 text-[13px] rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[12px] font-semibold block mb-1">Servidor SMTP</label>
                    <input type="text" value={emailForm.smtp_host}
                      onChange={e => setEmailForm(p => ({ ...p, smtp_host: e.target.value }))}
                      className="w-full px-3 py-2 text-[13px] rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold block mb-1">Porta</label>
                    <input type="number" value={emailForm.smtp_port}
                      onChange={e => setEmailForm(p => ({ ...p, smtp_port: e.target.value }))}
                      className="w-full px-3 py-2 text-[13px] rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="resumo" checked={emailForm.enviar_resumo}
                    onChange={e => setEmailForm(p => ({ ...p, enviar_resumo: e.target.checked }))}
                    className="rounded border-border"
                  />
                  <label htmlFor="resumo" className="text-[12px]">Enviar resumo diário mesmo sem alertas</label>
                </div>
                <div>
                  <label className="text-[12px] font-semibold block mb-1">Horário da verificação automática</label>
                  <input type="time" value={emailForm.horario}
                    onChange={e => setEmailForm(p => ({ ...p, horario: e.target.value }))}
                    className="w-full px-3 py-2 text-[13px] rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <button onClick={salvarEmail}
                  className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-[13px] hover:opacity-90">
                  Salvar Configurações
                </button>
                {emailMsg && (
                  <div className={`text-[12px] px-3 py-2 rounded-lg ${emailMsg.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {emailMsg.text}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── CERTIDÕES BAIXADAS ── */}
        {activeTab === 'certidoes' && (
          <div className="max-w-4xl space-y-6">
            {/* Baixar nova */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <Download size={15} className="text-primary" /> Baixar CND Federal
              </h2>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-[12px] font-semibold block mb-1">CNPJ</label>
                  <select value={dlCnpj} onChange={e => setDlCnpj(e.target.value)}
                    className="w-full px-3 py-2 text-[13px] rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
                    {cnpjs.length
                      ? cnpjs.map(c => (
                        <option key={c.cnpj} value={c.cnpj}>{c.nome || c.cnpj} — {fmtCnpj(c.cnpj)}</option>
                      ))
                      : <option value="">Nenhum cliente PJ encontrado</option>
                    }
                  </select>
                </div>
                <button onClick={baixarCND} disabled={dlStatus?.running}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-[13px] hover:opacity-90 disabled:opacity-50">
                  {dlStatus?.running ? <><Loader2 size={14} className="animate-spin" /> Abrindo...</> : <><ExternalLink size={14} /> Abrir Portal da Receita</>}
                </button>
              </div>
              {dlStatus?.running && (
                <div className="mt-3 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 text-[12px] rounded-lg px-4 py-3 border border-blue-200 dark:border-blue-800">
                  <Loader2 size={12} className="inline animate-spin mr-2" />
                  Abrindo portal da Receita Federal numa nova aba…
                </div>
              )}
              {dlStatus && !dlStatus.running && dlStatus.resultado && (
                <div className={`mt-3 text-[12px] rounded-lg px-4 py-3 border ${dlStatus.resultado.ok ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 border-emerald-200' : 'bg-red-50 dark:bg-red-950/20 text-red-700 border-red-200'}`}>
                  {dlStatus.resultado.ok
                    ? <><CheckCircle2 size={12} className="inline mr-1" /> <strong>{dlStatus.resultado.mensagem}</strong> — {dlStatus.resultado.cnpj_fmt}</>
                    : <><XCircle size={12} className="inline mr-1" /> <strong>Erro:</strong> {dlStatus.resultado.mensagem}</>
                  }
                </div>
              )}
            </div>

            {/* Lista de arquivos */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <span className="font-semibold">Arquivos Salvos</span>
                <button onClick={loadArquivos} className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border hover:bg-accent transition-colors">
                  <RefreshCw size={13} /> Atualizar
                </button>
              </div>
              {arquivos.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Download size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-[13px]">Nenhuma certidão baixada ainda.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-5 py-3 font-semibold text-muted-foreground">Empresa / CNPJ</th>
                        <th className="text-left px-5 py-3 font-semibold text-muted-foreground">Arquivo</th>
                        <th className="text-left px-5 py-3 font-semibold text-muted-foreground">Tamanho</th>
                        <th className="text-left px-5 py-3 font-semibold text-muted-foreground">Data</th>
                        <th className="px-5 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {arquivos.map((f, i) => {
                        const nomeEmpresa = cnpjs.find(c => c.cnpj === f.cnpj)?.nome;
                        return (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                            <td className="px-5 py-3">
                              <div className="font-medium">{nomeEmpresa || '—'}</div>
                              <div className="text-muted-foreground font-mono text-[11px]">{f.cnpj_fmt}</div>
                            </td>
                            <td className="px-5 py-3 text-muted-foreground">{f.nome}</td>
                            <td className="px-5 py-3 text-muted-foreground">{f.tamanho_kb} KB</td>
                            <td className="px-5 py-3 text-muted-foreground">{f.data}</td>
                            <td className="px-5 py-3">
                              <a
                                href={`${AGENT_API}/api/certidoes/arquivo/${encodeURIComponent(f.nome)}`}
                                download target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 border border-border rounded-lg hover:bg-accent text-muted-foreground transition-colors"
                              >
                                <Download size={12} /> Salvar
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal de Detalhes ── */}
      {modalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalData(null)}>
          <div className="bg-card rounded-2xl border border-border w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between p-6 border-b border-border">
              <div>
                <h2 className="font-bold text-lg">{modalData.nome_empresa || modalData.nome_config || modalData.cnpj}</h2>
                <p className="text-[12px] text-muted-foreground font-mono mt-0.5">CNPJ: {fmtCnpj(modalData.cnpj)}</p>
              </div>
              <button onClick={() => setModalData(null)} className="text-muted-foreground hover:text-foreground p-1">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Status geral */}
              <div className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium border ${
                modalData.status_geral === 'OK' ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 border-emerald-200'
                  : modalData.status_geral === 'CRITICO' ? 'bg-red-50 dark:bg-red-950/20 text-red-700 border-red-200'
                    : 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 border-amber-200'
              }`}>
                <strong>Status Geral: {modalData.status_geral}</strong>
                {modalData.alertas?.length
                  ? <span> — {modalData.alertas.join(' | ')}</span>
                  : <span> — Nenhuma pendência encontrada</span>
                }
              </div>

              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Detalhes das Certidões</p>

              <CertCard titulo="Situação Cadastral (Receita Federal)" cert={modalData.certidoes?.cadastral} icon={Building2} url={modalData.links_uteis?.qsa_receita} />
              <CertCard titulo="CND Federal — PGFN + Receita Federal" cert={modalData.certidoes?.cnd_federal} icon={ShieldCheck} url={modalData.links_uteis?.cnd_federal} />
              <CertCard titulo="FGTS / CRF — Caixa Econômica Federal" cert={modalData.certidoes?.fgts_crf} icon={ShieldCheck} url={modalData.links_uteis?.crf_fgts} />


              {/* Links rápidos */}
              <div>
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Links de Acesso Rápido</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(modalData.links_uteis || {}).map(([key, url]) => (
                    <a key={key} href={url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 border border-border rounded-lg hover:bg-accent text-muted-foreground transition-colors">
                      <ExternalLink size={11} />
                      {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </a>
                  ))}
                </div>
              </div>
              {modalData.consultado_em && (
                <p className="text-[11px] text-muted-foreground">
                  Consultado em: {new Date(modalData.consultado_em).toLocaleString('pt-BR')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Toasts ── */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-[13px] font-medium text-white animate-in slide-in-from-right-4 ${t.type === 'ok' ? 'bg-emerald-600' : 'bg-red-600'}`}>
            {t.type === 'ok' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
