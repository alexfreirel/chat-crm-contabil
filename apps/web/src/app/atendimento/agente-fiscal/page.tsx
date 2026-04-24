'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2, Download, BarChart3, Receipt, DollarSign, Plus,
  Play, Printer, Trash2, Pencil, X, ChevronDown, Loader2,
  Search, FileText, AlertCircle, CheckCircle2, Info,
  Sparkles, Terminal, HardDrive,
} from 'lucide-react';

/* ────────────────────────────────────────────────────────────────────────────
   Agente Fiscal — SEFAZ Alagoas
   Em produção usa /agente-fiscal-api (proxy via Traefik na VPS)
   Em dev local usa http://localhost:5000
   ──────────────────────────────────────────────────────────────────────────── */

const AGENT_API = process.env.NEXT_PUBLIC_AGENT_FISCAL_URL
  || (typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? `${window.location.origin}/agente-fiscal-api`
    : 'http://localhost:5000');

interface Empresa {
  idx: number;
  nome: string;
  cnpj: string;
  cnpj_fmt: string;
  usuario: string;
  senha: string;
}

type TabId = 'dashboard' | 'sefaz' | 'analitico' | 'impostos' | 'parcela' | 'empresas';

export default function AgenteFiscalPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentOnline, setAgentOnline] = useState(false);

  // ── Forms state ─────────────────────────────────────────────────────
  const [selectedCnpj, setSelectedCnpj] = useState('');
  const [selectedMes, setSelectedMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // ── Arquivos baixados ────────────────────────────────────────────────
  const [arquivos, setArquivos] = useState<{ nome: string; caminho: string; empresa: string; tamanho: number }[]>([]);
  const [loadingArquivos, setLoadingArquivos] = useState(false);

  // ── Períodos armazenados ────────────────────────────────────────────
  const [periodos, setPeriodos] = useState<{ mes: string; arquivos: number; empresas: number; tamanho_mb: number }[]>([]);
  const [loadingPeriodos, setLoadingPeriodos] = useState(false);

  // ── Terminal output ─────────────────────────────────────────────────
  const [termLines, setTermLines] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const termRef = useRef<HTMLDivElement>(null);

  // ── Modal state ─────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [formNome, setFormNome] = useState('');
  const [formCnpj, setFormCnpj] = useState('');
  const [formUsuario, setFormUsuario] = useState('');
  const [formSenha, setFormSenha] = useState('');

  // ── Toasts ──────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: 'ok' | 'err' | 'info' }[]>([]);
  const toastId = useRef(0);

  const toast = useCallback((msg: string, type: 'ok' | 'err' | 'info' = 'ok') => {
    const id = ++toastId.current;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  // ── Fetch empresas ──────────────────────────────────────────────────
  const fetchEmpresas = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_API}/api/empresas`);
      if (res.ok) {
        const data = await res.json();
        setEmpresas(data);
        setAgentOnline(true);
      }
    } catch {
      setAgentOnline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/atendimento/login'); return; }
    fetchEmpresas();
  }, [router, fetchEmpresas]);

  // ── Auto-scroll terminal ────────────────────────────────────────────
  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [termLines]);


  const deleteArquivo = async (caminho: string) => {
    if (!confirm(`Excluir o arquivo "${caminho.split('/').pop()}"?`)) return;
    try {
      const res = await fetch(`${AGENT_API}/api/arquivos/${selectedMes}/arquivo?path=${encodeURIComponent(caminho)}`, { method: 'DELETE' });
      if (res.ok) {
        setArquivos(prev => prev.filter(a => a.caminho !== caminho));
        toast('Arquivo excluído', 'ok');
      } else {
        toast('Erro ao excluir arquivo', 'err');
      }
    } catch { toast('Agente offline', 'err'); }
  };

  const deleteAllArquivos = async () => {
    if (arquivos.length === 0) return;
    if (!confirm(`Excluir todos os ${arquivos.length} arquivos do mês ${selectedMes}?`)) return;
    try {
      const res = await fetch(`${AGENT_API}/api/arquivos/${selectedMes}`, { method: 'DELETE' });
      if (res.ok) {
        setArquivos([]);
        toast('Todos os arquivos excluídos', 'ok');
      } else {
        toast('Erro ao excluir arquivos', 'err');
      }
    } catch { toast('Agente offline', 'err'); }
  };

  const deleteAllImpostos = async () => {
    const dars = arquivos.filter(a => a.nome.startsWith('dar-'));
    if (dars.length === 0) return;
    if (!confirm(`Excluir todos os ${dars.length} DARs do mês ${selectedMes}?`)) return;
    try {
      for (const a of dars) {
        await fetch(`${AGENT_API}/api/arquivos/${selectedMes}/arquivo?path=${encodeURIComponent(a.caminho)}`, { method: 'DELETE' });
      }
      setArquivos(prev => prev.filter(a => !a.nome.startsWith('dar-')));
      toast('DARs excluídos', 'ok');
    } catch { toast('Agente offline', 'err'); }
  };

  const fetchArquivos = useCallback(async (mes?: string) => {
    const m = mes || selectedMes;
    setLoadingArquivos(true);
    try {
      const res = await fetch(`${AGENT_API}/api/arquivos/${m}`);
      if (res.ok) {
        const data = await res.json();
        setArquivos(data.files || []);
      }
    } catch { /* silent */ }
    finally { setLoadingArquivos(false); }
  }, [selectedMes]);

  // ── SSE stream ──────────────────────────────────────────────────────
  const streamTask = useCallback((taskId: string, autoLoadFiles = false) => {
    setRunning(true);
    setTermLines([]);
    setArquivos([]);
    const es = new EventSource(`${AGENT_API}/api/tarefa/${taskId}/stream`);
    es.onmessage = (e) => setTermLines(prev => [...prev, e.data]);
    es.addEventListener('done', async () => {
      es.close();
      setRunning(false);
      if (autoLoadFiles) {
        // Apenas carrega a lista de arquivos — download fica a cargo do usuário (Baixar ZIP ou botão Baixar)
        const m = selectedMes;
        try {
          const res = await fetch(`${AGENT_API}/api/arquivos/${m}`);
          if (res.ok) {
            const data = await res.json();
            setArquivos(data.files || []);
          }
        } catch { /* silent */ }
      }
    });
    es.onerror = () => { es.close(); setRunning(false); };
  }, [fetchArquivos]);

  // ── Actions ─────────────────────────────────────────────────────────
  const runBaixarSefaz = async () => {
    if (running) return;
    try {
      const res = await fetch(`${AGENT_API}/api/baixar-sefaz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes: selectedMes, cnpj: selectedCnpj }),
      });
      const data = await res.json();
      if (data.task_id) streamTask(data.task_id, true);
      else toast(data.error || 'Erro ao iniciar', 'err');
    } catch { toast('Agente offline', 'err'); }
  };

  const runAnalitico = async () => {
    if (running) return;
    try {
      const res = await fetch(`${AGENT_API}/api/analitico`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes: selectedMes, cnpj: selectedCnpj }),
      });
      const data = await res.json();
      if (data.task_id) streamTask(data.task_id, true);
      else toast(data.error || 'Erro ao iniciar', 'err');
    } catch { toast('Agente offline', 'err'); }
  };

  const runImpostos = async () => {
    if (running) return;
    try {
      const res = await fetch(`${AGENT_API}/api/impostos-sefaz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: selectedCnpj, mes: selectedMes }),
      });
      const data = await res.json();
      if (data.task_id) streamTask(data.task_id, true);
      else toast(data.error || 'Erro ao iniciar', 'err');
    } catch { toast('Agente offline', 'err'); }
  };

  const runAnalisarParc = async () => {
    if (running) return;
    try {
      const res = await fetch(`${AGENT_API}/api/parcelamentos/analisar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes: selectedMes }),
      });
      const data = await res.json();
      if (data.task_id) streamTask(data.task_id, true);
      else toast(data.error || 'Erro ao iniciar', 'err');
    } catch { toast('Agente offline', 'err'); }
  };

  const runEmitirParcelas = async () => {
    if (running) return;
    try {
      const res = await fetch(`${AGENT_API}/api/parcelamentos/emitir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: selectedCnpj }),
      });
      const data = await res.json();
      if (data.task_id) streamTask(data.task_id, true);
      else toast(data.error || 'Erro ao iniciar', 'err');
    } catch { toast('Agente offline', 'err'); }
  };

  const imprimirAnalitico = () => {
    window.open(`${AGENT_API}/api/analitico/imprimir`, '_blank');
  };

  // ── Empresa CRUD ────────────────────────────────────────────────────
  const openAddModal = () => {
    setEditIdx(null);
    setFormNome(''); setFormCnpj(''); setFormUsuario(''); setFormSenha('');
    setShowModal(true);
  };

  const openEditModal = (e: Empresa) => {
    setEditIdx(e.idx);
    setFormNome(e.nome); setFormCnpj(e.cnpj); setFormUsuario(e.usuario); setFormSenha('');
    setShowModal(true);
  };

  const saveEmpresa = async () => {
    if (editIdx !== null) {
      await fetch(`${AGENT_API}/api/empresas/${editIdx}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: formNome, usuario: formUsuario, senha: formSenha }),
      });
      toast('Empresa atualizada', 'ok');
    } else {
      const res = await fetch(`${AGENT_API}/api/empresas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: formNome, cnpj: formCnpj, usuario: formUsuario, senha: formSenha }),
      });
      const data = await res.json();
      if (data.error) { toast(data.error, 'err'); return; }
      toast('Empresa cadastrada', 'ok');
    }
    setShowModal(false);
    fetchEmpresas();
  };

  const deleteEmpresa = async (idx: number, nome: string) => {
    if (!confirm(`Remover "${nome}"?`)) return;
    await fetch(`${AGENT_API}/api/empresas/${idx}`, { method: 'DELETE' });
    toast(`"${nome}" removida`, 'info');
    fetchEmpresas();
  };

  const deleteAllEmpresas = async () => {
    if (!confirm(`Excluir TODAS as ${empresas.length} empresas? Esta acao nao pode ser desfeita.`)) return;
    await fetch(`${AGENT_API}/api/empresas/todas`, { method: 'DELETE' });
    toast('Todas as empresas foram excluidas', 'info');
    fetchEmpresas();
  };

  // ── Períodos (armazenamento VPS) ─────────────────────────────────────
  const fetchPeriodos = async () => {
    setLoadingPeriodos(true);
    try {
      const res = await fetch(`${AGENT_API}/api/periodos`);
      if (res.ok) {
        const data = await res.json();
        setPeriodos(data.periodos || []);
      }
    } catch { /* silent */ }
    finally { setLoadingPeriodos(false); }
  };

  const deletePeriodo = async (mes: string, arquivos: number) => {
    if (!confirm(`Apagar ${arquivos} arquivo(s) do periodo ${mes}? Nao pode ser desfeito.`)) return;
    try {
      const res = await fetch(`${AGENT_API}/api/periodos/${mes}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        toast(`Periodo ${mes} apagado (${data.arquivos_removidos} arquivos)`, 'ok');
        fetchPeriodos();
      } else {
        toast(data.error || 'Erro ao apagar', 'err');
      }
    } catch { toast('Agente offline', 'err'); }
  };

  // ── Format helpers ──────────────────────────────────────────────────
  const fmtCnpj = (c: string) => {
    const d = c.replace(/\D/g, '');
    if (d.length === 14) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
    return c;
  };

  const colorLine = (line: string) => {
    if (/erro|falha|fail/i.test(line)) return 'text-red-400';
    if (/sucesso|ok|conclu/i.test(line)) return 'text-emerald-400';
    if (/aviso|warn/i.test(line)) return 'text-amber-400';
    if (/info|log|→/i.test(line)) return 'text-blue-400';
    return 'text-slate-400';
  };

  // ── Tab config ──────────────────────────────────────────────────────
  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Painel', icon: <Sparkles size={16} /> },
    { id: 'sefaz', label: 'Baixar Sefaz', icon: <Download size={16} /> },
    { id: 'analitico', label: 'Analitico', icon: <BarChart3 size={16} /> },
    { id: 'impostos', label: 'Impostos', icon: <DollarSign size={16} /> },
    { id: 'parcela', label: 'Parcelamento', icon: <Receipt size={16} /> },
    { id: 'empresas', label: 'Empresas', icon: <Building2 size={16} /> },
  ];

  // ── Select empresa dropdown ─────────────────────────────────────────
  const EmpresaSelect = () => (
    <select
      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
      value={selectedCnpj}
      onChange={e => setSelectedCnpj(e.target.value)}
    >
      <option value="">Todas as empresas</option>
      {empresas.map(e => (
        <option key={e.cnpj} value={e.cnpj}>{e.nome} — {fmtCnpj(e.cnpj)}</option>
      ))}
    </select>
  );

  const MesInput = () => (
    <input
      type="month"
      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
      value={selectedMes}
      onChange={e => setSelectedMes(e.target.value)}
    />
  );

  // ── Terminal component ──────────────────────────────────────────────
  const TerminalOutput = ({ title }: { title: string }) => (
    <div className="rounded-xl border border-border bg-[#0a0c14] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
        <span className="text-[11px] text-muted-foreground ml-1 font-mono">{title}</span>
        {running && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-blue-400">
            <Loader2 size={12} className="animate-spin" /> Executando...
          </span>
        )}
      </div>
      <div ref={termRef} className="p-4 font-mono text-xs leading-relaxed max-h-[400px] min-h-[140px] overflow-y-auto">
        {termLines.length === 0 ? (
          <span className="text-slate-600 italic">Aguardando execucao...</span>
        ) : (
          termLines.map((line, i) => (
            <div key={i} className={colorLine(line)}>{line}</div>
          ))
        )}
      </div>
    </div>
  );

  // ── Offline banner ──────────────────────────────────────────────────
  if (!loading && !agentOnline) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto">
            <AlertCircle size={32} className="text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Agente Fiscal Offline</h2>
          <p className="text-sm text-muted-foreground">
            O servico do Agente Fiscal nao esta respondendo. Verifique se o container esta rodando na VPS.
          </p>
          <code className="block bg-card border border-border rounded-lg px-4 py-3 text-xs font-mono text-left">
            docker service ls | grep agente-fiscal
          </code>
          <button onClick={fetchEmpresas} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* ── Toasts ──────────────────────────────────────────────────────── */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-xl text-sm animate-in slide-in-from-right ${
            t.type === 'ok' ? 'border-emerald-500/30 bg-card text-emerald-400' :
            t.type === 'err' ? 'border-red-500/30 bg-card text-red-400' :
            'border-blue-500/30 bg-card text-blue-400'
          }`}>
            {t.type === 'ok' ? <CheckCircle2 size={16} /> : t.type === 'err' ? <AlertCircle size={16} /> : <Info size={16} />}
            {t.msg}
          </div>
        ))}
      </div>

      {/* ── Header + tabs ──────────────────────────────────────────────── */}
      <div className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-6 pt-5 pb-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Sparkles size={20} className="text-primary" />
                Agente Fiscal SEFAZ
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">Portal do Contribuinte — SEFAZ Alagoas</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${agentOnline ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${agentOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
                {agentOnline ? 'Online' : 'Offline'}
              </span>
              <span className="text-xs text-muted-foreground bg-card border border-border px-2.5 py-1 rounded-full">
                {empresas.length} empresa{empresas.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="flex gap-1 -mb-px overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-6">

        {/* ── Dashboard ──────────────────────────────────────────────── */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Empresas', value: empresas.length, icon: Building2, color: 'text-violet-400 bg-violet-500/10' },
                { label: 'Mes Atual', value: selectedMes, icon: FileText, color: 'text-blue-400 bg-blue-500/10' },
                { label: 'Status', value: agentOnline ? 'Online' : 'Offline', icon: Terminal, color: agentOnline ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10' },
                { label: 'Funcoes', value: '5', icon: Sparkles, color: 'text-amber-400 bg-amber-500/10' },
              ].map((s, i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
                    <s.icon size={20} />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-foreground">{s.value}</div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Armazenamento VPS — inline com stats */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <HardDrive size={14} className="text-primary" /> Armazenamento VPS
                </h3>
                <button onClick={fetchPeriodos} className="text-[10px] text-primary hover:underline font-medium">
                  {loadingPeriodos ? 'Carregando...' : 'Atualizar'}
                </button>
              </div>
              {periodos.length === 0 ? (
                <div className="p-3 text-center">
                  <button onClick={fetchPeriodos} disabled={loadingPeriodos} className="text-xs text-muted-foreground hover:text-foreground">
                    {loadingPeriodos ? 'Carregando...' : 'Clique para ver periodos'}
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 p-3">
                  {periodos.map(p => (
                    <div key={p.mes} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/30 border border-border/50">
                      <span className="text-xs font-medium text-foreground">{p.mes}</span>
                      <span className="text-[10px] text-muted-foreground">{p.arquivos} arq &middot; {p.tamanho_mb}MB</span>
                      <button onClick={() => deletePeriodo(p.mes, p.arquivos)} className="p-0.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick actions */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Sparkles size={14} className="text-primary" /> Acoes Rapidas
              </h3>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                  { label: 'Baixar Relatorios', desc: 'Portal SEFAZ', icon: Download, tab: 'sefaz' as TabId, color: 'text-blue-400 bg-blue-500/10' },
                  { label: 'Analitico', desc: 'Relatorio consolidado', icon: BarChart3, tab: 'analitico' as TabId, color: 'text-violet-400 bg-violet-500/10' },
                  { label: 'Impostos', desc: 'Baixar DARs', icon: DollarSign, tab: 'impostos' as TabId, color: 'text-emerald-400 bg-emerald-500/10' },
                  { label: 'Parcelamento', desc: 'Analisar e emitir', icon: Receipt, tab: 'parcela' as TabId, color: 'text-amber-400 bg-amber-500/10' },
                  { label: 'Nova Empresa', desc: 'Cadastrar', icon: Plus, tab: 'empresas' as TabId, color: 'text-orange-400 bg-orange-500/10' },
                ].map((a, i) => (
                  <button
                    key={i}
                    onClick={() => { setActiveTab(a.tab); if (a.tab === 'empresas') setTimeout(openAddModal, 100); }}
                    className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-lg transition-all"
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2.5 ${a.color}`}>
                      <a.icon size={18} />
                    </div>
                    <div className="text-[13px] font-semibold text-foreground">{a.label}</div>
                    <div className="text-[11px] text-muted-foreground">{a.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Empresas — grid compacto */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <Building2 size={14} className="text-primary" /> Empresas ({empresas.length})
                </h3>
                <button onClick={() => setActiveTab('empresas')} className="text-[10px] text-primary hover:underline font-medium">
                  Ver todas
                </button>
              </div>
              {empresas.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-xs">Nenhuma empresa cadastrada</div>
              ) : (
                <div className="p-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                    {empresas.map((e, i) => (
                      <div key={e.cnpj} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/30 transition-colors">
                        <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">
                          {i + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-foreground truncate">{e.nome}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{fmtCnpj(e.cnpj)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* ── Baixar Sefaz ───────────────────────────────────────────── */}
        {activeTab === 'sefaz' && (
          <div className="space-y-6">
            <div className="grid lg:grid-cols-[360px_1fr] gap-6">
              <div className="bg-card border border-border rounded-xl p-5 space-y-4 h-fit">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Download size={15} className="text-primary" /> Configurar</h3>
                <div><label className="text-xs font-medium text-muted-foreground block mb-1.5">Empresa</label><EmpresaSelect /></div>
                <div><label className="text-xs font-medium text-muted-foreground block mb-1.5">Mes de referencia</label><MesInput /></div>
                <button onClick={runBaixarSefaz} disabled={running} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
                  {running ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Iniciar Download
                </button>
              </div>
              <TerminalOutput title="agente_nfe_claude.py" />
            </div>

            {/* Arquivos baixados */}
            {arquivos.length > 0 && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <FileText size={15} className="text-primary" /> Arquivos Baixados ({arquivos.length})
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={deleteAllArquivos}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20"
                    >
                      <Trash2 size={14} /> Excluir Todos
                    </button>
                    <a
                      href={`${AGENT_API}/api/arquivos/${selectedMes}/zip`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
                    >
                      <Download size={14} /> Baixar ZIP
                    </a>
                  </div>
                </div>
                <div className="max-h-[350px] overflow-y-auto scrollbar-thin">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-card z-10">
                      <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-5 py-3 text-left font-semibold">Empresa</th>
                        <th className="px-5 py-3 text-left font-semibold">Arquivo</th>
                        <th className="px-5 py-3 text-right font-semibold">Tamanho</th>
                        <th className="px-5 py-3 text-right font-semibold">Acoes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {arquivos.map((a, i) => (
                        <tr key={i} className="border-t border-border/50 hover:bg-muted/30">
                          <td className="px-5 py-2.5 text-xs text-muted-foreground">{a.empresa}</td>
                          <td className="px-5 py-2.5 text-sm text-foreground font-medium">{a.nome}</td>
                          <td className="px-5 py-2.5 text-xs text-muted-foreground text-right font-mono">{(a.tamanho / 1024).toFixed(0)} KB</td>
                          <td className="px-5 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <a
                                href={`${AGENT_API}/api/arquivos/${selectedMes}/download?path=${encodeURIComponent(a.caminho)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20"
                              >
                                <Download size={12} /> Baixar
                              </a>
                              <button
                                onClick={() => deleteArquivo(a.caminho)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20"
                              >
                                <Trash2 size={12} /> Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Armazenamento VPS */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <HardDrive size={14} className="text-primary" /> Armazenamento VPS
                </h3>
                <button onClick={fetchPeriodos} className="text-[10px] text-primary hover:underline font-medium">
                  {loadingPeriodos ? 'Carregando...' : 'Atualizar'}
                </button>
              </div>
              {periodos.length === 0 ? (
                <div className="p-3 text-center">
                  <button onClick={fetchPeriodos} disabled={loadingPeriodos} className="text-xs text-muted-foreground hover:text-foreground">
                    {loadingPeriodos ? 'Carregando...' : 'Clique para ver periodos'}
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 p-3">
                  {periodos.map(p => (
                    <div key={p.mes} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/30 border border-border/50">
                      <span className="text-xs font-medium text-foreground">{p.mes}</span>
                      <span className="text-[10px] text-muted-foreground">{p.arquivos} arq &middot; {p.tamanho_mb}MB</span>
                      <button onClick={() => deletePeriodo(p.mes, p.arquivos)} className="p-0.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Analitico ──────────────────────────────────────────────── */}
        {activeTab === 'analitico' && (
          <div className="grid lg:grid-cols-[360px_1fr] gap-6">
            <div className="bg-card border border-border rounded-xl p-5 space-y-4 h-fit">
              <h3 className="text-sm font-semibold flex items-center gap-2"><BarChart3 size={15} className="text-primary" /> Configurar</h3>
              <div><label className="text-xs font-medium text-muted-foreground block mb-1.5">Empresa</label><EmpresaSelect /></div>
              <div><label className="text-xs font-medium text-muted-foreground block mb-1.5">Mes de referencia</label><MesInput /></div>
              <button onClick={runAnalitico} disabled={running} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {running ? <Loader2 size={16} className="animate-spin" /> : <BarChart3 size={16} />} Gerar Analitico
              </button>
              <hr className="border-border" />
              <button onClick={imprimirAnalitico} disabled={running || termLines.length === 0} className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-foreground text-sm font-medium hover:bg-muted/50 disabled:opacity-50">
                <Printer size={16} /> Imprimir Relatorio
              </button>
            </div>
            <TerminalOutput title="analitico.py" />
          </div>
        )}

        {/* ── Impostos ───────────────────────────────────────────────── */}
        {activeTab === 'impostos' && (() => {
          const arquivosImpostos = arquivos.filter(a => a.nome.startsWith('dar-'));
          return (
          <div className="space-y-6">
            <div className="grid lg:grid-cols-[360px_1fr] gap-6">
              <div className="bg-card border border-border rounded-xl p-5 space-y-4 h-fit">
                <h3 className="text-sm font-semibold flex items-center gap-2"><DollarSign size={15} className="text-primary" /> Configurar</h3>
                <div><label className="text-xs font-medium text-muted-foreground block mb-1.5">Empresa</label><EmpresaSelect /></div>
                <div><label className="text-xs font-medium text-muted-foreground block mb-1.5">Mes de referencia</label><MesInput /></div>
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs text-muted-foreground space-y-0.5">
                  <div className="flex items-center gap-1.5 font-medium text-primary"><Info size={13} /> Filtros automaticos:</div>
                  <div>Competencia: {selectedMes || 'mes selecionado'}</div>
                  <div>Vencimento: {selectedMes || 'mes selecionado'}</div>
                  <div>Situacao: Em Aberto</div>
                </div>
                <button onClick={runImpostos} disabled={running} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
                  {running ? <Loader2 size={16} className="animate-spin" /> : <DollarSign size={16} />} Baixar Impostos
                </button>
              </div>
              <TerminalOutput title="agente_nfe_claude.py --modo impostos" />
            </div>

            {/* DARs baixados (somente dar-*.pdf) */}
            {arquivosImpostos.length > 0 && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <FileText size={15} className="text-primary" /> DARs Baixados ({arquivosImpostos.length})
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={deleteAllImpostos}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20"
                    >
                      <Trash2 size={14} /> Excluir Todos
                    </button>
                    <a
                      href={`${AGENT_API}/api/arquivos/${selectedMes}/zip/impostos`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
                    >
                      <Download size={14} /> Baixar ZIP
                    </a>
                  </div>
                </div>
                <div className="max-h-[350px] overflow-y-auto scrollbar-thin">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-card z-10">
                      <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-5 py-3 text-left font-semibold">Empresa</th>
                        <th className="px-5 py-3 text-left font-semibold">Arquivo</th>
                        <th className="px-5 py-3 text-right font-semibold">Tamanho</th>
                        <th className="px-5 py-3 text-right font-semibold">Acoes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {arquivosImpostos.map((a, i) => (
                        <tr key={i} className="border-t border-border/50 hover:bg-muted/30">
                          <td className="px-5 py-2.5 text-xs text-muted-foreground">{a.empresa}</td>
                          <td className="px-5 py-2.5 text-sm text-foreground font-medium">{a.nome}</td>
                          <td className="px-5 py-2.5 text-xs text-muted-foreground text-right font-mono">{(a.tamanho / 1024).toFixed(0)} KB</td>
                          <td className="px-5 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <a
                                href={`${AGENT_API}/api/arquivos/${selectedMes}/download?path=${encodeURIComponent(a.caminho)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20"
                              >
                                <Download size={12} /> Baixar
                              </a>
                              <button
                                onClick={() => deleteArquivo(a.caminho)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20"
                              >
                                <Trash2 size={12} /> Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
          );
        })()}

        {/* ── Parcelamento ────────────────────────────────────────────── */}
        {activeTab === 'parcela' && (
          <div className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Search size={15} className="text-primary" /> Analisar Parcelamentos</h3>
                <div><label className="text-xs font-medium text-muted-foreground block mb-1.5">Mes de referencia</label><MesInput /></div>
                <button onClick={runAnalisarParc} disabled={running} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
                  {running ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Analisar
                </button>
              </div>
              <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2"><FileText size={15} className="text-primary" /> Emitir DARs</h3>
                <div><label className="text-xs font-medium text-muted-foreground block mb-1.5">Empresa</label><EmpresaSelect /></div>
                <button onClick={runEmitirParcelas} disabled={running} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
                  {running ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />} Emitir Parcelas
                </button>
              </div>
            </div>
            <TerminalOutput title="parcelamentos" />
          </div>
        )}

        {/* ── Empresas ───────────────────────────────────────────────── */}
        {activeTab === 'empresas' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Building2 size={15} className="text-primary" /> Gerenciar Empresas ({empresas.length})</h3>
              <div className="flex items-center gap-2">
                {empresas.length > 0 && (
                  <button onClick={deleteAllEmpresas} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20">
                    <Trash2 size={14} /> Excluir Todas
                  </button>
                )}
                <button onClick={openAddModal} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90">
                  <Plus size={14} /> Adicionar Empresa
                </button>
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {empresas.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground text-sm">Nenhuma empresa cadastrada ainda</div>
              ) : (
                <div className="max-h-[calc(100vh-220px)] overflow-y-auto scrollbar-thin">
                <table className="w-full">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="px-5 py-3 text-left font-semibold">#</th>
                      <th className="px-5 py-3 text-left font-semibold">Nome</th>
                      <th className="px-5 py-3 text-left font-semibold">CNPJ</th>
                      <th className="px-5 py-3 text-left font-semibold">Usuario</th>
                      <th className="px-5 py-3 text-right font-semibold">Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empresas.map((e, i) => (
                      <tr key={e.cnpj} className="border-t border-border/50 hover:bg-muted/30">
                        <td className="px-5 py-3 text-sm text-muted-foreground">{i + 1}</td>
                        <td className="px-5 py-3 text-sm font-medium text-foreground">{e.nome}</td>
                        <td className="px-5 py-3 text-sm text-muted-foreground font-mono">{fmtCnpj(e.cnpj)}</td>
                        <td className="px-5 py-3 text-sm text-muted-foreground">{e.usuario}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEditModal(e)} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                            <button onClick={() => deleteEmpresa(e.idx, e.nome)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal Add/Edit ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-card border border-border rounded-2xl w-[440px] max-w-[94vw] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-foreground">{editIdx !== null ? 'Editar Empresa' : 'Adicionar Empresa'}</h3>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Nome da empresa</label>
                <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary" value={formNome} onChange={e => setFormNome(e.target.value)} placeholder="Ex: Empresa XYZ Ltda" />
              </div>
              {editIdx === null && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">CNPJ (so numeros)</label>
                  <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:border-primary focus:ring-1 focus:ring-primary" value={formCnpj} onChange={e => setFormCnpj(e.target.value.replace(/\D/g, ''))} placeholder="00000000000000" maxLength={14} />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Usuario (login SEFAZ)</label>
                <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary" value={formUsuario} onChange={e => setFormUsuario(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Senha</label>
                <input type="password" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary" value={formSenha} onChange={e => setFormSenha(e.target.value)} placeholder={editIdx !== null ? '(manter atual)' : ''} />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/50">Cancelar</button>
              <button onClick={saveEmpresa} className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
                {editIdx !== null ? 'Salvar' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
