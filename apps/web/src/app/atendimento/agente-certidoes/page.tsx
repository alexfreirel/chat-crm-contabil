'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck, Building2,
  RefreshCw, CheckCircle2,
  XCircle, ExternalLink, Loader2,
  Users, ArrowRight, Server, Upload, HardDrive, Save,
} from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';
import { abrirAnexo } from '@/lib/abrirAnexo';
import { useRole } from '@/lib/useRole';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CnpjEntry { cnpj: string; nome: string; clienteId?: string; }

type PortalTipo = 'cnd' | 'fgts' | 'trabalhista' | 'falencia' | 'estadual' | 'municipal';

interface CertidaoCol {
  tipo: PortalTipo | 'alvara';
  titulo: string;
  subtitulo: string;
}

// Alvará de Funcionamento: mesmo fluxo das certidões (um arquivo por empresa, "Atualizar" substitui)
const ALVARA: CertidaoCol = { tipo: 'alvara', titulo: 'Alvará de Funcionamento', subtitulo: 'Prefeitura' };

const CERTIDOES: CertidaoCol[] = [
  { tipo: 'cnd',         titulo: 'CND Federal',  subtitulo: 'Receita Federal' },
  { tipo: 'fgts',        titulo: 'CRF FGTS',     subtitulo: 'Caixa' },
  { tipo: 'trabalhista', titulo: 'Trabalhista',  subtitulo: 'TST' },
  { tipo: 'falencia',    titulo: 'Falência',     subtitulo: 'TJAL' },
  { tipo: 'estadual',    titulo: 'Estadual',     subtitulo: 'SEFAZ-AL' },
  { tipo: 'municipal',   titulo: 'Municipal',    subtitulo: 'Prefeitura de Arapiraca' },
];

const PORTAL_URL: Record<PortalTipo, string> = {
  cnd:         'https://servicos.receitafederal.gov.br/servico/certidoes/#/home/cnpj',
  fgts:        'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
  trabalhista: 'https://cndt-certidao.tst.jus.br/inicio.faces',
  falencia:    'https://www2.tjal.jus.br/sco/abrirCadastro.do?servico=810101',
  estadual:    'https://contribuinte.sefaz.al.gov.br/certidao/#/emitir-certidao-positiva',
  municipal:   'https://arapiraca.abaco.com.br/eagata/servlet/hwtportalcontribuinte?20,certidao-geral',
};

interface DriveConfig {
  driveReady: boolean; configured: boolean;
  folderId: string | null; folderName: string | null; folderUrl: string | null;
}

interface ContratoDrive {
  id: string; name: string; webViewLink: string | null;
  createdTime: string | null; cnpj: string; titulo: string;
}

const TIPOS_CONTRATO = [
  'Contrato de Constituição',
  ...Array.from({ length: 15 }, (_, i) => `${i + 1}ª Alteração Contratual`),
  'Outro',
];

interface CertidaoDrive {
  id: string; name: string; webViewLink: string | null;
  createdTime: string | null; modifiedTime?: string | null; cnpj: string; tipo: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCnpj(c: string) {
  const d = c.replace(/\D/g, '');
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function limparCnpj(c: string) { return c.replace(/\D/g, ''); }

function statusKey(cnpj: string, tipo: CertidaoCol['tipo']) { return `${cnpj}|${tipo}`; }

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

  // ── Contratos sociais / alterações (sempre acumula, nunca substitui) ──
  const [contratosCfg, setContratosCfg] = useState<DriveConfig | null>(null);
  const [contratos, setContratos] = useState<ContratoDrive[]>([]);
  const [contratoAlvo, setContratoAlvo] = useState<CnpjEntry | null>(null);
  const [contratoTipo, setContratoTipo] = useState('');
  const [contratoOutro, setContratoOutro] = useState('');
  const [contratoArquivo, setContratoArquivo] = useState<File | null>(null);
  const [enviandoContrato, setEnviandoContrato] = useState(false);
  const alvoAnexo = useRef<{ c: CnpjEntry; col: CertidaoCol } | null>(null);

  // ── Toast ──
  const [toasts, setToasts] = useState<{ id: number; text: string; type: 'ok' | 'err' }[]>([]);
  let toastIdRef = 0;
  const toast = (text: string, type: 'ok' | 'err' = 'ok') => {
    const id = ++toastIdRef;
    setToasts(p => [...p, { id, text, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  };

  const verAnexo = async (fileId: string) => {
    if (!(await abrirAnexo(fileId))) toast('Não foi possível abrir o arquivo.', 'err');
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
        lead?: { name?: string; cpf_cnpj?: string; ficha_contabil?: { cnpj?: string; razao_social?: string } };
      };
      const clientes: ClienteRaw[] = data?.data || data || [];

      const seen = new Set<string>();
      const lista: CnpjEntry[] = [];
      let semCnpj = 0;
      for (const c of clientes) {
        // Primeiro valor com 14 dígitos (o cpf_cnpj do cadastro pode estar vazio ou ser um CPF)
        const cnpj = [c.cpf_cnpj, c.lead?.ficha_contabil?.cnpj, c.lead?.cpf_cnpj]
          .map(v => limparCnpj(v || '')).find(v => v.length === 14) || '';
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
      const cc = await fetch(`${API_BASE_URL}/google-drive/contratos/config`, { headers: authHeaders() });
      if (cc.ok) setContratosCfg(await cc.json());
      const ca = await fetch(`${API_BASE_URL}/google-drive/contratos/arquivos`, { headers: authHeaders() });
      if (ca.ok) setContratos(await ca.json());
    } catch { /* offline */ }
  }, []);

  // ─── Contratos: abrir o diálogo já sugerindo o próximo tipo ───────────────
  const abrirContrato = (c: CnpjEntry) => {
    if (!contratosCfg?.configured) {
      toast(canConfigDrive ? 'Configure a pasta dos contratos em Configurações › Google Drive.' : 'Peça ao admin/contador para configurar a pasta dos contratos.', 'err');
      return;
    }
    const docs = contratos.filter(d => d.cnpj === c.cnpj);
    const alteracoes = docs.filter(d => /altera/i.test(d.titulo)).length;
    const temConstituicao = docs.some(d => /constitui/i.test(d.titulo));
    setContratoTipo(!temConstituicao && docs.length === 0
      ? 'Contrato de Constituição'
      : TIPOS_CONTRATO[Math.min(alteracoes + 1, TIPOS_CONTRATO.length - 2)]);
    setContratoOutro('');
    setContratoArquivo(null);
    setContratoAlvo(c);
  };

  const enviarContrato = async () => {
    if (!contratoAlvo || !contratoArquivo) return;
    const titulo = contratoTipo === 'Outro' ? contratoOutro.trim() : contratoTipo;
    if (!titulo) { toast('Informe o tipo do documento.', 'err'); return; }
    setEnviandoContrato(true);
    try {
      const form = new FormData();
      form.append('file', contratoArquivo);
      form.append('cnpj', contratoAlvo.cnpj);
      form.append('nome', contratoAlvo.nome);
      form.append('titulo', titulo);
      const res = await fetch(`${API_BASE_URL}/google-drive/contratos/upload`, {
        method: 'POST', headers: authHeaders(), body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data?.message || 'Falha ao anexar o contrato.', 'err'); return; }
      setContratos(p => [...p, data]);
      toast(`${titulo} anexado no Google Drive.`);
      setContratoAlvo(null);
    } catch { toast('Erro ao enviar o arquivo.', 'err'); }
    finally { setEnviandoContrato(false); }
  };

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
      setAnexadas(p => [data, ...p.filter(a => !(a.cnpj === data.cnpj && a.tipo === data.tipo))]);
      toast(data.atualizada ? `${col.titulo} atualizada no Google Drive.` : `${col.titulo} anexada no Google Drive.`);
    } catch { toast('Erro ao enviar o arquivo.', 'err'); }
    finally { setUploading(p => ({ ...p, [key]: false })); }
  };

  // ─── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    checkAgent();
    carregarCnpjs();
    loadDrive();
    const interval = setInterval(checkAgent, 30000);
    // Ao voltar para a aba, recarrega os anexos (reflete arquivos apagados/alterados direto no Drive)
    const onFocus = () => loadDrive();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, [checkAgent, carregarCnpjs, loadDrive]);

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
              <h1 className="text-2xl font-bold">Certidões e Contratos</h1>
            </div>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Certidões PJ (Federal, FGTS, Trabalhista, Falência, Estadual e Municipal) e contratos sociais
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
            <button onClick={() => { checkAgent(); carregarCnpjs(); loadDrive(); }}
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
                              <div className="inline-flex flex-col items-center gap-1">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    onClick={() => iniciarAnexo(c, col)}
                                    disabled={enviando}
                                    className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
                                    title={anexo ? `Substituir pela certidão nova — ${col.titulo}` : `Anexar ${col.titulo}`}
                                  >
                                    {enviando
                                      ? <><Loader2 size={12} className="animate-spin" /> Enviando…</>
                                      : anexo
                                        ? <><RefreshCw size={12} /> Atualizar</>
                                        : <><Upload size={12} /> Anexar</>
                                    }
                                  </button>
                                  {anexo && (
                                    <button
                                      onClick={() => verAnexo(anexo.id)}
                                      className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                                      title="Abrir a certidão anexada"
                                    >
                                      <ExternalLink size={12} /> Ver
                                    </button>
                                  )}
                                </div>
                                {anexo && (anexo.modifiedTime || anexo.createdTime) && (
                                  <span className="text-[10px] text-muted-foreground" title="Data em que foi anexada ou atualizada">
                                    {new Date((anexo.modifiedTime || anexo.createdTime)!).toLocaleDateString('pt-BR')}
                                  </span>
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

          {/* Contratos sociais e alterações contratuais */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
              <div>
                <span className="font-semibold">Contratos Sociais e Alterações</span>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  Cada anexo é guardado como um documento novo, sem substituir os anteriores
                  (constituição, 1ª alteração, 2ª alteração…).
                </p>
              </div>
              {contratosCfg?.configured && contratosCfg.folderUrl ? (
                <a
                  href={contratosCfg.folderUrl}
                  target="_blank" rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <ExternalLink size={12} /> Abrir pasta
                </a>
              ) : (
                <span className="shrink-0 text-[12px] text-amber-600">Pasta não configurada</span>
              )}
            </div>

            {!cnpjs.length ? (
              <div className="text-center py-10 text-muted-foreground text-[13px]">Nenhuma empresa cadastrada.</div>
            ) : (
              <div className="divide-y divide-border/50">
                {cnpjs.map(c => {
                  const docs = contratos
                    .filter(d => d.cnpj === c.cnpj)
                    .sort((x, y) => (x.createdTime || '').localeCompare(y.createdTime || ''));
                  return (
                    <div key={c.cnpj} className="px-5 py-3 flex items-start gap-4 hover:bg-muted/20 transition-colors">
                      <div className="w-[260px] shrink-0 min-w-0">
                        <div className="text-[13px] font-medium truncate">{c.nome || '—'}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{fmtCnpj(c.cnpj)}</div>
                      </div>
                      <div className="flex-1 min-w-0 flex flex-wrap gap-2">
                        {docs.length === 0 ? (
                          <span className="text-[12px] text-muted-foreground py-1.5">Nenhum documento anexado</span>
                        ) : docs.map(d => (
                          <div
                            key={d.id}
                            className="inline-flex items-center gap-2 text-[12px] pl-2.5 pr-1 py-1 rounded-lg border border-border text-muted-foreground"
                            title={d.name}
                          >
                            <span>{d.titulo}</span>
                            {d.createdTime && (
                              <span className="text-[10px] opacity-70">{new Date(d.createdTime).toLocaleDateString('pt-BR')}</span>
                            )}
                            <button
                              onClick={() => verAnexo(d.id)}
                              title={`${d.name} — abrir`}
                              className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-md border border-border hover:bg-accent hover:text-foreground transition-colors"
                            >
                              <ExternalLink size={11} /> Ver
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => abrirContrato(c)}
                        className="shrink-0 inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      >
                        <Upload size={12} /> Anexar
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Alvará de Funcionamento */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <span className="font-semibold">Alvará de Funcionamento</span>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                Um alvará por empresa. Ao atualizar, o arquivo novo substitui o anterior (o Drive guarda o histórico de versões).
              </p>
            </div>

            {!cnpjs.length ? (
              <div className="text-center py-10 text-muted-foreground text-[13px]">Nenhuma empresa cadastrada.</div>
            ) : (
              <div className="divide-y divide-border/50">
                {cnpjs.map(c => {
                  const key = statusKey(c.cnpj, ALVARA.tipo);
                  const enviando = !!uploading[key];
                  const anexo = ultimaAnexada.get(key);
                  return (
                    <div key={c.cnpj} className="px-5 py-3 flex items-center gap-4 hover:bg-muted/20 transition-colors">
                      <div className="w-[260px] shrink-0 min-w-0">
                        <div className="text-[13px] font-medium truncate">{c.nome || '—'}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{fmtCnpj(c.cnpj)}</div>
                      </div>
                      <div className="flex-1 min-w-0 text-[12px] text-muted-foreground">
                        {anexo
                          ? <>Anexado em {new Date((anexo.modifiedTime || anexo.createdTime)!).toLocaleDateString('pt-BR')}</>
                          : 'Nenhum alvará anexado'}
                      </div>
                      <div className="shrink-0 inline-flex items-center gap-1.5">
                        <button
                          onClick={() => iniciarAnexo(c, ALVARA)}
                          disabled={enviando}
                          className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
                          title={anexo ? 'Substituir pelo alvará novo' : 'Anexar alvará'}
                        >
                          {enviando
                            ? <><Loader2 size={12} className="animate-spin" /> Enviando…</>
                            : anexo
                              ? <><RefreshCw size={12} /> Atualizar</>
                              : <><Upload size={12} /> Anexar</>
                          }
                        </button>
                        {anexo && (
                          <button
                            onClick={() => verAnexo(anexo.id)}
                            className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            title="Abrir o alvará anexado"
                          >
                            <ExternalLink size={12} /> Ver
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={enviarArquivo} />

      {/* ── Diálogo: anexar contrato / alteração ── */}
      {contratoAlvo && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => !enviandoContrato && setContratoAlvo(null)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="font-semibold">Anexar contrato / alteração</h3>
              <p className="text-[12px] text-muted-foreground mt-0.5 truncate">{contratoAlvo.nome} · {fmtCnpj(contratoAlvo.cnpj)}</p>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-muted-foreground mb-1">Tipo do documento</label>
              <select
                value={contratoTipo}
                onChange={e => setContratoTipo(e.target.value)}
                className="w-full text-[13px] px-3 py-2 rounded-lg border border-border bg-background outline-none focus:border-primary"
              >
                {TIPOS_CONTRATO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {contratoTipo === 'Outro' && (
                <input
                  value={contratoOutro}
                  onChange={e => setContratoOutro(e.target.value)}
                  placeholder="Ex.: Distrato Social"
                  className="mt-2 w-full text-[13px] px-3 py-2 rounded-lg border border-border bg-background outline-none focus:border-primary"
                />
              )}
            </div>

            <div>
              <label className="block text-[12px] font-medium text-muted-foreground mb-1">Arquivo</label>
              <input
                type="file"
                accept="application/pdf,image/*,.doc,.docx"
                onChange={e => setContratoArquivo(e.target.files?.[0] ?? null)}
                className="w-full text-[12px] file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-border file:bg-background file:text-[12px] file:text-muted-foreground"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setContratoAlvo(null)}
                disabled={enviandoContrato}
                className="text-[12px] px-3 py-2 rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={enviarContrato}
                disabled={enviandoContrato || !contratoArquivo || (contratoTipo === 'Outro' && !contratoOutro.trim())}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
              >
                {enviandoContrato ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Enviar
              </button>
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
