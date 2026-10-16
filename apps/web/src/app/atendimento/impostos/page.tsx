'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Receipt, Building2, RefreshCw, CheckCircle2, XCircle, ExternalLink,
  Loader2, Upload, ChevronLeft, ChevronRight, Search, HardDrive,
} from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CnpjEntry { cnpj: string; nome: string; }

interface ImpostoCol { tipo: string; titulo: string; acumula?: boolean; }
interface ImpostoGrupo { id: string; titulo: string; cols: ImpostoCol[]; }

const GRUPOS: ImpostoGrupo[] = [
  {
    id: 'federal', titulo: 'Federais',
    cols: [
      { tipo: 'simples',        titulo: 'Simples Nacional' },
      { tipo: 'pis_cofins',     titulo: 'PIS e COFINS' },
      { tipo: 'irpj_csll',      titulo: 'IRPJ e CSLL' },
      { tipo: 'federal_outros', titulo: 'Outros', acumula: true },
    ],
  },
  {
    id: 'estadual', titulo: 'Estaduais',
    cols: [
      { tipo: 'icms_antecipado', titulo: 'ICMS Antecipado e FECOEP' },
      { tipo: 'icms_st',         titulo: 'ICMS Subst. Tributária e FECOEP' },
      { tipo: 'icms_normal',     titulo: 'ICMS Normal' },
      { tipo: 'estadual_outros', titulo: 'Outros', acumula: true },
    ],
  },
  {
    id: 'municipal', titulo: 'Municipal',
    cols: [{ tipo: 'iss', titulo: 'ISS' }],
  },
];

interface DriveConfig {
  driveReady: boolean; configured: boolean;
  folderName: string | null; folderUrl: string | null;
}

interface ImpostoDrive {
  id: string; name: string; webViewLink: string | null;
  createdTime: string | null; modifiedTime: string | null;
  cnpj: string; tipo: string; competencia: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function fmtCnpj(c: string) {
  return c.replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}
function limparCnpj(c: string) { return c.replace(/\D/g, ''); }
function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}
function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function moverCompetencia(c: string, delta: number) {
  const [a, m] = c.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function rotuloCompetencia(c: string) {
  const [a, m] = c.split('-').map(Number);
  return `${MESES[m - 1]} de ${a}`;
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function ImpostosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [busca, setBusca] = useState('');

  const [cnpjs, setCnpjs] = useState<CnpjEntry[]>([]);
  const [carregandoCnpjs, setCarregandoCnpjs] = useState(false);

  const [driveCfg, setDriveCfg] = useState<DriveConfig | null>(null);
  const [anexos, setAnexos] = useState<ImpostoDrive[]>([]);
  const [carregandoAnexos, setCarregandoAnexos] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const alvo = useRef<{ c: CnpjEntry; col: ImpostoCol } | null>(null);

  const [toasts, setToasts] = useState<{ id: number; text: string; type: 'ok' | 'err' }[]>([]);
  const toastSeq = useRef(0);
  const toast = (text: string, type: 'ok' | 'err' = 'ok') => {
    const id = ++toastSeq.current;
    setToasts(p => [...p, { id, text, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  };

  // ─── Auth ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!localStorage.getItem('token')) { router.push('/atendimento/login'); return; }
    setLoading(false);
  }, [router]);

  // ─── Empresas (fonte: Clientes Contábeis, apenas PJ com CNPJ) ───────────
  const carregarCnpjs = useCallback(async () => {
    setCarregandoCnpjs(true);
    try {
      const res = await fetch(`${API_BASE_URL}/clientes-contabil?limit=500`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      type ClienteRaw = {
        cpf_cnpj?: string;
        nome_empresa?: string;
        lead?: { name?: string; ficha_contabil?: { cnpj?: string; razao_social?: string } };
      };
      const clientes: ClienteRaw[] = data?.data || data || [];
      const seen = new Set<string>();
      const lista: CnpjEntry[] = [];
      for (const c of clientes) {
        const cnpj = limparCnpj(c.cpf_cnpj || c.lead?.ficha_contabil?.cnpj || '');
        if (cnpj.length !== 14 || seen.has(cnpj)) continue;
        seen.add(cnpj);
        lista.push({ cnpj, nome: c.nome_empresa || c.lead?.ficha_contabil?.razao_social || c.lead?.name || cnpj });
      }
      lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      setCnpjs(lista);
    } catch { /* offline */ }
    finally { setCarregandoCnpjs(false); }
  }, []);

  // ─── Drive: config + anexos da competência ──────────────────────────────
  const carregarAnexos = useCallback(async (comp: string) => {
    setCarregandoAnexos(true);
    try {
      const cfg = await fetch(`${API_BASE_URL}/google-drive/impostos/config`, { headers: authHeaders() });
      if (cfg.ok) setDriveCfg(await cfg.json());
      const res = await fetch(`${API_BASE_URL}/google-drive/impostos/arquivos?competencia=${comp}`, { headers: authHeaders() });
      setAnexos(res.ok ? await res.json() : []);
    } catch { /* offline */ }
    finally { setCarregandoAnexos(false); }
  }, []);

  useEffect(() => { carregarCnpjs(); }, [carregarCnpjs]);

  useEffect(() => {
    carregarAnexos(competencia);
    const onFocus = () => carregarAnexos(competencia);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [competencia, carregarAnexos]);

  // Anexos agrupados por empresa|tipo (já vêm do mais recente para o mais antigo)
  const porCelula = useMemo(() => {
    const m = new Map<string, ImpostoDrive[]>();
    for (const a of anexos) {
      if (a.competencia !== competencia) continue;
      const k = `${a.cnpj}|${a.tipo}`;
      m.set(k, [...(m.get(k) || []), a]);
    }
    return m;
  }, [anexos, competencia]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const digitos = q.replace(/\D/g, '');
    if (!q) return cnpjs;
    return cnpjs.filter(c => c.nome.toLowerCase().includes(q) || (digitos && c.cnpj.includes(digitos)));
  }, [cnpjs, busca]);

  // ─── Anexar ─────────────────────────────────────────────────────────────
  const iniciarAnexo = (c: CnpjEntry, col: ImpostoCol) => {
    if (!driveCfg?.configured) {
      toast('Configure a pasta de impostos em Configurações › Google Drive.', 'err');
      return;
    }
    alvo.current = { c, col };
    fileInputRef.current?.click();
  };

  const enviarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const a = alvo.current;
    if (!file || !a) return;
    const key = `${a.c.cnpj}|${a.col.tipo}`;
    setUploading(p => ({ ...p, [key]: true }));
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('cnpj', a.c.cnpj);
      form.append('nome', a.c.nome);
      form.append('tipo', a.col.tipo);
      form.append('titulo', a.col.titulo);
      form.append('competencia', competencia);
      const res = await fetch(`${API_BASE_URL}/google-drive/impostos/upload`, {
        method: 'POST', headers: authHeaders(), body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data?.message || 'Falha ao anexar.', 'err'); return; }
      setAnexos(p => [data, ...p.filter(x => x.id !== data.id)]);
      toast(data.atualizada ? `${a.col.titulo} atualizado.` : `${a.col.titulo} anexado.`);
    } catch { toast('Erro ao enviar o arquivo.', 'err'); }
    finally { setUploading(p => ({ ...p, [key]: false })); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 size={28} className="animate-spin text-muted-foreground" />
    </div>
  );

  const ehAtual = competencia === competenciaAtual();

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">

      {/* ── Header ── */}
      <div className="shrink-0 border-b border-border bg-card px-6 pt-5 pb-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Receipt size={22} className="text-primary" />
              <h1 className="text-2xl font-bold">Impostos</h1>
            </div>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Guias mensais — federais, estaduais e municipal — anexadas por empresa e competência
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCompetencia(c => moverCompetencia(c, -1))}
              className="p-2 rounded-lg border border-border hover:bg-accent text-muted-foreground"
              aria-label="Mês anterior"
            ><ChevronLeft size={16} /></button>
            <span className="min-w-[150px] text-center text-sm font-semibold">{rotuloCompetencia(competencia)}</span>
            <button
              onClick={() => setCompetencia(c => moverCompetencia(c, 1))}
              className="p-2 rounded-lg border border-border hover:bg-accent text-muted-foreground"
              aria-label="Próximo mês"
            ><ChevronRight size={16} /></button>
            {!ehAtual && (
              <button
                onClick={() => setCompetencia(competenciaAtual())}
                className="text-[12px] px-3 py-2 rounded-lg border border-border hover:bg-accent text-muted-foreground"
              >Mês atual</button>
            )}
            <button
              onClick={() => { carregarCnpjs(); carregarAnexos(competencia); }}
              className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Atualizar"
            ><RefreshCw size={16} className={carregandoAnexos ? 'animate-spin' : ''} /></button>
          </div>
        </div>
      </div>

      {/* ── Conteúdo ── */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1500px] mx-auto space-y-4">

          {/* Pasta do Drive */}
          <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3">
            <HardDrive size={18} className="text-primary shrink-0" />
            <p className="flex-1 text-[12px] text-muted-foreground">
              {!driveCfg ? 'Carregando…'
                : driveCfg.configured ? (
                  <>Os arquivos são salvos em{' '}
                    <a href={driveCfg.folderUrl || '#'} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
                      {driveCfg.folderName || 'pasta configurada'}
                    </a>
                    , em uma subpasta por empresa e por competência.</>
                ) : (
                  <span className="text-amber-600">Pasta de impostos não configurada — o admin define em Configurações › Google Drive.</span>
                )}
            </p>
          </div>

          {/* Busca */}
          <div className="relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar empresa ou CNPJ…"
              className="w-full text-[13px] bg-card border border-border rounded-lg pl-9 pr-3 py-2 outline-none focus:border-primary"
            />
          </div>

          {/* Tabela */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border font-semibold flex items-center justify-between">
              <span>Empresas {lista.length ? `(${lista.length})` : ''}</span>
              {carregandoCnpjs && (
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-normal">
                  <Loader2 size={12} className="animate-spin" /> Sincronizando…
                </span>
              )}
            </div>

            {!lista.length ? (
              <div className="text-center py-14 text-muted-foreground text-[13px]">
                <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                <p>Nenhuma empresa encontrada.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th rowSpan={2} className="text-left px-5 py-3 font-semibold text-muted-foreground sticky left-0 bg-muted/30 z-10 min-w-[260px]">
                        Empresa / CNPJ
                      </th>
                      {GRUPOS.map(g => (
                        <th key={g.id} colSpan={g.cols.length}
                          className="text-center px-3 py-2 text-[11px] uppercase tracking-wider font-bold text-primary border-l border-border">
                          {g.titulo}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-border bg-muted/30">
                      {GRUPOS.flatMap(g => g.cols.map((col, i) => (
                        <th key={col.tipo}
                          className={`text-center px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap text-[12px] ${i === 0 ? 'border-l border-border' : ''}`}>
                          {col.titulo}
                        </th>
                      )))}
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map(c => (
                      <tr key={c.cnpj} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3 sticky left-0 bg-card z-10 min-w-[260px]">
                          <div className="text-[13px] font-medium truncate">{c.nome}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">{fmtCnpj(c.cnpj)}</div>
                        </td>
                        {GRUPOS.flatMap(g => g.cols.map((col, i) => {
                          const key = `${c.cnpj}|${col.tipo}`;
                          const arquivos = porCelula.get(key) || [];
                          const ultimo = arquivos[0];
                          const enviando = !!uploading[key];
                          return (
                            <td key={col.tipo} className={`px-3 py-3 text-center ${i === 0 ? 'border-l border-border/60' : ''}`}>
                              <div className="inline-flex flex-col items-center gap-1">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    onClick={() => iniciarAnexo(c, col)}
                                    disabled={enviando}
                                    className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
                                    title={ultimo && !col.acumula ? `Substituir — ${col.titulo}` : `Anexar ${col.titulo}`}
                                  >
                                    {enviando
                                      ? <><Loader2 size={12} className="animate-spin" /> Enviando…</>
                                      : ultimo && !col.acumula
                                        ? <><RefreshCw size={12} /> Atualizar</>
                                        : <><Upload size={12} /> Anexar</>
                                    }
                                  </button>
                                  {ultimo?.webViewLink && !col.acumula && (
                                    <a
                                      href={ultimo.webViewLink}
                                      target="_blank" rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                                      title="Abrir no Drive"
                                    >
                                      <ExternalLink size={12} /> Ver
                                    </a>
                                  )}
                                </div>

                                {/* "Outros": vários arquivos no mês, cada um com seu link */}
                                {col.acumula && arquivos.length > 0 && (
                                  <div className="flex flex-wrap justify-center gap-1 max-w-[190px]">
                                    {arquivos.map((a, n) => (
                                      <a
                                        key={a.id}
                                        href={a.webViewLink || '#'}
                                        target="_blank" rel="noopener noreferrer"
                                        title={`${a.name} — abrir no Drive`}
                                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                                      >
                                        <ExternalLink size={10} /> {arquivos.length - n}
                                      </a>
                                    ))}
                                  </div>
                                )}

                                {ultimo && (ultimo.modifiedTime || ultimo.createdTime) && (
                                  <span className="text-[10px] text-muted-foreground" title="Data em que foi anexado ou atualizado">
                                    {new Date((ultimo.modifiedTime || ultimo.createdTime)!).toLocaleDateString('pt-BR')}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        }))}
                      </tr>
                    ))}
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
          <div key={t.id} className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-[13px] font-medium text-white ${t.type === 'ok' ? 'bg-emerald-600' : 'bg-red-600'}`}>
            {t.type === 'ok' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
