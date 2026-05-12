'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2, Download, BarChart3, Receipt, DollarSign, Plus,
  Play, Printer, Trash2, Pencil, X, ChevronDown, Loader2,
  Search, FileText, AlertCircle, CheckCircle2, Info,
  Sparkles, Terminal, HardDrive, ExternalLink, Copy, Check, Calculator, ShieldCheck,
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
  inscricao_estadual?: string;
}

type TabId = 'dashboard' | 'sefaz' | 'analitico' | 'impostos' | 'parcela' | 'empresas' | 'icms-st' | 'certidao';

function getTokenPayload(): any {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return null;
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

function canDeleteEmpresas(): boolean {
  const p = getTokenPayload();
  if (!p) return false;
  return (
    p.role === 'ADMIN' || p.role === 'CONTADOR' ||
    (Array.isArray(p.roles) && (p.roles.includes('ADMIN') || p.roles.includes('CONTADOR')))
  );
}

export default function AgenteFiscalPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [isAllowedToDelete] = useState<boolean>(() => canDeleteEmpresas());
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
  const [formInscricao, setFormInscricao] = useState('');

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
        setEmpresas([...data].sort((a: any, b: any) => a.nome.localeCompare(b.nome, 'pt-BR')));
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

  const runCertidaoEstadual = async () => {
    if (running || !selectedCnpj) return;
    try {
      const res = await fetch(`${AGENT_API}/api/certidao-estadual`, {
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
    setFormNome(''); setFormCnpj(''); setFormUsuario(''); setFormSenha(''); setFormInscricao('');
    setShowModal(true);
  };

  const openEditModal = (e: Empresa) => {
    setEditIdx(e.idx);
    setFormNome(e.nome); setFormCnpj(e.cnpj); setFormUsuario(e.usuario); setFormSenha(''); setFormInscricao(e.inscricao_estadual ?? '');
    setShowModal(true);
  };

  const saveEmpresa = async () => {
    if (editIdx !== null) {
      await fetch(`${AGENT_API}/api/empresas/${editIdx}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: formNome, usuario: formUsuario, senha: formSenha, inscricao_estadual: formInscricao }),
      });
      toast('Empresa atualizada', 'ok');
    } else {
      const res = await fetch(`${AGENT_API}/api/empresas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: formNome, cnpj: formCnpj, usuario: formUsuario, senha: formSenha, inscricao_estadual: formInscricao }),
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

  // ── ICMS ST ─────────────────────────────────────────────────────────
  const [stFiles, setStFiles] = useState<File[]>([]);
  const [stLoading, setStLoading] = useState(false);
  const [stResultado, setStResultado] = useState<any | null>(null);
  const [stDragOver, setStDragOver] = useState(false);
  const stFileInputRef = useRef<HTMLInputElement>(null);

  // NCM custom
  const [stCustomList, setStCustomList] = useState<any[]>([]);
  const [stShowForm, setStShowForm] = useState(false);
  const [stFormNcm, setStFormNcm] = useState('');
  const [stFormCest, setStFormCest] = useState('');
  const [stFormDesc, setStFormDesc] = useState('');
  const [stFormMvaInt, setStFormMvaInt] = useState('');
  const [stFormMva12, setStFormMva12] = useState('');
  const [stFormMva7, setStFormMva7] = useState('');
  const [stFormMva4, setStFormMva4] = useState('');
  const [stFormSaving, setStFormSaving] = useState(false);
  const [stNcmInfo, setStNcmInfo] = useState<{ encontrado: boolean; fonte?: string; registro?: any } | null>(null);
  const [stNcmChecking, setStNcmChecking] = useState(false);

  const fetchCustomNCM = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_API}/api/icms-st/ncm-custom`);
      if (res.ok) setStCustomList(await res.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => { if (activeTab === 'icms-st') fetchCustomNCM(); }, [activeTab, fetchCustomNCM]);

  useEffect(() => {
    if (stFormNcm.length < 8) { setStNcmInfo(null); return; }
    setStNcmChecking(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${AGENT_API}/api/icms-st/ncm-info/${stFormNcm}`);
        if (res.ok) setStNcmInfo(await res.json());
      } catch { /* silent */ }
      finally { setStNcmChecking(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [stFormNcm]);

  const saveCustomNCM = async () => {
    if (!stFormNcm || !stFormMvaInt) { toast('NCM e MVA Interno são obrigatórios', 'err'); return; }
    setStFormSaving(true);
    try {
      const res = await fetch(`${AGENT_API}/api/icms-st/ncm-custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ncm: stFormNcm, cest: stFormCest, descricao: stFormDesc, mva_interno: stFormMvaInt, mva_ajustada_12: stFormMva12 || null, mva_ajustada_7: stFormMva7 || null, mva_ajustada_4: stFormMva4 || null }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`NCM ${data.ncm} cadastrado`, 'ok');
        setStFormNcm(''); setStFormCest(''); setStFormDesc(''); setStFormMvaInt(''); setStFormMva12(''); setStFormMva7(''); setStFormMva4('');
        setStShowForm(false);
        fetchCustomNCM();
      } else { toast(data.error || 'Erro ao salvar', 'err'); }
    } catch { toast('Erro ao salvar NCM', 'err'); }
    finally { setStFormSaving(false); }
  };

  const deleteCustomNCM = async (ncm: string) => {
    if (!confirm(`Remover NCM ${ncm} do cadastro manual?`)) return;
    try {
      await fetch(`${AGENT_API}/api/icms-st/ncm-custom/${ncm}`, { method: 'DELETE' });
      toast(`NCM ${ncm} removido`, 'info');
      fetchCustomNCM();
    } catch { toast('Erro ao remover', 'err'); }
  };

  const runCalcularST = async () => {
    if (stLoading || stFiles.length === 0) return;
    setStLoading(true);
    setStResultado(null);
    try {
      const formData = new FormData();
      stFiles.forEach(f => formData.append('xmls', f));
      const res = await fetch(`${AGENT_API}/api/icms-st/calcular`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.erro) { toast(data.erro, 'err'); }
      else { setStResultado(data); toast(`${data.total_nfes} NF-e(s) calculada(s)`, 'ok'); }
    } catch { toast('Erro ao calcular ICMS ST', 'err'); }
    finally { setStLoading(false); }
  };

  const [portalModal, setPortalModal] = useState<Empresa | null>(null);
  const [copiedField, setCopiedField] = useState<'usuario' | 'senha' | null>(null);

  const abrirPortal = (e: Empresa) => { setPortalModal(e); setCopiedField(null); };

  const copiarCampo = async (campo: 'usuario' | 'senha', valor: string) => {
    try { await navigator.clipboard.writeText(valor); } catch { /* fallback silencioso */ }
    setCopiedField(campo);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const abrirPortalSefaz = () => {
    window.open('https://contribuinte.sefaz.al.gov.br', '_blank');
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
    { id: 'icms-st', label: 'Cálculo ST', icon: <Calculator size={16} /> },
    { id: 'certidao', label: 'Certidão', icon: <ShieldCheck size={16} /> },
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
                { label: 'Funcoes', value: '6', icon: Sparkles, color: 'text-amber-400 bg-amber-500/10' },
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
                      <a
                        href={`${AGENT_API}/api/arquivos/${p.mes}/zip`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Baixar pasta ${p.mes}`}
                        className="p-0.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary"
                      >
                        <Download size={12} />
                      </a>
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
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                {[
                  { label: 'Baixar Relatorios', desc: 'Portal SEFAZ', icon: Download, tab: 'sefaz' as TabId, color: 'text-blue-400 bg-blue-500/10' },
                  { label: 'Analitico', desc: 'Relatorio consolidado', icon: BarChart3, tab: 'analitico' as TabId, color: 'text-violet-400 bg-violet-500/10' },
                  { label: 'Impostos', desc: 'Baixar DARs', icon: DollarSign, tab: 'impostos' as TabId, color: 'text-emerald-400 bg-emerald-500/10' },
                  { label: 'Parcelamento', desc: 'Analisar e emitir', icon: Receipt, tab: 'parcela' as TabId, color: 'text-amber-400 bg-amber-500/10' },
                  { label: 'Nova Empresa', desc: 'Cadastrar', icon: Plus, tab: 'empresas' as TabId, color: 'text-orange-400 bg-orange-500/10' },
                  { label: 'Cálculo ST', desc: 'ICMS Substituição Trib.', icon: Calculator, tab: 'icms-st' as TabId, color: 'text-rose-400 bg-rose-500/10' },
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
                      <a
                        href={`${AGENT_API}/api/arquivos/${p.mes}/zip`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Baixar pasta ${p.mes}`}
                        className="p-0.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary"
                      >
                        <Download size={12} />
                      </a>
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
                      <a
                        href={`${AGENT_API}/api/arquivos/${p.mes}/zip`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Baixar pasta ${p.mes}`}
                        className="p-0.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary"
                      >
                        <Download size={12} />
                      </a>
                      <button onClick={() => deletePeriodo(p.mes, p.arquivos)} className="p-0.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

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

        {/* ── Cálculo ST ─────────────────────────────────────────────── */}
        {activeTab === 'icms-st' && (
          <div className="space-y-6">
            <div className="grid lg:grid-cols-[360px_1fr] gap-6">
              {/* Painel esquerdo */}
              <div className="bg-card border border-border rounded-xl p-5 space-y-4 h-fit">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Calculator size={15} className="text-primary" /> Cálculo ICMS ST — AL</h3>

                {/* Drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setStDragOver(true); }}
                  onDragLeave={() => setStDragOver(false)}
                  onDrop={e => {
                    e.preventDefault(); setStDragOver(false);
                    const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.xml'));
                    setStFiles(prev => [...prev, ...files]);
                  }}
                  onClick={() => stFileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                    stDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
                  }`}
                >
                  <input
                    ref={stFileInputRef}
                    type="file"
                    multiple
                    accept=".xml"
                    className="hidden"
                    onChange={e => {
                      const files = Array.from(e.target.files || []).filter(f => f.name.toLowerCase().endsWith('.xml'));
                      setStFiles(prev => [...prev, ...files]);
                      e.target.value = '';
                    }}
                  />
                  <FileText size={24} className="mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {stFiles.length > 0
                      ? `${stFiles.length} arquivo(s) selecionado(s)`
                      : 'Arraste XMLs de NF-e ou clique para selecionar'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">Apenas arquivos .xml</p>
                </div>

                {/* Lista de arquivos */}
                {stFiles.length > 0 && (
                  <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
                    {stFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 bg-muted/30 rounded-lg">
                        <span className="truncate text-foreground">{f.name}</span>
                        <button onClick={() => setStFiles(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-400 ml-2 shrink-0">
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Botões */}
                <div className="flex gap-2">
                  <button
                    onClick={runCalcularST}
                    disabled={stLoading || stFiles.length === 0}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {stLoading ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />} Calcular ST
                  </button>
                  {stFiles.length > 0 && (
                    <button
                      onClick={() => { setStFiles([]); setStResultado(null); }}
                      className="px-3 py-2.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Info legislação */}
                <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 text-xs text-muted-foreground space-y-0.5">
                  <div className="flex items-center gap-1.5 font-medium text-amber-400"><Info size={13} /> Legislação aplicada:</div>
                  <div>Decreto 90.309/2023 — Alagoas</div>
                  <div>MVAs ajustadas em 01/05/2026</div>
                  <div>1.527 NCMs indexados</div>
                </div>
              </div>

              {/* Painel direito */}
              {stResultado ? (
                <div className="space-y-4">
                  {/* Totais */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'NF-e(s) processadas', value: stResultado.total_nfes, fmt: false, color: 'text-blue-400' },
                      { label: 'BC ST Total', value: stResultado.total_bc_st, fmt: true, color: 'text-violet-400' },
                      { label: 'ICMS ST a Recolher', value: stResultado.total_st, fmt: true, color: 'text-emerald-400' },
                    ].map((s, i) => (
                      <div key={i} className="bg-card border border-border rounded-xl p-4">
                        <div className={`text-lg font-bold ${s.color}`}>
                          {s.fmt ? `R$ ${(s.value as number).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : s.value}
                        </div>
                        <div className="text-xs text-muted-foreground">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Header da tabela */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">Resultados por NF-e</h3>
                    <a
                      href={`${AGENT_API}/api/icms-st/download/${stResultado.arquivo_excel}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
                    >
                      <Download size={13} /> Baixar Excel
                    </a>
                  </div>

                  {/* Tabela de resultados */}
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="max-h-[calc(100vh-420px)] overflow-y-auto scrollbar-thin">
                      <table className="w-full">
                        <thead className="sticky top-0 bg-card z-10">
                          <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                            <th className="px-4 py-3 text-left font-semibold">NF / Arquivo</th>
                            <th className="px-4 py-3 text-left font-semibold">Emissão</th>
                            <th className="px-4 py-3 text-left font-semibold">UF Emit.</th>
                            <th className="px-4 py-3 text-right font-semibold">BC ST (R$)</th>
                            <th className="px-4 py-3 text-right font-semibold">ICMS ST (R$)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stResultado.resultados.map((r: any, i: number) => (
                            <tr key={i} className="border-t border-border/50 hover:bg-muted/30">
                              <td className="px-4 py-3 text-sm font-medium text-foreground">
                                {r.erro
                                  ? <span className="text-red-400 text-xs">{String(r.arquivo || '').split(/[\\/]/).pop()}</span>
                                  : `NF ${r.numero_nf}/${r.serie}`}
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">{r.emissao || '—'}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">{r.uf_emitente || '—'}</td>
                              <td className="px-4 py-3 text-sm text-right font-mono text-foreground">
                                {r.erro ? '—' : `${(r.total_bc_st || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                              </td>
                              <td className="px-4 py-3 text-sm text-right font-mono font-bold">
                                {r.erro
                                  ? <span className="text-red-400 text-xs">{r.erro}</span>
                                  : <span className="text-emerald-400">{(r.total_icms_st || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center min-h-[300px]">
                  <div className="text-center space-y-3">
                    <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center mx-auto">
                      <Calculator size={32} className="text-primary/30" />
                    </div>
                    <p className="text-sm text-muted-foreground">Selecione XMLs de NF-e e clique em Calcular ST</p>
                  </div>
                </div>
              )}
            </div>
            {/* ── Painel NCM/MVA customizados ─────────────────────── */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <FileText size={14} className="text-primary" /> NCMs Cadastrados Manualmente
                  {stCustomList.length > 0 && (
                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-mono">{stCustomList.length}</span>
                  )}
                </h3>
                <button
                  onClick={() => setStShowForm(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
                >
                  <Plus size={13} /> {stShowForm ? 'Fechar' : 'Novo NCM'}
                </button>
              </div>

              {/* Formulário de cadastro */}
              {stShowForm && (
                <div className="p-4 border-b border-border bg-muted/20 space-y-3">
                  <p className="text-[11px] text-muted-foreground">O MVA Ajustado é calculado automaticamente pela fórmula do Convênio ICMS 13/2006. Informe apenas o MVA Interno (original). Os campos de MVA Ajustado são opcionais — preencha apenas se quiser forçar um valor fixo.</p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground block mb-1">NCM <span className="text-red-400">*</span></label>
                      <input
                        className={`w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-primary ${
                          stNcmInfo?.encontrado
                            ? stNcmInfo.fonte === 'custom'
                              ? 'border-amber-500 focus:border-amber-500'
                              : 'border-blue-500 focus:border-blue-500'
                            : 'border-border focus:border-primary'
                        }`}
                        value={stFormNcm}
                        onChange={e => { setStFormNcm(e.target.value.replace(/\D/g, '').slice(0, 8)); setStNcmInfo(null); }}
                        placeholder="00000000"
                        maxLength={8}
                      />
                      {stNcmChecking && (
                        <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                          <Loader2 size={10} className="animate-spin" /> Verificando...
                        </p>
                      )}
                      {!stNcmChecking && stNcmInfo?.encontrado && (
                        <p className={`text-[10px] mt-1 flex items-center gap-1 ${stNcmInfo.fonte === 'custom' ? 'text-amber-400' : 'text-blue-400'}`}>
                          {stNcmInfo.fonte === 'custom'
                            ? <><AlertCircle size={10} /> Já cadastrado manualmente — salvar irá sobrescrever.</>
                            : <><Info size={10} /> Já existe na base AL: {stNcmInfo.registro?.descricao?.slice(0, 50) || ''}. Cadastrar irá ter prioridade.</>
                          }
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground block mb-1">CEST</label>
                      <input
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:border-primary focus:ring-1 focus:ring-primary"
                        value={stFormCest}
                        onChange={e => setStFormCest(e.target.value)}
                        placeholder="00.000.00"
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <label className="text-[11px] font-medium text-muted-foreground block mb-1">Descrição do produto</label>
                      <input
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                        value={stFormDesc}
                        onChange={e => setStFormDesc(e.target.value)}
                        placeholder="Ex: Lubrificantes automotivos"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground block mb-1">MVA Interno (%) <span className="text-red-400">*</span></label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:border-primary focus:ring-1 focus:ring-primary"
                        value={stFormMvaInt}
                        onChange={e => setStFormMvaInt(e.target.value)}
                        placeholder="Ex: 36.56"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground block mb-1">MVA Ajust. 12% <span className="text-muted-foreground/50">(opcional)</span></label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:border-primary focus:ring-1 focus:ring-primary"
                        value={stFormMva12}
                        onChange={e => setStFormMva12(e.target.value)}
                        placeholder="Ex: 53.09"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground block mb-1">MVA Ajust. 7% <span className="text-muted-foreground/50">(opcional)</span></label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:border-primary focus:ring-1 focus:ring-primary"
                        value={stFormMva7}
                        onChange={e => setStFormMva7(e.target.value)}
                        placeholder="Ex: 61.78"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground block mb-1">MVA Ajust. 4% <span className="text-muted-foreground/50">(importados)</span></label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:border-primary focus:ring-1 focus:ring-primary"
                        value={stFormMva4}
                        onChange={e => setStFormMva4(e.target.value)}
                        placeholder="Ex: 67.00"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setStShowForm(false)} className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/50">Cancelar</button>
                    <button
                      onClick={saveCustomNCM}
                      disabled={stFormSaving}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      {stFormSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Salvar NCM
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de NCMs customizados */}
              {stCustomList.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  Nenhum NCM cadastrado manualmente. Use o botão acima para adicionar NCMs não encontrados na base AL.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                        <th className="px-4 py-2.5 text-left font-semibold">NCM</th>
                        <th className="px-4 py-2.5 text-left font-semibold">CEST</th>
                        <th className="px-4 py-2.5 text-left font-semibold">Descrição</th>
                        <th className="px-4 py-2.5 text-right font-semibold">MVA Interno</th>
                        <th className="px-4 py-2.5 text-right font-semibold">MVA Aj. 12%</th>
                        <th className="px-4 py-2.5 text-right font-semibold">MVA Aj. 7%</th>
                        <th className="px-4 py-2.5 text-right font-semibold">MVA Aj. 4% <span className="text-[9px] text-muted-foreground/60 font-normal">importados</span></th>
                        <th className="px-4 py-2.5 text-right font-semibold"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {stCustomList.map((c: any, i: number) => (
                        <tr key={i} className="border-t border-border/50 hover:bg-muted/30">
                          <td className="px-4 py-2.5 text-sm font-mono font-medium text-foreground">{c.ncm}</td>
                          <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{c.cest || '—'}</td>
                          <td className="px-4 py-2.5 text-xs text-foreground max-w-[200px] truncate">{c.descricao || '—'}</td>
                          <td className="px-4 py-2.5 text-sm text-right font-mono text-amber-400">{c.mva_interno?.toFixed(2)}%</td>
                          <td className="px-4 py-2.5 text-xs text-right font-mono text-muted-foreground">{c.mva_ajustada_12 != null ? `${c.mva_ajustada_12.toFixed(2)}%` : '—'}</td>
                          <td className="px-4 py-2.5 text-xs text-right font-mono text-muted-foreground">{c.mva_ajustada_7 != null ? `${c.mva_ajustada_7.toFixed(2)}%` : '—'}</td>
                          <td className="px-4 py-2.5 text-xs text-right font-mono text-muted-foreground">{c.mva_ajustada_4 != null ? `${c.mva_ajustada_4.toFixed(2)}%` : '—'}</td>
                          <td className="px-4 py-2.5 text-right">
                            <button onClick={() => deleteCustomNCM(c.ncm)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400">
                              <Trash2 size={13} />
                            </button>
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

        {/* ── Certidão ────────────────────────────────────────────────── */}
        {activeTab === 'certidao' && (
          <div className="space-y-6">
            <div className="grid lg:grid-cols-[360px_1fr] gap-6">
              {/* Painel esquerdo */}
              <div className="bg-card border border-border rounded-xl p-5 space-y-4 h-fit">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <ShieldCheck size={15} className="text-primary" /> Certidão Estadual — SEFAZ AL
                </h3>

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Empresa</label>
                  <select
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                    value={selectedCnpj}
                    onChange={e => setSelectedCnpj(e.target.value)}
                  >
                    <option value="">Selecione uma empresa</option>
                    {empresas.map(e => (
                      <option key={e.cnpj} value={e.cnpj}>{e.nome} — {fmtCnpj(e.cnpj)}</option>
                    ))}
                  </select>
                </div>

                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-1.5 font-medium text-primary"><Info size={13} /> O agente irá:</div>
                  <div>• Acessar o Portal do Contribuinte SEFAZ-AL</div>
                  <div>• Baixar a certidão de regularidade estadual</div>
                  <div>• Se POSITIVA: baixar o extrato de pendências</div>
                </div>

                <button
                  onClick={runCertidaoEstadual}
                  disabled={running || !selectedCnpj}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {running ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Baixar Certidão Estadual
                </button>

                {!selectedCnpj && (
                  <p className="text-xs text-muted-foreground text-center">Selecione uma empresa para continuar</p>
                )}
              </div>

              {/* Terminal */}
              <TerminalOutput title="certidao_sefaz.py" />
            </div>

            {/* Certidões e extratos baixados */}
            {(() => {
              const certArquivos = arquivos.filter(a =>
                a.nome.startsWith('certidao-') || a.nome.startsWith('extrato-')
              );
              if (certArquivos.length === 0) return null;
              return (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <FileText size={15} className="text-primary" /> Arquivos Baixados ({certArquivos.length})
                    </h3>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto scrollbar-thin">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-card z-10">
                        <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          <th className="px-5 py-3 text-left font-semibold">Empresa</th>
                          <th className="px-5 py-3 text-left font-semibold">Arquivo</th>
                          <th className="px-5 py-3 text-right font-semibold">Tamanho</th>
                          <th className="px-5 py-3 text-right font-semibold">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {certArquivos.map((a, i) => {
                          const isExtrato = a.nome.startsWith('extrato-');
                          return (
                            <tr key={i} className="border-t border-border/50 hover:bg-muted/30">
                              <td className="px-5 py-2.5 text-xs text-muted-foreground">{a.empresa}</td>
                              <td className="px-5 py-2.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-foreground font-medium">{a.nome}</span>
                                  {isExtrato && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-medium">
                                      POSITIVA
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-5 py-2.5 text-xs text-muted-foreground text-right font-mono">
                                {(a.tamanho / 1024).toFixed(0)} KB
                              </td>
                              <td className="px-5 py-2.5 text-right">
                                <a
                                  href={`${AGENT_API}/api/arquivos/${selectedMes}/download?path=${encodeURIComponent(a.caminho)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20"
                                >
                                  <Download size={12} /> Baixar
                                </a>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Empresas ───────────────────────────────────────────────── */}
        {activeTab === 'empresas' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Building2 size={15} className="text-primary" /> Gerenciar Empresas ({empresas.length})</h3>
              <div className="flex items-center gap-2">
                {isAllowedToDelete && empresas.length > 0 && (
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
                            <button
                              onClick={() => abrirPortal(e)}
                              title="Abrir Portal SEFAZ"
                              className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-400"
                            >
                              <ExternalLink size={14} />
                            </button>
                            <button onClick={() => openEditModal(e)} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                            {isAllowedToDelete && (
                              <button onClick={() => deleteEmpresa(e.idx, e.nome)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400"><Trash2 size={14} /></button>
                            )}
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

      {/* ── Modal Portal SEFAZ ─────────────────────────────────────────── */}
      {portalModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-2xl w-[420px] max-w-[94vw] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <ExternalLink size={16} className="text-emerald-400" /> Portal SEFAZ
              </h3>
              <button onClick={() => setPortalModal(null)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">{portalModal.nome}</p>

            <div className="space-y-2 mb-5">
              {/* Empresa */}
              <div className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
                <span className="text-xs text-muted-foreground w-14">Empresa</span>
                <span className="text-sm font-medium text-foreground truncate flex-1 text-right">{portalModal.nome}</span>
              </div>

              {/* Usuário com botão copiar */}
              <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
                <span className="text-xs text-muted-foreground w-14 shrink-0">Usuário</span>
                <span className="text-sm font-mono font-semibold text-foreground flex-1 text-right">{portalModal.usuario}</span>
                <button
                  onClick={() => copiarCampo('usuario', portalModal.usuario)}
                  className={`ml-1 p-1 rounded transition-colors shrink-0 ${copiedField === 'usuario' ? 'text-emerald-400' : 'text-muted-foreground hover:text-foreground'}`}
                  title="Copiar usuário"
                >
                  {copiedField === 'usuario' ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>

              {/* Senha com botão copiar */}
              <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
                <span className="text-xs text-muted-foreground w-14 shrink-0">Senha</span>
                <span className="text-sm font-mono font-semibold text-foreground flex-1 text-right tracking-widest">{'•'.repeat(Math.min(portalModal.senha.length, 10))}</span>
                <button
                  onClick={() => copiarCampo('senha', portalModal.senha)}
                  className={`ml-1 p-1 rounded transition-colors shrink-0 ${copiedField === 'senha' ? 'text-emerald-400' : 'text-muted-foreground hover:text-foreground'}`}
                  title="Copiar senha"
                >
                  {copiedField === 'senha' ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-muted-foreground text-center">Copie o usuário e a senha antes de abrir o portal</p>
              <button
                onClick={abrirPortalSefaz}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
              >
                <ExternalLink size={14} /> Abrir Portal SEFAZ
              </button>
              <button
                onClick={() => setPortalModal(null)}
                className="w-full py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

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
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Inscrição Estadual completa <span className="text-muted-foreground/60">(com DV — ex: 24051960-4)</span></label>
                <input className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:border-primary focus:ring-1 focus:ring-primary" value={formInscricao} onChange={e => setFormInscricao(e.target.value)} placeholder="Ex: 24051960-4" />
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
