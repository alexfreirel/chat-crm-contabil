'use client';

import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell, CartesianGrid, LabelList } from 'recharts';
import {
  ANEXOS, SUBLIMITE, TETO, TRIBS, MESES_ABREV, Cliente, Nivel,
  brl, brlK, pct, lbl, paLbl, addM, sum, efetiva, analyze, alerts,
} from '@/lib/pgdas';

// Relatório da análise fiscal (PGDAS-D). Usado na Análise de Clientes (contador) e no Resumo do portal do cliente.

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

function Relatorio({ S, a, alertas }: { S: Cliente; a: NonNullable<ReturnType<typeof analyze>>; alertas: [Nivel, string, string][] }) {
  const f = ANEXOS[S.anexo].f;
  const varM = a.prevM ? a.rec / a.prevM - 1 : null;
  const varY = a.prevY ? a.rec / a.prevY - 1 : null;
  const sc = (v: number) => Math.min(100, v / TETO * 100);
  const sub = a.mesesAte(SUBLIMITE), teto = a.mesesAte(TETO), restante = 12 - a.mo;
  const serie = a.serie.slice(-12).map(k => ({ k, label: lbl(k), v: S.months[k].rec || 0 }));
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
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serie} margin={{ top: 22, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeOpacity={0.15} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={60}
                tickFormatter={v => v >= 1e6 ? (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi' : (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil'} />
              <Tooltip formatter={v => brl(Number(v))} labelStyle={{ color: '#111' }} cursor={{ fillOpacity: 0.08 }} />
              <ReferenceLine y={a.media12} stroke="#f59e0b" strokeDasharray="4 4" />
              <Bar dataKey="v" name="Faturamento" radius={[3, 3, 0, 0]}>
                <LabelList dataKey="v" position="top" fontSize={11} fill="currentColor" formatter={(v: unknown) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} />
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

      <footer className="flex justify-between gap-4 flex-wrap text-xs text-muted-foreground px-1">
        <span>Fonte: extratos do PGDAS-D. Tabelas da LC 123/2006 vigentes.</span>
        <span>Análise gerencial. Não substitui a declaração oficial.</span>
      </footer>
    </>
  );
}

export function RelatorioPgdas({ S }: { S: Cliente }) {
  const a = useMemo(() => analyze(S), [S]);
  const alertas = useMemo(() => (a ? alerts(S, a) : []), [S, a]);
  if (!a) return null;
  return <Relatorio S={S} a={a} alertas={alertas} />;
}
