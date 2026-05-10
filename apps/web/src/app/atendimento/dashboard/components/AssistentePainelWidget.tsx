'use client';

import { useEffect, useState, useCallback } from 'react';
import { Building2, ExternalLink, Copy, Check, X, Clock, AlertTriangle, ChevronDown, ChevronRight, User } from 'lucide-react';
import api from '@/lib/api';

const AGENT_API = process.env.NEXT_PUBLIC_AGENT_FISCAL_URL
  || (typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? `${window.location.origin}/agente-fiscal-api`
    : 'http://localhost:5000');

// ─── Tipos ───────────────────────────────────────────────────────

interface Empresa {
  idx: number;
  nome: string;
  cnpj: string;
  cnpj_fmt: string;
  usuario: string;
  senha: string;
}

interface ClienteSimples {
  id: string;
  nome: string;
  cnpj: string;
  cpf_responsavel: string;
  codigo_acesso: string;
}

interface AssistanteGroup {
  user: { id: string; name: string };
  tasks: {
    id: string;
    title: string;
    type: string;
    status: string;
    priority: string;
    start_at: string | null;
    overdue: boolean;
    lead: { id: string; name: string | null; phone: string } | null;
    created_by: { id: string; name: string } | null;
  }[];
}

// ─── Helpers ─────────────────────────────────────────────────────

function fmtCnpj(cnpj: string) {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function daysLabel(dateStr: string | null): { text: string; overdue: boolean; urgent: boolean } {
  if (!dateStr) return { text: '', overdue: false, urgent: false };
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { text: `${Math.abs(diff)}d atrasado`, overdue: true, urgent: true };
  if (diff === 0) return { text: 'Hoje', overdue: false, urgent: true };
  if (diff === 1) return { text: 'Amanhã', overdue: false, urgent: false };
  return { text: `em ${diff}d`, overdue: false, urgent: false };
}

// ─── Modais ──────────────────────────────────────────────────────

function PortalModal({ empresa, onClose }: { empresa: Empresa; onClose: () => void }) {
  const [copied, setCopied] = useState<'usuario' | 'senha' | null>(null);
  const copiar = async (campo: 'usuario' | 'senha', valor: string) => {
    try { await navigator.clipboard.writeText(valor); } catch {}
    setCopied(campo);
    setTimeout(() => setCopied(null), 2000);
  };
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-2xl w-[420px] max-w-[94vw] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <ExternalLink size={16} className="text-emerald-400" /> Portal do Contribuinte
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{empresa.nome}</p>
        <div className="space-y-2 mb-5">
          <div className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
            <span className="text-xs text-muted-foreground w-14">Empresa</span>
            <span className="text-sm font-medium text-foreground truncate flex-1 text-right">{empresa.nome}</span>
          </div>
          <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
            <span className="text-xs text-muted-foreground w-14 shrink-0">Usuário</span>
            <span className="text-sm font-mono font-semibold text-foreground flex-1 text-right">{empresa.usuario}</span>
            <button onClick={() => copiar('usuario', empresa.usuario)} className={`ml-1 p-1 rounded transition-colors shrink-0 ${copied === 'usuario' ? 'text-emerald-400' : 'text-muted-foreground hover:text-foreground'}`}>
              {copied === 'usuario' ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
          <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
            <span className="text-xs text-muted-foreground w-14 shrink-0">Senha</span>
            <span className="text-sm font-mono font-semibold text-foreground flex-1 text-right tracking-widest">{'•'.repeat(Math.min(empresa.senha.length, 10))}</span>
            <button onClick={() => copiar('senha', empresa.senha)} className={`ml-1 p-1 rounded transition-colors shrink-0 ${copied === 'senha' ? 'text-emerald-400' : 'text-muted-foreground hover:text-foreground'}`}>
              {copied === 'senha' ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-muted-foreground text-center">Copie o usuário e a senha antes de abrir o portal</p>
          <button onClick={() => window.open('https://contribuinte.sefaz.al.gov.br', '_blank')} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors">
            <ExternalLink size={14} /> Abrir Portal do Contribuinte
          </button>
        </div>
      </div>
    </div>
  );
}

function SimplesModal({ cliente, onClose }: { cliente: ClienteSimples; onClose: () => void }) {
  const [copied, setCopied] = useState<'cnpj' | 'cpf' | 'codigo' | null>(null);
  const copiar = async (campo: 'cnpj' | 'cpf' | 'codigo', valor: string) => {
    try { await navigator.clipboard.writeText(valor); } catch {}
    setCopied(campo);
    setTimeout(() => setCopied(null), 2000);
  };
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-2xl w-[420px] max-w-[94vw] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <ExternalLink size={16} className="text-blue-400" /> Simples Nacional
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{cliente.nome}</p>
        <div className="space-y-2 mb-5">
          <div className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
            <span className="text-xs text-muted-foreground w-20 shrink-0">Empresa</span>
            <span className="text-sm font-medium text-foreground truncate flex-1 text-right">{cliente.nome}</span>
          </div>
          <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
            <span className="text-xs text-muted-foreground w-20 shrink-0">CNPJ</span>
            <span className="text-sm font-mono text-foreground flex-1 text-right">{cliente.cnpj.replace(/\D/g, '')}</span>
            <button onClick={() => copiar('cnpj', cliente.cnpj.replace(/\D/g, ''))} className={`ml-1 p-1 rounded transition-colors shrink-0 ${copied === 'cnpj' ? 'text-blue-400' : 'text-muted-foreground hover:text-foreground'}`}>
              {copied === 'cnpj' ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
          {cliente.cpf_responsavel && (
            <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
              <span className="text-xs text-muted-foreground w-20 shrink-0">CPF Resp.</span>
              <span className="text-sm font-mono font-semibold text-foreground flex-1 text-right">{cliente.cpf_responsavel.replace(/\D/g, '')}</span>
              <button onClick={() => copiar('cpf', cliente.cpf_responsavel.replace(/\D/g, ''))} className={`ml-1 p-1 rounded transition-colors shrink-0 ${copied === 'cpf' ? 'text-blue-400' : 'text-muted-foreground hover:text-foreground'}`}>
                {copied === 'cpf' ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          )}
          {cliente.codigo_acesso && (
            <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
              <span className="text-xs text-muted-foreground w-20 shrink-0">Cód. Acesso</span>
              <span className="text-sm font-mono font-semibold text-foreground flex-1 text-right">{cliente.codigo_acesso}</span>
              <button onClick={() => copiar('codigo', cliente.codigo_acesso)} className={`ml-1 p-1 rounded transition-colors shrink-0 ${copied === 'codigo' ? 'text-blue-400' : 'text-muted-foreground hover:text-foreground'}`}>
                {copied === 'codigo' ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-muted-foreground text-center">Copie os dados antes de abrir o Simples Nacional</p>
          <button onClick={() => window.open('https://www8.receita.fazenda.gov.br/SimplesNacional/Servicos/Grupo.aspx?grp=t&area=1', '_blank')} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors">
            <ExternalLink size={14} /> Abrir Simples Nacional
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Seção de Acessos ─────────────────────────────────────────────

function AcessosSection() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [simplesClientes, setSimplesClientes] = useState<ClienteSimples[]>([]);
  const [portalModal, setPortalModal] = useState<Empresa | null>(null);
  const [simplesModal, setSimplesModal] = useState<ClienteSimples | null>(null);

  const fetchEmpresas = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_API}/api/empresas`);
      if (res.ok) {
        const data: Empresa[] = await res.json();
        setEmpresas(data.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
      }
    } catch {}
  }, []);

  const fetchSimples = useCallback(async () => {
    try {
      const res = await api.get('/intern/simples-nacional');
      if (Array.isArray(res.data)) {
        setSimplesClientes(res.data.sort((a: ClienteSimples, b: ClienteSimples) => a.nome.localeCompare(b.nome, 'pt-BR')));
      }
    } catch {}
  }, []);

  useEffect(() => { fetchEmpresas(); fetchSimples(); }, [fetchEmpresas, fetchSimples]);

  if (empresas.length === 0 && simplesClientes.length === 0) return null;

  const normCnpj = (c: string) => c.replace(/\D/g, '');
  const map = new Map<string, { cnpj: string; nome: string; empresa?: Empresa; simples?: ClienteSimples }>();
  for (const e of empresas) map.set(normCnpj(e.cnpj), { cnpj: e.cnpj, nome: e.nome, empresa: e });
  for (const c of simplesClientes) {
    const key = normCnpj(c.cnpj);
    if (map.has(key)) map.get(key)!.simples = c;
    else map.set(key, { cnpj: c.cnpj, nome: c.nome, simples: c });
  }
  const linhas = Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  return (
    <>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-border bg-muted/20">
          <Building2 size={13} className="text-muted-foreground" />
          {simplesClientes.length > 0 && <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">Simples Nacional ({simplesClientes.length})</span>}
          {empresas.length > 0 && simplesClientes.length > 0 && <span className="text-muted-foreground/40 text-xs">·</span>}
          {empresas.length > 0 && <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Portal do Contribuinte ({empresas.length})</span>}
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/10">
              <th className="px-4 py-2 text-left font-semibold">Empresa</th>
              <th className="px-4 py-2 text-left font-semibold hidden md:table-cell">CNPJ</th>
              {simplesClientes.length > 0 && <th className="px-3 py-2 text-center font-semibold text-blue-400/80">Simples Nacional</th>}
              {empresas.length > 0 && <th className="px-3 py-2 text-center font-semibold text-emerald-400/80">Portal Contribuinte</th>}
            </tr>
          </thead>
          <tbody>
            {linhas.map((row) => (
              <tr key={row.cnpj} className="border-t border-border/50 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-2 text-[12px] font-medium text-foreground">{row.nome}</td>
                <td className="px-4 py-2 text-[11px] text-muted-foreground font-mono hidden md:table-cell">{fmtCnpj(row.cnpj)}</td>
                {simplesClientes.length > 0 && (
                  <td className="px-3 py-2 text-center">
                    {row.simples
                      ? <button onClick={() => setSimplesModal(row.simples!)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400 text-[10px] font-medium hover:bg-blue-500/20 transition-colors"><ExternalLink size={11} /> Abrir</button>
                      : <span className="text-muted-foreground/30 text-[10px]">—</span>}
                  </td>
                )}
                {empresas.length > 0 && (
                  <td className="px-3 py-2 text-center">
                    {row.empresa
                      ? <button onClick={() => setPortalModal(row.empresa!)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-medium hover:bg-emerald-500/20 transition-colors"><ExternalLink size={11} /> Abrir</button>
                      : <span className="text-muted-foreground/30 text-[10px]">—</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {portalModal && <PortalModal empresa={portalModal} onClose={() => setPortalModal(null)} />}
      {simplesModal && <SimplesModal cliente={simplesModal} onClose={() => setSimplesModal(null)} />}
    </>
  );
}

// ─── Seção de Tarefas dos Assistentes ────────────────────────────

function TarefasAssistentesSection() {
  const [grupos, setGrupos] = useState<AssistanteGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetch = useCallback(async () => {
    try {
      const res = await api.get('/intern/all-assistant-tasks');
      if (Array.isArray(res.data)) {
        setGrupos(res.data);
        const init: Record<string, boolean> = {};
        res.data.forEach((g: AssistanteGroup) => { init[g.user.id] = true; });
        setExpanded(init);
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const toggle = (uid: string) => setExpanded(prev => ({ ...prev, [uid]: !prev[uid] }));

  if (loading) return (
    <div className="bg-card border border-border rounded-xl p-4 animate-pulse">
      <div className="h-4 w-48 bg-muted rounded mb-3" />
      {[1,2,3].map(i => <div key={i} className="h-8 bg-muted rounded mb-2" />)}
    </div>
  );

  if (grupos.length === 0) return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
      <Clock size={16} className="text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">Nenhuma tarefa pendente para assistentes.</p>
    </div>
  );

  const totalTasks = grupos.reduce((s, g) => s + g.tasks.length, 0);
  const totalOverdue = grupos.reduce((s, g) => s + g.tasks.filter(t => t.overdue).length, 0);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
        <h3 className="text-[11px] font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
          <User size={13} className="text-muted-foreground" /> Tarefas dos Assistentes
          <span className="text-muted-foreground font-normal normal-case tracking-normal">({totalTasks} pendentes)</span>
        </h3>
        {totalOverdue > 0 && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-red-400">
            <AlertTriangle size={11} /> {totalOverdue} atrasada{totalOverdue !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="divide-y divide-border/50">
        {grupos.map((grupo) => {
          const overdueCount = grupo.tasks.filter(t => t.overdue).length;
          const isOpen = expanded[grupo.user.id] ?? true;
          return (
            <div key={grupo.user.id}>
              <button
                onClick={() => toggle(grupo.user.id)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isOpen ? <ChevronDown size={12} className="text-muted-foreground" /> : <ChevronRight size={12} className="text-muted-foreground" />}
                  <span className="text-[12px] font-semibold text-foreground">{grupo.user.name}</span>
                  <span className="text-[10px] text-muted-foreground">({grupo.tasks.length} tarefa{grupo.tasks.length !== 1 ? 's' : ''})</span>
                </div>
                {overdueCount > 0 && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">{overdueCount} atrasada{overdueCount !== 1 ? 's' : ''}</span>
                )}
              </button>

              {isOpen && (
                <div className="pb-1">
                  {grupo.tasks.map((t) => {
                    const due = t.start_at ? daysLabel(t.start_at) : null;
                    const isUrgent = t.priority === 'URGENTE' || due?.urgent;
                    return (
                      <div key={t.id} className={`flex items-start gap-3 px-6 py-2 ${t.overdue ? 'bg-red-500/3' : ''}`}>
                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${t.overdue ? 'bg-red-400' : isUrgent ? 'bg-amber-400' : 'bg-muted-foreground/40'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-foreground truncate">{t.title}</p>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            {due && (
                              <span className={`text-[10px] font-semibold ${due.overdue ? 'text-red-400' : due.urgent ? 'text-amber-400' : 'text-muted-foreground'}`}>
                                {due.text}
                              </span>
                            )}
                            {t.lead?.name && <span className="text-[10px] text-muted-foreground truncate">· {t.lead.name}</span>}
                            {t.priority === 'URGENTE' && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">URGENTE</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Widget Principal ─────────────────────────────────────────────

export function AssistentePainelWidget() {
  return (
    <div className="space-y-4">
      <AcessosSection />
      <TarefasAssistentesSection />
    </div>
  );
}
