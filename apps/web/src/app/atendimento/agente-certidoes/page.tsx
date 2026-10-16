'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck, Building2, Download,
  RefreshCw, CheckCircle2,
  XCircle, ExternalLink, Loader2,
  Users, ArrowRight, Server, Upload, HardDrive, Save,
} from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';
import { useRole } from '@/lib/useRole';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CnpjEntry { cnpj: string; nome: string; clienteId?: string; }

interface Arquivo {
  nome: string; cnpj: string; cnpj_fmt: string;
  tamanho_kb: number; data: string;
}

type PortalTipo = 'cnd' | 'fgts' | 'trabalhista' | 'falencia' | 'estadual';

interface CertidaoCol {
  tipo: PortalTipo;
  titulo: string;
  subtitulo: string;
}

const CERTIDOES: CertidaoCol[] = [
  { tipo: 'cnd',         titulo: 'CND Federal',  subtitulo: 'Receita Federal' },
  { tipo: 'fgts',        titulo: 'CRF FGTS',     subtitulo: 'Caixa' },
  { tipo: 'trabalhista', titulo: 'Trabalhista',  subtitulo: 'TST' },
  { tipo: 'falencia',    titulo: 'Falência',     subtitulo: 'TJAL' },
  { tipo: 'estadual',    titulo: 'Estadual',     subtitulo: 'SEFAZ-AL' },
];

const PORTAL_URL: Record<PortalTipo, string> = {
  cnd:         'https://servicos.receitafederal.gov.br/servico/certidoes/#/home/cnpj',
  fgts:        'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
  trabalhista: 'https://cndt-certidao.tst.jus.br/inicio.faces',
  falencia:    'https://www2.tjal.jus.br/sco/abrirCadastro.do?servico=810101',
  estadual:    'https://contribuinte.sefaz.al.gov.br/certidao/#/emitir-certidao-positiva',
};

interface DriveConfig {
  driveReady: boolean; configured: boolean;
  folderId: string | null; folderName: string | null; folderUrl: string | null;
}

interface CertidaoDrive {
  id: string; name: string; webViewLink: string | null;
  createdTime: string | null; cnpj: string; tipo: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCnpj(c: string) {
  const d = c.replace(/\D/g, '');
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function limparCnpj(c: string) { return c.replace(/\D/g, ''); }

function statusKey(cnpj: string, tipo: PortalTipo) { return `${cnpj}|${tipo}`; }

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

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
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // ── CNPJs (fonte: Clientes Contábeis) ──
  const [cnpjs, setCnpjs] = useState<CnpjEntry[]>([]);
  const [carregandoCnpjs, setCarregandoCnpjs] = useState(false);
  const [totalClientes, setTotalClientes] = useState(0);
  const [clientesSemCnpj, setClientesSemCnpj] = useState(0);

  // ── Certidões salvas ──
  const [arquivos, setArquivos] = useState<Arquivo[]>([]);

  // ── Google Drive (pasta das certidões) ──
  const { isAdmin, isContador } = useRole();
  const canConfigDrive = isAdmin || isContador;
  const [driveCfg, setDriveCfg] = useState<DriveConfig | null>(null);
  const [folderInput, setFolderInput] = useState('');
  const [savingFolder, setSavingFolder] = useState(false);
  const [editandoPasta, setEditandoPasta] = useState(false);
  const [anexadas, setAnexadas] = useState<CertidaoDrive[]>([]);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const alvoAnexo = useRef<{ c: CnpjEntry; col: CertidaoCol } | null>(null);

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

  // ─── Abrir portal da certidão (coluna) ────────────────────────────────────
  const abrirPortal = (tipo: PortalTipo) => {
    window.open(PORTAL_URL[tipo], '_blank', 'noopener,noreferrer');
  };

  // ─── Google Drive: config + certidões anexadas ────────────────────────────
  const loadDrive = useCallback(async () => {
    try {
      const cfg = await fetch(`${API_BASE_URL}/google-drive/certidoes/config`, { headers: authHeaders() });
      if (cfg.ok) setDriveCfg(await cfg.json());
      const arq = await fetch(`${API_BASE_URL}/google-drive/certidoes/arquivos`, { headers: authHeaders() });
      if (arq.ok) setAnexadas(await arq.json());
    } catch { /* offline */ }
  }, []);

  const salvarPasta = async () => {
    if (!folderInput.trim()) return;
    setSavingFolder(true);
    try {
      const res = await fetch(`${API_BASE_URL}/google-drive/certidoes/config`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: folderInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data?.message || 'Não foi possível salvar a pasta.', 'err'); return; }
      setDriveCfg(data);
      setFolderInput('');
      setEditandoPasta(false);
      toast('Pasta do Google Drive configurada.');
      loadDrive();
    } catch { toast('Erro ao salvar a pasta.', 'err'); }
    finally { setSavingFolder(false); }
  };

  const iniciarAnexo = (c: CnpjEntry, col: CertidaoCol) => {
    if (!driveCfg?.configured) {
      toast(canConfigDrive ? 'Configure a pasta do Google Drive primeiro.' : 'Peça ao admin/contador para configurar a pasta do Google Drive.', 'err');
      return;
    }
    alvoAnexo.current = { c, col };
    fileInputRef.current?.click();
  };

  const enviarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const alvo = alvoAnexo.current;
    if (!file || !alvo) return;
    const { c, col } = alvo;
    const key = statusKey(c.cnpj, col.tipo);
    setUploading(p => ({ ...p, [key]: true }));
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('cnpj', c.cnpj);
      form.append('nome', c.nome);
      form.append('tipo', col.tipo);
      form.append('titulo', col.titulo);
      const res = await fetch(`${API_BASE_URL}/google-drive/certidoes/upload`, {
        method: 'POST', headers: authHeaders(), body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data?.message || 'Falha ao anexar.', 'err'); return; }
      setAnexadas(p => [data, ...p]);
      toast(`${col.titulo} anexada no Google Drive.`);
    } catch { toast('Erro ao enviar o arquivo.', 'err'); }
    finally { setUploading(p => ({ ...p, [key]: false })); }
  };

  // ─── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    checkAgent();
    carregarCnpjs();
    loadArquivos();
    loadDrive();
    const interval = setInterval(checkAgent, 30000);
    return () => clearInterval(interval);
  }, [checkAgent, carregarCnpjs, loadArquivos, loadDrive]);

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 size={28} className="animate-spin text-muted-foreground" />
    </div>
  );

  // Última certidão anexada por (cnpj, tipo) — a lista já vem da mais recente para a mais antiga
  const ultimaAnexada = new Map<string, CertidaoDrive>();
  for (const a of anexadas) {
    const k = `${a.cnpj}|${a.tipo}`;
    if (!ultimaAnexada.has(k)) ultimaAnexada.set(k, a);
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">

      {/* ── Header ── */}
      <div className="shrink-0 border-b border-border bg-card px-6 pt-5 pb-5">
        <div className="flex items-center justify-between">
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
            <button onClick={() => { checkAgent(); carregarCnpjs(); loadArquivos(); loadDrive(); }}
              className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Conteúdo ── */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1400px] mx-auto space-y-4">

          {/* Banner explicativo */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
            <Building2 size={20} className="text-primary mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-[13px] font-semibold">Lista sincronizada automaticamente</p>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                Os CNPJs vêm direto da tela <strong>Clientes Contábeis</strong> (apenas pessoas jurídicas com CNPJ válido).
                Para adicionar, remover ou editar, gerencie no cadastro de clientes — qualquer alteração aparece aqui em seguida.
              </p>
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

          {/* Google Drive — pasta das certidões */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <HardDrive size={20} className="text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold">Google Drive — pasta das certidões</p>
                {!driveCfg ? (
                  <p className="text-[12px] text-muted-foreground mt-0.5">Carregando…</p>
                ) : !driveCfg.driveReady ? (
                  <p className="text-[12px] text-amber-600 mt-0.5">
                    O Google Drive ainda não está conectado. O administrador precisa conectar em Configurações › Google Drive.
                  </p>
                ) : driveCfg.configured && !editandoPasta ? (
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    As certidões anexadas são salvas em{' '}
                    <a href={driveCfg.folderUrl || '#'} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
                      {driveCfg.folderName || 'pasta configurada'}
                    </a>
                    , em uma subpasta por empresa.
                  </p>
                ) : (
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    {canConfigDrive
                      ? 'Cole o link (ou ID) da pasta do Drive onde as certidões serão salvas. Ela precisa estar acessível à conta conectada ao Drive.'
                      : 'A pasta de certidões ainda não foi configurada. Peça ao administrador ou contador.'}
                  </p>
                )}

                {canConfigDrive && driveCfg?.driveReady && (!driveCfg.configured || editandoPasta) && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      value={folderInput}
                      onChange={e => setFolderInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') salvarPasta(); }}
                      placeholder="https://drive.google.com/drive/folders/..."
                      className="flex-1 min-w-0 text-[12px] px-3 py-2 rounded-lg border border-border bg-background outline-none focus:border-primary"
                    />
                    <button
                      onClick={salvarPasta}
                      disabled={savingFolder || !folderInput.trim()}
                      className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
                    >
                      {savingFolder ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar
                    </button>
                    {editandoPasta && (
                      <button onClick={() => { setEditandoPasta(false); setFolderInput(''); }}
                        className="text-[12px] px-3 py-2 rounded-lg border border-border text-muted-foreground hover:bg-accent">
                        Cancelar
                      </button>
                    )}
                  </div>
                )}
              </div>
              {canConfigDrive && driveCfg?.configured && !editandoPasta && (
                <button onClick={() => setEditandoPasta(true)}
                  className="text-[12px] px-3 py-1.5 rounded-lg border border-border hover:bg-accent text-muted-foreground transition-colors">
                  Alterar pasta
                </button>
              )}
            </div>
          </div>

          {/* Tabela unificada */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border font-semibold flex items-center justify-between">
              <span>Empresas {cnpjs.length ? `(${cnpjs.length})` : ''}</span>
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
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-5 py-3 font-semibold text-muted-foreground sticky left-0 bg-muted/30 z-10">Empresa / CNPJ</th>
                      {CERTIDOES.map(col => (
                        <th key={col.tipo} className="text-center px-3 py-3 font-semibold text-muted-foreground whitespace-nowrap">
                          <div>{col.titulo}</div>
                          <div className="text-[10px] font-normal opacity-70 mt-0.5">{col.subtitulo}</div>
                          <button
                            onClick={() => abrirPortal(col.tipo)}
                            className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            title={`Abrir portal — ${col.titulo} (${col.subtitulo})`}
                          >
                            <ExternalLink size={12} /> Abrir
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cnpjs.map(c => (
                      <tr key={c.cnpj} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3 sticky left-0 bg-card hover:bg-muted/20 z-10 min-w-[260px]">
                          <div className="text-[13px] font-medium truncate">{c.nome || '—'}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">{fmtCnpj(c.cnpj)}</div>
                        </td>
                        {CERTIDOES.map(col => {
                          const key = statusKey(c.cnpj, col.tipo);
                          const enviando = !!uploading[key];
                          const anexo = ultimaAnexada.get(key);
                          return (
                            <td key={col.tipo} className="px-3 py-3 text-center">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  onClick={() => iniciarAnexo(c, col)}
                                  disabled={enviando}
                                  className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
                                  title={anexo ? `Anexar nova versão — ${col.titulo}` : `Anexar ${col.titulo}`}
                                >
                                  {enviando
                                    ? <><Loader2 size={12} className="animate-spin" /> Enviando…</>
                                    : <><Upload size={12} /> Anexar</>
                                  }
                                </button>
                                {anexo?.webViewLink && (
                                  <a
                                    href={anexo.webViewLink}
                                    target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center text-emerald-600 hover:text-emerald-700"
                                    title={`Anexada${anexo.createdTime ? ` em ${new Date(anexo.createdTime).toLocaleDateString('pt-BR')}` : ''} — abrir no Drive`}
                                  >
                                    <CheckCircle2 size={16} />
                                  </a>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

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
      </div>

      <input ref={fileInputRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={enviarArquivo} />

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
