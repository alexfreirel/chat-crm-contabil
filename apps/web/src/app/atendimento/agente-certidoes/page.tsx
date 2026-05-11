'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck, Building2, Download,
  RefreshCw, CheckCircle2,
  XCircle, ExternalLink, Loader2,
  Users, ArrowRight, Server,
} from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CnpjEntry { cnpj: string; nome: string; clienteId?: string; }

interface Arquivo {
  nome: string; cnpj: string; cnpj_fmt: string;
  tamanho_kb: number; data: string;
}

type TabId = 'cnpjs' | 'certidoes';
type PortalTipo = 'cnd' | 'fgts' | 'trabalhista' | 'falencia';

const PORTAL_INSTRUCAO: Record<PortalTipo, { campo: string; acao: string }> = {
  cnd: { campo: 'Informe o CNPJ', acao: 'Emitir Certidão' },
  fgts: { campo: 'Inscrição (CNPJ)', acao: 'Consultar' },
  trabalhista: { campo: 'CNPJ', acao: 'Emitir Certidão' },
  falencia: { campo: 'CNPJ', acao: 'Solicitar Certidão' },
};

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

// ─── Página principal ─────────────────────────────────────────────────────────

export default function AgenteCertidoesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('cnpjs');
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // ── CNPJs (fonte: Clientes Contábeis) ──
  const [cnpjs, setCnpjs] = useState<CnpjEntry[]>([]);
  const [carregandoCnpjs, setCarregandoCnpjs] = useState(false);
  const [totalClientes, setTotalClientes] = useState(0);
  const [clientesSemCnpj, setClientesSemCnpj] = useState(0);

  // ── Certidões ──
  const [arquivos, setArquivos] = useState<Arquivo[]>([]);
  const [dlCnpj, setDlCnpj] = useState('');
  const [dlStatus, setDlStatus] = useState<{ tipo: PortalTipo; running: boolean; resultado?: { ok: boolean; mensagem: string; cnpj_fmt?: string; url?: string } } | null>(null);

  // ── Toast ──
  const [toasts, setToasts] = useState<{ id: number; text: string; type: 'ok' | 'err' }[]>([]);
  let toastIdRef = 0;
  const toast = (text: string, type: 'ok' | 'err' = 'ok') => {
    const id = ++toastIdRef;
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

  // ─── Carrega CNPJs direto dos Clientes Contábeis ─────────────────────────
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
      lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

      setCnpjs(lista);
      setTotalClientes(clientes.length);
      setClientesSemCnpj(semCnpj);
      setDlCnpj(prev => prev || lista[0]?.cnpj || '');
    } catch { /* offline */ }
    finally { setCarregandoCnpjs(false); }
  }, []);

  // ─── Certidões salvas ─────────────────────────────────────────────────────
  const loadArquivos = useCallback(async () => {
    try {
      const data: Arquivo[] = await fetch(`${AGENT_API}/api/certidoes`).then(r => r.json());
      setArquivos(data);
    } catch { /* offline */ }
  }, []);

  const abrirPortal = async (tipo: PortalTipo) => {
    if (!dlCnpj) { toast('Selecione um CNPJ.', 'err'); return; }
    const cnpjLimpo = limparCnpj(dlCnpj);
    let copiado = false;
    try {
      await navigator.clipboard.writeText(cnpjLimpo);
      copiado = true;
    } catch { /* clipboard bloqueado */ }
    setDlStatus({ tipo, running: true });
    try {
      const res = await fetch(`${AGENT_API}/api/baixar/${tipo}/${cnpjLimpo}`, { method: 'POST' });
      const data = await res.json();
      const url = data?.resultado?.url;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      const inst = PORTAL_INSTRUCAO[tipo];
      setDlStatus({
        tipo,
        ...data,
        resultado: data?.resultado ? {
          ...data.resultado,
          mensagem: copiado
            ? `CNPJ copiado! No portal, clique no campo "${inst.campo}" e cole (Ctrl+V). Depois resolva o captcha e clique em "${inst.acao}".`
            : data.resultado.mensagem,
        } : data?.resultado,
      });
    } catch {
      setDlStatus({ tipo, running: false, resultado: { ok: false, mensagem: 'Agente inacessível.' } });
    }
  };

  // ─── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    checkAgent();
    carregarCnpjs();
    const interval = setInterval(checkAgent, 30000);
    return () => clearInterval(interval);
  }, [checkAgent, carregarCnpjs]);

  // ─── Tab change ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'certidoes') { loadArquivos(); carregarCnpjs(); }
    if (activeTab === 'cnpjs') carregarCnpjs();
  }, [activeTab, loadArquivos, carregarCnpjs]);

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 size={28} className="animate-spin text-muted-foreground" />
    </div>
  );

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'cnpjs', label: 'CNPJs', icon: Building2 },
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
              Emissão de certidões PJ — Receita Federal, FGTS/CRF, TST e TJAL
            </p>
          </div>
          <div className="flex items-center gap-3">
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
            <button onClick={() => { checkAgent(); carregarCnpjs(); }}
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

        {/* ── CNPJs ── */}
        {activeTab === 'cnpjs' && (
          <div className="max-w-5xl space-y-4">
            {/* Banner explicativo */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
              <Building2 size={20} className="text-primary mt-0.5 shrink-0" />
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
                <div className="text-[11px] text-emerald-700/80">PJ com CNPJ válido</div>
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
                <span>CNPJs {cnpjs.length ? `(${cnpjs.length})` : ''}</span>
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

        {/* ── CERTIDÕES ── */}
        {activeTab === 'certidoes' && (
          <div className="max-w-4xl space-y-6">
            {/* CNPJ comum aos cards de emissão */}
            <div className="rounded-xl border border-border bg-card p-5">
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

            {/* Cards de emissão */}
            {([
              { tipo: 'cnd' as const, titulo: 'Baixar CND Federal', botao: 'Abrir Portal da Receita', loading: 'Abrindo portal da Receita Federal numa nova aba…' },
              { tipo: 'fgts' as const, titulo: 'Baixar CRF FGTS', botao: 'Abrir Portal da Caixa', loading: 'Abrindo portal da Caixa (CRF/FGTS) numa nova aba…' },
              { tipo: 'trabalhista' as const, titulo: 'Baixar CND Trabalhista', botao: 'Abrir Portal do TST', loading: 'Abrindo portal do TST numa nova aba…' },
              { tipo: 'falencia' as const, titulo: 'Baixar CND Falência', botao: 'Abrir Portal do TJAL', loading: 'Abrindo portal do TJAL numa nova aba…' },
            ]).map(card => {
              const ativo = dlStatus?.tipo === card.tipo;
              const running = ativo && dlStatus?.running;
              const resultado = ativo && !dlStatus?.running ? dlStatus?.resultado : null;
              return (
                <div key={card.tipo} className="rounded-xl border border-border bg-card p-5">
                  <h2 className="font-semibold mb-4 flex items-center gap-2">
                    <Download size={15} className="text-primary" /> {card.titulo}
                  </h2>
                  <button onClick={() => abrirPortal(card.tipo)} disabled={running}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-[13px] hover:opacity-90 disabled:opacity-50">
                    {running ? <><Loader2 size={14} className="animate-spin" /> Abrindo...</> : <><ExternalLink size={14} /> {card.botao}</>}
                  </button>
                  {running && (
                    <div className="mt-3 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 text-[12px] rounded-lg px-4 py-3 border border-blue-200 dark:border-blue-800">
                      <Loader2 size={12} className="inline animate-spin mr-2" />
                      {card.loading}
                    </div>
                  )}
                  {resultado && (
                    <div className={`mt-3 text-[12px] rounded-lg px-4 py-3 border ${resultado.ok ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 border-emerald-200' : 'bg-red-50 dark:bg-red-950/20 text-red-700 border-red-200'}`}>
                      {resultado.ok
                        ? <><CheckCircle2 size={12} className="inline mr-1" /> <strong>{resultado.mensagem}</strong> — {resultado.cnpj_fmt}</>
                        : <><XCircle size={12} className="inline mr-1" /> <strong>Erro:</strong> {resultado.mensagem}</>
                      }
                    </div>
                  )}
                </div>
              );
            })}

            {/* Arquivos salvos */}
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
