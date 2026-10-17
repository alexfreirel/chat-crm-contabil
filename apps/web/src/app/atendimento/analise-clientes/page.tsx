'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LineChart as LineIcon, Building2, RefreshCw, Loader2, Users, ArrowRight, Search, ChevronRight } from 'lucide-react';
import { brlK, pct, paLbl } from '@/lib/pgdas';
import { carregarEmpresas, listarAnalises, fmtCnpj, Empresa, Resumo } from '@/lib/analiseClientes';

type Filtro = 'todas' | 'com' | 'sem' | 'alertas';

export default function AnaliseClientesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [totalClientes, setTotalClientes] = useState(0);
  const [semCnpj, setSemCnpj] = useState(0);
  const [analises, setAnalises] = useState<Map<string, { resumo: Resumo | null; updated_at: string }>>(new Map());
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');

  useEffect(() => {
    if (!localStorage.getItem('token')) { router.push('/atendimento/login'); return; }
    setLoading(false);
  }, [router]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [emp, lista] = await Promise.all([carregarEmpresas(), listarAnalises()]);
      setEmpresas(emp.empresas);
      setTotalClientes(emp.total);
      setSemCnpj(emp.semCnpj);
      setAnalises(new Map(lista.map(a => [a.cnpj, { resumo: a.resumo, updated_at: a.updated_at }])));
    } catch { /* offline */ }
    finally { setCarregando(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const comAnalise = empresas.filter(e => analises.get(e.cnpj)?.resumo).length;
  const comAlerta = empresas.filter(e => (analises.get(e.cnpj)?.resumo?.criticos || 0) > 0).length;

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const dig = q.replace(/\D/g, '');
    return empresas.filter(e => {
      if (q && !(e.nome.toLowerCase().includes(q) || (dig && e.cnpj.includes(dig)))) return false;
      const r = analises.get(e.cnpj)?.resumo;
      if (filtro === 'com') return !!r;
      if (filtro === 'sem') return !r;
      if (filtro === 'alertas') return !!r && r.criticos > 0;
      return true;
    });
  }, [empresas, analises, busca, filtro]);

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 size={28} className="animate-spin text-muted-foreground" />
    </div>
  );

  const abrir = (cnpj: string) => router.push(`/atendimento/analise-clientes/${cnpj}`);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">

      {/* ── Header ── */}
      <div className="shrink-0 border-b border-border bg-card px-6 pt-5 pb-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <LineIcon size={22} className="text-primary" />
              <h1 className="text-2xl font-bold">Análise de Clientes</h1>
            </div>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Análise fiscal de cada empresa a partir do PGDAS-D: faturamento, limites do Simples, faixa, Fator R e oportunidades
            </p>
          </div>
          <button onClick={carregar} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Atualizar">
            <RefreshCw size={16} />
          </button>
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
                As empresas vêm direto da tela <strong>Clientes Contábeis</strong> (apenas pessoas jurídicas com CNPJ válido).
                Abra uma empresa e envie os PDFs do PGDAS-D: a análise fica salva e pode ser consultada por toda a equipe.
              </p>
            </div>
            <button
              onClick={carregar}
              disabled={carregando}
              className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border border-border hover:bg-accent text-muted-foreground transition-colors disabled:opacity-50"
            >
              {carregando ? <><Loader2 size={12} className="animate-spin" /> Atualizando…</> : <><RefreshCw size={12} /> Atualizar</>}
            </button>
          </div>

          {/* Resumo numérico */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <div className="text-[11px] text-muted-foreground">Clientes contábeis</div>
              <div className="text-2xl font-bold mt-0.5">{totalClientes || '—'}</div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3">
              <div className="text-[11px] text-emerald-700/80">Empresas analisadas</div>
              <div className="text-2xl font-bold mt-0.5 text-emerald-700">{comAnalise} <span className="text-[13px] font-medium opacity-70">de {empresas.length}</span></div>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 px-4 py-3">
              <div className="text-[11px] text-red-700/80">Com alerta crítico</div>
              <div className="text-2xl font-bold mt-0.5 text-red-700">{comAlerta}</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
              <div className="text-[11px] text-amber-700/80">Sem CNPJ (PF ou pendente)</div>
              <div className="text-2xl font-bold mt-0.5 text-amber-700">{semCnpj}</div>
            </div>
          </div>

          {/* Tabela */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
              <span className="font-semibold">Empresas {empresas.length ? `(${lista.length})` : ''}</span>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex rounded-lg border border-border overflow-hidden text-[12px]">
                  {([['todas', 'Todas'], ['com', 'Analisadas'], ['sem', 'Sem análise'], ['alertas', 'Com alerta']] as [Filtro, string][]).map(([k, l]) => (
                    <button key={k} onClick={() => setFiltro(k)}
                      className={`px-3 py-1.5 transition-colors ${filtro === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}>
                      {l}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar empresa ou CNPJ"
                    className="text-[12px] pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background outline-none focus:border-primary w-56" />
                </div>
              </div>
            </div>

            {!empresas.length ? (
              <div className="text-center py-14 text-muted-foreground text-[13px]">
                {carregando ? <Loader2 size={24} className="mx-auto animate-spin opacity-50" /> : <>
                  <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                  <p>Nenhum cliente contábil PJ com CNPJ encontrado.</p>
                  <button onClick={() => router.push('/atendimento/clientes')}
                    className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline">
                    <Users size={13} /> Cadastrar cliente <ArrowRight size={12} />
                  </button>
                </>}
              </div>
            ) : !lista.length ? (
              <div className="text-center py-10 text-muted-foreground text-[13px]">Nenhuma empresa neste filtro.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                      <th className="text-left px-5 py-3 font-semibold">Empresa / CNPJ</th>
                      <th className="text-center px-3 py-3 font-semibold whitespace-nowrap">Último PA</th>
                      <th className="text-right px-3 py-3 font-semibold whitespace-nowrap">RBT12</th>
                      <th className="text-right px-3 py-3 font-semibold whitespace-nowrap">Alíquota</th>
                      <th className="text-right px-3 py-3 font-semibold whitespace-nowrap">Projeção no ano</th>
                      <th className="text-center px-3 py-3 font-semibold">Alertas</th>
                      <th className="text-center px-3 py-3 font-semibold whitespace-nowrap">Atualizada em</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map(e => {
                      const an = analises.get(e.cnpj);
                      const r = an?.resumo;
                      return (
                        <tr key={e.cnpj} onClick={() => abrir(e.cnpj)} className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer">
                          <td className="px-5 py-3 min-w-[260px]">
                            <div className="text-[13px] font-medium truncate">{e.nome || '—'}</div>
                            <div className="text-[11px] text-muted-foreground font-mono">{fmtCnpj(e.cnpj)}</div>
                          </td>
                          {r ? <>
                            <td className="px-3 py-3 text-center tabular-nums">{paLbl(r.pa)}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{brlK(r.rbt12)}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{pct(r.aliq)}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{brlK(r.projAno)}</td>
                            <td className="px-3 py-3 text-center">
                              <div className="inline-flex gap-1">
                                {r.criticos > 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-600" title="Críticos">{r.criticos} crítico{r.criticos > 1 ? 's' : ''}</span>}
                                {r.atencao > 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600" title="Atenção">{r.atencao} atenção</span>}
                                {r.oportunidades > 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600" title="Oportunidades">{r.oportunidades} oport.</span>}
                                {!r.criticos && !r.atencao && !r.oportunidades && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">ok</span>}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-center text-[12px] text-muted-foreground">{an?.updated_at ? new Date(an.updated_at).toLocaleDateString('pt-BR') : '—'}</td>
                          </> : (
                            <td colSpan={6} className="px-3 py-3 text-center text-[12px] text-muted-foreground">Nenhuma análise ainda</td>
                          )}
                          <td className="px-5 py-3 text-right">
                            <span className="inline-flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors whitespace-nowrap">
                              {r ? 'Abrir análise' : 'Analisar'} <ChevronRight size={12} />
                            </span>
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
    </div>
  );
}
