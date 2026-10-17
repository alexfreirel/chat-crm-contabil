'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LineChart as LineIcon, Upload, Loader2, Trash2, Plus, Printer, AlertTriangle, CheckCircle2, Info, XCircle, ArrowLeft, Cloud, CloudOff } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell, CartesianGrid } from 'recharts';
import {
  ANEXOS, SUBLIMITE, TETO, TRIBS, MESES_ABREV, Anexo, Cliente, Nivel,
  brl, brlK, pct, numFmt, parseBR, lbl, paLbl, addM, sum, efetiva,
  parsePGDAS, pdfText, novoCliente, mesclar, analyze, alerts,
} from '@/lib/pgdas';
import { carregarEmpresas, buscarAnalise, salvarAnalise, apagarAnalise, fmtCnpj, limparCnpj } from '@/lib/analiseClientes';

// Os PDFs são lidos no navegador; só os valores extraídos são salvos no servidor (um registro por CNPJ).
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type LogItem = { id: number; text: string; type: 'ok' | 'warn' | 'err' };

const NIVEL: Record<Nivel, { label: string; cls: string; icon: React.ReactNode }> = {
  bad:  { label: 'Crítico',      cls: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30',             icon: <XCircle size={16} /> },
  warn: { label: 'Atenção',      cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',     icon: <AlertTriangle size={16} /> },
  ok:   { label: 'Ok',           cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', icon: <CheckCircle2 size={16} /> },
  info: { label: 'Oportunidade', cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',             icon: <Info size={16} /> },
};

function Kpi({ l, v, s }: { l: string; v: string; s?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 min-w-0">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{l}</div>
      <div className="text-xl font-bold mt-1 tabular-nums truncate">{v}</div>
      {s && <div className="text-xs text-muted-foreground mt-1">{s}</div>}
    </div>
  );
}

function Secao({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 break-inside-avoid">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
        <h3 className="text-base font-semibold">{titulo}</h3>
        {sub && <small className="text-xs text-muted-foreground">{sub}</small>}
      </div>
      {children}
    </section>
  );
}

function Variacao({ v, txt }: { v: number | null; txt: string }) {
  if (v == null) return null;
  return <><span className={v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{v >= 0 ? '+' : ''}{pct(v, 1)}</span> {txt}</>;
}

export default function AnaliseEmpresaPage() {
  const router = useRouter();
  const params = useParams<{ cnpj: string }>();
  const cnpj = limparCnpj(String(params?.cnpj || ''));
  const [S, setS] = useState<Cliente>(novoCliente);
  const [obs, setObs] = useState('');
  const [log, setLog] = useState<LogItem[]>([]);
  const [lendo, setLendo] = useState(false);
  const [novoMes, setNovoMes] = useState('');
  const [over, setOver] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const logSeq = useRef(0);
  // Só salva depois que a análise do servidor foi carregada e o usuário mexeu em algo
  const sujo = useRef(false);

  // ─── Carrega a empresa e a análise salva ────────────────────────────────
  useEffect(() => {
    if (!localStorage.getItem('token')) { router.push('/atendimento/login'); return; }
    let vivo = true;
    (async () => {
      try {
        const [salva, emp] = await Promise.all([
          buscarAnalise(cnpj),
          carregarEmpresas().catch(() => null),
        ]);
        if (!vivo) return;
        const empresa = emp?.empresas.find(e => e.cnpj === cnpj);
        const base = salva?.dados || novoCliente();
        if (!base.cnpj) base.cnpj = fmtCnpj(cnpj);
        if (!base.nome && empresa) base.nome = empresa.nome;
        setS(base);
        setObs(salva?.obs || '');
        setSalvoEm(salva?.updated_at || null);
      } catch {
        if (vivo) setErroCarga('Não foi possível carregar a análise desta empresa.');
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [router, cnpj]);

  // ─── Salva no servidor (com atraso, para agrupar edições) ───────────────
  useEffect(() => {
    if (carregando || erroCarga || !sujo.current) return;
    setSaveState('saving');
    const t = setTimeout(async () => {
      try {
        const em = await salvarAnalise(cnpj, S, obs);
        setSalvoEm(em || new Date().toISOString());
        setSaveState('saved');
      } catch { setSaveState('error'); }
    }, 800);
    return () => clearTimeout(t);
  }, [S, obs, cnpj, carregando, erroCarga]);

  // Toda alteração do usuário passa por aqui para marcar a análise como alterada
  const alterar = (fn: (prev: Cliente) => Cliente) => { sujo.current = true; setS(fn); };
  const alterarObs = (v: string) => { sujo.current = true; setObs(v); };

  const addLog = (text: string, type: LogItem['type']) =>
    setLog(p => [{ id: ++logSeq.current, text, type }, ...p].slice(0, 30));

  const a = useMemo(() => analyze(S), [S]);
  const alertas = useMemo(() => (a ? alerts(S, a) : []), [S, a]);

  // ─── Leitura dos PDFs ───────────────────────────────────────────────────
  const lerArquivos = async (files: File[]) => {
    if (!files.length) return;
    setLendo(true);
    // Trabalha numa cópia para mesclar vários PDFs em sequência
    let atual: Cliente = JSON.parse(JSON.stringify(S));
    for (const f of files) {
      if (!/\.pdf$/i.test(f.name)) { addLog(`${f.name}: não é PDF.`, 'err'); continue; }
      try {
        const txt = await pdfText(f);
        if (txt.replace(/\s/g, '').length < 50) { addLog(`${f.name}: PDF sem texto (imagem escaneada). Use o PDF gerado pelo portal do Simples.`, 'err'); continue; }
        const r = parsePGDAS(txt);
        if (!r.pa && !Object.keys(r.hist).length) { addLog(`${f.name}: não reconheci um extrato do PGDAS-D neste arquivo.`, 'err'); continue; }
        // Mesma raiz de CNPJ (8 dígitos): aceita matriz e filiais
        if (r.cnpj && limparCnpj(r.cnpj).slice(0, 8) !== cnpj.slice(0, 8)) {
          addLog(`${f.name}: é de outro CNPJ (${r.cnpj}). Abra a análise dessa empresa na lista.`, 'warn'); continue;
        }
        atual = mesclar(atual, r);
        const parts: string[] = [];
        if (r.pa) parts.push('PA ' + paLbl(r.pa));
        if (r.rpa != null) parts.push('receita ' + brl(r.rpa));
        if (r.das != null) parts.push('DAS ' + brl(r.das));
        const nh = Object.keys(r.hist).length;
        if (nh) parts.push(nh + ' meses anteriores');
        addLog(`${f.name}: ${parts.join(' · ') || 'lido'}`, r.rpa != null && r.das != null ? 'ok' : 'warn');
        if (r.pa && (r.rpa == null || r.das == null)) addLog(`Confira a receita e o DAS de ${paLbl(r.pa)} na tabela.`, 'warn');
      } catch (err) {
        addLog(`${f.name}: erro ao ler o PDF (${(err as Error)?.message || err}).`, 'err');
      }
    }
    alterar(() => atual);
    setLendo(false);
  };

  // ─── Edição ─────────────────────────────────────────────────────────────
  const editarMes = (k: string, campo: 'rec' | 'das' | 'folha', valor: string) => {
    alterar(prev => {
      const n: Cliente = { ...prev, months: { ...prev.months, [k]: { ...prev.months[k], [campo]: parseBR(valor) } } };
      if (campo === 'das') n.months[k].trib = null;
      if (campo === 'rec') { n.rbt12P = { ...prev.rbt12P }; delete n.rbt12P[k]; }
      return n;
    });
  };
  const removerMes = (k: string) => alterar(prev => { const m = { ...prev.months }; delete m[k]; return { ...prev, months: m }; });
  const adicionarMes = () => {
    if (!novoMes) return;
    alterar(prev => prev.months[novoMes] ? prev : { ...prev, months: { ...prev.months, [novoMes]: { rec: null, das: null, folha: null, trib: null } } });
  };
  const limpar = async () => {
    setConfirmar(false);
    sujo.current = false;
    await apagarAnalise(cnpj).catch(() => {});
    const n = novoCliente();
    n.cnpj = fmtCnpj(cnpj);
    n.nome = S.nome;
    setS(n); setObs(''); setLog([]); setSalvoEm(null); setSaveState('idle');
  };

  const mesesTabela = Object.keys(S.months).sort().reverse();
  const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40';

  if (carregando) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 size={28} className="animate-spin text-muted-foreground" />
    </div>
  );
  if (erroCarga) return (
    <div className="flex flex-col items-center justify-center h-screen gap-3 text-sm text-muted-foreground">
      <p>{erroCarga}</p>
      <button type="button" onClick={() => router.push('/atendimento/analise-clientes')} className="text-primary font-semibold hover:underline">Voltar para a lista</button>
    </div>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background print-full">
      <style>{`@media print {
        aside, nav, .no-print { display: none !important; }
        .print-full { overflow: visible !important; height: auto !important; }
      }`}</style>

      {/* Cabeçalho */}
      <div className="shrink-0 border-b border-border bg-card px-6 pt-5 pb-4 no-print">
        <button type="button" onClick={() => router.push('/atendimento/analise-clientes')}
          className="mb-2 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground">
          <ArrowLeft size={13} /> Análise de Clientes
        </button>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <LineIcon size={22} className="text-primary shrink-0" />
              <h1 className="text-2xl font-bold truncate">{S.nome || fmtCnpj(cnpj)}</h1>
            </div>
            <p className="text-[13px] text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
              <span className="font-mono">{fmtCnpj(cnpj)}</span>
              <span className="inline-flex items-center gap-1">
                {saveState === 'saving' ? <><Loader2 size={12} className="animate-spin" /> Salvando…</>
                  : saveState === 'error' ? <span className="inline-flex items-center gap-1 text-red-500"><CloudOff size={12} /> Não foi possível salvar</span>
                  : salvoEm ? <><Cloud size={12} /> Salvo em {new Date(salvoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</>
                  : 'Nenhuma análise salva ainda'}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => window.print()} disabled={!a}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              <Printer size={16} /> Imprimir / PDF
            </button>
            <button type="button" onClick={() => setConfirmar(true)} disabled={!Object.keys(S.months).length && !obs}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
              Limpar análise
            </button>
          </div>
        </div>
        {confirmar && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm">
            Apagar todos os dados da análise desta empresa?
            <button type="button" onClick={limpar} className="rounded-md bg-red-600 px-3 py-1 text-white font-medium">Apagar</button>
            <button type="button" onClick={() => setConfirmar(false)} className="rounded-md border border-border px-3 py-1">Cancelar</button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto print-full">
        <div className="grid gap-6 p-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          {/* ─── Painel de dados ─── */}
          <aside className="flex flex-col gap-4 no-print">
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold mb-3">1. Extratos do PGDAS-D</h2>
              <label
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
                onDragOver={e => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={e => { e.preventDefault(); setOver(false); lerArquivos([...e.dataTransfer.files]); }}
                className={`flex flex-col items-center gap-1 rounded-lg border-2 border-dashed p-5 text-center cursor-pointer transition ${over ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60'}`}
              >
                {lendo ? <Loader2 size={22} className="animate-spin text-primary" /> : <Upload size={22} className="text-primary" />}
                <strong className="text-sm">{lendo ? 'Lendo PDFs…' : 'Selecionar PDFs do PGDAS'}</strong>
                <span className="text-xs text-muted-foreground">Arraste ou clique. Um ou mais meses do mesmo CNPJ (extrato ou declaração).</span>
                <input ref={fileRef} type="file" accept="application/pdf,.pdf" multiple hidden
                  onChange={e => { lerArquivos([...(e.target.files || [])]); e.target.value = ''; }} />
              </label>
              {log.length > 0 && (
                <div className="mt-3 max-h-40 overflow-y-auto flex flex-col gap-1 text-xs">
                  {log.map(l => (
                    <div key={l.id} className={l.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : l.type === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}>{l.text}</div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
              <h2 className="text-sm font-semibold">2. Identificação</h2>
              <label className="text-xs text-muted-foreground">Cliente
                <input className={inputCls} value={S.nome} onChange={e => alterar(p => ({ ...p, nome: e.target.value }))} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-muted-foreground">CNPJ
                  <input className={`${inputCls} opacity-70`} value={fmtCnpj(cnpj)} readOnly />
                </label>
                <label className="text-xs text-muted-foreground">Anexo principal
                  <select className={inputCls} value={S.anexo} onChange={e => alterar(p => ({ ...p, anexo: e.target.value as Anexo }))}>
                    {(Object.keys(ANEXOS) as Anexo[]).map(k => <option key={k} value={k}>{k} · {ANEXOS[k].nome}</option>)}
                  </select>
                </label>
              </div>
              {S.anexosFound.length > 1 && (
                <p className="text-xs text-muted-foreground">Atividades nos anexos {S.anexosFound.join(', ')}. A tabela de faixas usa o anexo principal.</p>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold">3. Conferir valores</h2>
              <p className="text-xs text-muted-foreground mb-3">Valores lidos dos PDFs. Corrija ou complete à mão quando precisar.</p>
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr><th className="text-left pb-1">Mês</th><th className="text-right pb-1">Faturamento</th><th className="text-right pb-1">DAS</th><th className="text-right pb-1">Folha</th><th /></tr>
                  </thead>
                  <tbody>
                    {mesesTabela.length === 0 && <tr><td colSpan={5} className="py-3 text-muted-foreground">Nenhum mês ainda.</td></tr>}
                    {mesesTabela.map(k => (
                      <tr key={k} className="border-t border-border">
                        <td className="py-1 pr-1 tabular-nums">{paLbl(k)}</td>
                        {(['rec', 'das', 'folha'] as const).map(c => (
                          <td key={c} className="py-1 px-0.5">
                            <input
                              key={`${k}-${c}-${S.months[k][c]}`}
                              defaultValue={numFmt(S.months[k][c])}
                              onBlur={e => { if (e.target.value !== numFmt(S.months[k][c])) editarMes(k, c, e.target.value); }}
                              inputMode="decimal" aria-label={`${c} ${paLbl(k)}`}
                              className="w-full rounded border border-border bg-background px-1.5 py-1 text-right tabular-nums outline-none focus:ring-1 focus:ring-primary/40"
                            />
                          </td>
                        ))}
                        <td><button type="button" onClick={() => removerMes(k)} aria-label={`Remover ${paLbl(k)}`} className="p-1 text-muted-foreground hover:text-red-500"><Trash2 size={13} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex gap-2">
                <input type="month" value={novoMes} onChange={e => setNovoMes(e.target.value)} className={inputCls} aria-label="Mês para adicionar" />
                <button type="button" onClick={adicionarMes} className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-3 text-sm hover:bg-muted"><Plus size={14} /> Mês</button>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold mb-2">4. Observações do contador</h2>
              <textarea value={obs} onChange={e => alterarObs(e.target.value)} rows={4} placeholder="Recomendações e próximos passos para o cliente" className={inputCls} />
            </div>
          </aside>

          {/* ─── Relatório ─── */}
          <main className="flex flex-col gap-4 min-w-0">
            {!a ? (
              <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
                <h3 className="text-lg font-semibold">Nenhum dado ainda</h3>
                <p className="text-sm text-muted-foreground mt-1">Envie os PDFs do PGDAS-D do cliente ou adicione os meses na tabela ao lado.</p>
              </div>
            ) : <Relatorio S={S} a={a} alertas={alertas} obs={obs} />}
          </main>
        </div>
      </div>
    </div>
  );
}

function Relatorio({ S, a, alertas, obs }: { S: Cliente; a: NonNullable<ReturnType<typeof analyze>>; alertas: [Nivel, string, string][]; obs: string }) {
  const f = ANEXOS[S.anexo].f;
  const varM = a.prevM ? a.rec / a.prevM - 1 : null;
  const varY = a.prevY ? a.rec / a.prevY - 1 : null;
  const sc = (v: number) => Math.min(100, v / TETO * 100);
  const sub = a.mesesAte(SUBLIMITE), teto = a.mesesAte(TETO), restante = 12 - a.mo;
  const serie = a.serie.map(k => ({ k, label: lbl(k), v: S.months[k].rec || 0 }));
  const tribTot = a.trib ? sum(Object.values(a.trib)) : 0;
  const tribMax = a.trib ? Math.max(...Object.values(a.trib)) : 0;

  return (
    <>
      <header className="rounded-xl border border-border bg-card p-5 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Relatório de análise fiscal</div>
          <h2 className="text-2xl font-bold truncate">{S.nome || 'Cliente'}</h2>
          <div className="flex gap-x-4 gap-y-1 flex-wrap text-sm text-muted-foreground mt-1">
            <span>CNPJ <span className="tabular-nums">{S.cnpj || '—'}</span></span>
            <span>Simples Nacional · Anexo {S.anexo} ({ANEXOS[S.anexo].nome})</span>
            <span>Emitido em {new Date().toLocaleDateString('pt-BR')}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Período de apuração</div>
          <div className="text-2xl font-bold tabular-nums">{paLbl(a.pa)}</div>
        </div>
      </header>

      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        <Kpi l="Faturamento do mês" v={brl(a.rec)} s={<Variacao v={varM} txt="vs. mês anterior" />} />
        <Kpi l="DAS do mês" v={brl(a.das)} s={a.das == null ? 'não informado' : 'vencimento dia 20'} />
        <Kpi l="Alíquota efetiva" v={pct(a.aliqReal ?? a.aliqCalc)} s={a.aliqReal == null ? 'calculada pela tabela' : 'tabela: ' + pct(a.aliqCalc)} />
        <Kpi l="RBT12" v={brlK(a.rbt12)} s={`faixa ${a.fi + 1} de 6${a.rbt12Parcial ? ' · parcial' : ''}`} />
      </div>

      <Secao titulo="Alertas e oportunidades">
        <div className="flex flex-col gap-2">
          {alertas.map(([n, t, d], i) => (
            <div key={i} className={`flex gap-3 rounded-lg border p-3 ${NIVEL[n].cls}`}>
              <div className="pt-0.5">{NIVEL[n].icon}</div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{t} <span className="ml-1 text-[10px] uppercase tracking-wide opacity-80">{NIVEL[n].label}</span></div>
                <p className="text-sm text-foreground/80">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </Secao>

      <Secao titulo="Faturamento mensal" sub={`últimos ${serie.length} meses`}>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serie} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeOpacity={0.15} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={60}
                tickFormatter={v => v >= 1e6 ? (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi' : Math.round(v / 1e3) + ' mil'} />
              <Tooltip formatter={v => brl(Number(v))} labelStyle={{ color: '#111' }} cursor={{ fillOpacity: 0.08 }} />
              <ReferenceLine y={a.media12} stroke="#f59e0b" strokeDasharray="4 4" />
              <Bar dataKey="v" name="Faturamento" radius={[3, 3, 0, 0]}>
                {serie.map(s => <Cell key={s.k} fill={s.k === a.pa ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-primary) 40%, transparent)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Linha tracejada: média mensal dos últimos 12 meses ({brl(a.media12)}).</p>
        <p className="text-sm mt-2">
          {varY != null && <>Em relação a {lbl(addM(a.pa, -12))}, o faturamento variou <Variacao v={varY} txt="" />. </>}
          Nos últimos 12 meses, incluindo {paLbl(a.pa)}, a empresa faturou <b className="tabular-nums">{brl(a.rec12)}</b>.
        </p>
      </Secao>

      <Secao titulo={`Limites do Simples Nacional em ${a.y}`} sub="receita acumulada no ano e projeção">
        <div className="relative h-4 rounded-full bg-muted overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-primary/30" style={{ width: `${sc(a.projAno)}%` }} />
          <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${sc(a.rba)}%` }} />
          <div className="absolute inset-y-0 w-0.5 bg-amber-500" style={{ left: `${sc(SUBLIMITE)}%` }} />
        </div>
        <div className="relative h-5 text-[11px] text-muted-foreground mt-1">
          <span className="absolute left-0">R$ 0</span>
          <span className="absolute -translate-x-1/2" style={{ left: `${sc(SUBLIMITE)}%` }}>sublimite 3,6 mi</span>
          <span className="absolute right-0">teto 4,8 mi</span>
        </div>
        <div className="flex gap-4 flex-wrap text-xs text-muted-foreground mt-2">
          <span><i className="inline-block w-3 h-3 rounded-sm bg-primary align-middle mr-1" />acumulado jan–{MESES_ABREV[a.mo - 1]}: {brl(a.rba)}{a.rbaEst ? ' (pelo PGDAS)' : ''}</span>
          <span><i className="inline-block w-3 h-3 rounded-sm bg-primary/30 align-middle mr-1" />projeção até dezembro: {brl(a.projAno)}</span>
        </div>
        <p className="text-sm mt-3">
          A projeção considera a média dos últimos 3 meses ({brl(a.ritmo)} por mês) para os {restante} meses restantes do ano.{' '}
          {sub === 0 ? 'O sublimite de R$ 3,6 milhões já foi ultrapassado no ano.' : sub <= restante ? `Nesse ritmo, o sublimite seria atingido em cerca de ${sub} ${sub === 1 ? 'mês' : 'meses'}.` : 'Nesse ritmo, o sublimite não é atingido neste ano.'}
          {teto > 0 && teto <= restante ? ` O teto de R$ 4,8 milhões seria atingido em cerca de ${teto} meses.` : ''}
        </p>
      </Secao>

      <Secao titulo="Faixa de tributação" sub={`Anexo ${S.anexo} · RBT12 de ${brl(a.rbt12)}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr className="text-left"><th className="py-1">Faixa</th><th>RBT12 de</th><th>até</th><th>Alíq. nominal</th><th>Parcela a deduzir</th></tr></thead>
            <tbody className="tabular-nums">
              {f.map((r, i) => (
                <tr key={i} className={`border-t border-border ${i === a.fi ? 'bg-primary/10 font-semibold' : ''}`}>
                  <td className="py-1.5">{i + 1}ª{i === a.fi ? ' · atual' : ''}</td>
                  <td>{i ? brl(f[i - 1][0] + 0.01) : 'R$ 0,00'}</td>
                  <td>{brl(r[0])}</td><td>{pct(r[1])}</td><td>{brl(r[2])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm mt-3">
          Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12 = <b className="tabular-nums">{pct(a.aliqCalc)}</b>.{' '}
          {a.fi < 5 ? <>Faltam <b className="tabular-nums">{brl(f[a.fi][0] - a.rbt12)}</b> de receita em 12 meses para a {a.fi + 2}ª faixa.</> : 'A empresa está na última faixa do Simples.'}
        </p>
      </Secao>

      {(a.trib || a.dasKs.length > 0) && (
        <Secao titulo="Impostos pagos" sub={a.cargaAcum != null ? `carga média no período: ${pct(a.cargaAcum)} do faturamento` : undefined}>
          <div className="grid gap-6 md:grid-cols-2">
            {a.trib && (
              <div>
                <div className="text-xs text-muted-foreground mb-2">Composição do DAS de {paLbl(a.pa)}</div>
                <div className="flex flex-col gap-1.5">
                  {TRIBS.filter(t => (a.trib![t] || 0) > 0).map(t => (
                    <div key={t} className="grid grid-cols-[80px_1fr_auto_40px] items-center gap-2 text-xs tabular-nums">
                      <b className="font-medium">{t}</b>
                      <div className="h-2 rounded bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${a.trib![t] / tribMax * 100}%` }} /></div>
                      <span>{brl(a.trib![t])}</span>
                      <span className="text-right text-muted-foreground">{pct(a.trib![t] / tribTot, 0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {a.dasKs.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-2">DAS por período</div>
                <table className="w-full text-xs tabular-nums">
                  <thead className="text-muted-foreground"><tr className="text-left"><th className="py-1">PA</th><th>Faturamento</th><th>DAS</th><th>Alíquota</th></tr></thead>
                  <tbody>
                    {a.dasKs.slice(-6).map(k => {
                      const o = S.months[k];
                      return (
                        <tr key={k} className={`border-t border-border ${k === a.pa ? 'bg-primary/10 font-semibold' : ''}`}>
                          <td className="py-1">{paLbl(k)}</td><td>{brl(o.rec)}</td><td>{brl(o.das)}</td><td>{pct((o.das || 0) / (o.rec || 1))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Secao>
      )}

      {(S.anexo === 'III' || S.anexo === 'V') && a.fatorR != null && (() => {
        const e3 = efetiva('III', a.rbt12), e5 = efetiva('V', a.rbt12);
        const econ = (e5 - e3) * a.rec;
        const need = Math.max(0, 0.28 * a.rbt12 - a.folha12);
        return (
          <Secao titulo="Fator R" sub="folha de 12 meses ÷ RBT12">
            <div className="grid gap-3 grid-cols-3">
              <Kpi l="Fator R" v={pct(a.fatorR, 1)} s={a.fatorR >= 0.28 ? 'Anexo III' : 'Anexo V'} />
              <Kpi l="Alíquota Anexo III" v={pct(e3)} s="com Fator R ≥ 28%" />
              <Kpi l="Alíquota Anexo V" v={pct(e5)} s="com Fator R < 28%" />
            </div>
            <p className="text-sm mt-3">
              {a.fatorR >= 0.28
                ? <>A folha mantém a atividade no Anexo III, economia de cerca de <b>{brl(econ)}</b> neste mês em relação ao Anexo V.</>
                : <>Para chegar a 28%, a folha dos últimos 12 meses precisaria de mais <b>{brl(need)}</b>. A diferença de alíquota representaria cerca de <b>{brl(econ)}</b> neste mês.</>}
            </p>
          </Secao>
        );
      })()}

      {obs.trim() && (
        <Secao titulo="Observações do contador">
          <p className="text-sm whitespace-pre-wrap">{obs}</p>
        </Secao>
      )}

      <footer className="flex justify-between gap-4 flex-wrap text-xs text-muted-foreground px-1">
        <span>Fonte: extratos do PGDAS-D. Tabelas da LC 123/2006 vigentes.</span>
        <span>Análise gerencial. Não substitui a declaração oficial.</span>
      </footer>
    </>
  );
}
