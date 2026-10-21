/* Núcleo sem DOM da Análise de Clientes: tabelas do Simples, formatação e leitura do texto do PGDAS-D.
   Portado do projeto relatorio-pgdas. */

export type Anexo = 'I' | 'II' | 'III' | 'IV' | 'V';
type Faixa = [number, number, number]; // [teto RBT12, alíquota nominal, parcela a deduzir]

export const ANEXOS: Record<Anexo, { nome: string; f: Faixa[] }> = {
  I:   { nome: 'Comércio',  f: [[180000,.04,0],[360000,.073,5940],[720000,.095,13860],[1800000,.107,22500],[3600000,.143,87300],[4800000,.19,378000]] },
  II:  { nome: 'Indústria', f: [[180000,.045,0],[360000,.078,5940],[720000,.10,13860],[1800000,.112,22500],[3600000,.147,85500],[4800000,.30,720000]] },
  III: { nome: 'Serviços',  f: [[180000,.06,0],[360000,.112,9360],[720000,.135,17640],[1800000,.16,35640],[3600000,.21,125640],[4800000,.33,648000]] },
  IV:  { nome: 'Serviços',  f: [[180000,.045,0],[360000,.09,8100],[720000,.102,12420],[1800000,.14,39780],[3600000,.22,183780],[4800000,.33,828000]] },
  V:   { nome: 'Serviços',  f: [[180000,.155,0],[360000,.18,4500],[720000,.195,9900],[1800000,.205,17100],[3600000,.23,62100],[4800000,.305,540000]] },
};
export const SUBLIMITE = 3600000;
export const TETO = 4800000;
export const TRIBS = ['IRPJ','CSLL','COFINS','PIS/Pasep','INSS/CPP','ICMS','IPI','ISS'] as const;
export const MESES_ABREV = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

/* ---------- utilitários ---------- */
export const brl = (v: number | null | undefined) =>
  v == null || isNaN(v) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const brlK = (v: number) =>
  v >= 1e6 ? 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi'
  : v >= 1e3 ? 'R$ ' + Math.round(v / 1e3).toLocaleString('pt-BR') + ' mil' : brl(v);
export const pct = (v: number | null | undefined, d = 2) =>
  v == null || !isFinite(v) ? '—' : (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
export const numFmt = (v: number | null | undefined) =>
  v == null || isNaN(v) ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const parseBR = (s: string | null | undefined): number | null => {
  if (s == null) return null;
  let t = String(s).trim();
  if (!t) return null;
  if (/,/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t.replace(/[^\d.\-]/g, ''));
  return isNaN(n) ? null : n;
};
export const mk = (y: number, m: number) => y + '-' + String(m).padStart(2, '0');
export const addM = (k: string, n: number) => {
  let [y, m] = k.split('-').map(Number);
  m += n;
  while (m > 12) { m -= 12; y++; }
  while (m < 1) { m += 12; y--; }
  return mk(y, m);
};
export const lbl = (k: string) => { const [y, m] = k.split('-'); return MESES_ABREV[+m - 1] + '/' + y.slice(2); };
export const paLbl = (k: string) => { const [y, m] = k.split('-'); return m + '/' + y; };
export const sum = (a: (number | null | undefined)[]) => a.reduce<number>((s, x) => s + (x || 0), 0);

export function faixaDe(anexo: Anexo, rbt12: number) {
  const f = ANEXOS[anexo].f;
  for (let i = 0; i < f.length; i++) if (rbt12 <= f[i][0]) return i;
  return f.length - 1;
}
export function efetiva(anexo: Anexo, rbt12: number) {
  const f = ANEXOS[anexo].f;
  if (!rbt12 || rbt12 <= 0) return f[0][1];
  const [, a, pd] = f[faixaDe(anexo, rbt12)];
  return (rbt12 * a - pd) / rbt12;
}

/* ---------- leitura do texto do PGDAS-D ---------- */
const NUM_RE = /-?\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)/g;
const nums = (s: string) => (s.match(NUM_RE) || []).map(x => parseBR(x) as number);

/* Valor total de uma linha de receita: (MI, ME, Total) ou um único valor */
function rowTotal(text: string, re: RegExp): number | null {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;
    let n = nums(lines[i].slice((m.index ?? 0) + m[0].length));
    if (!n.length && lines[i + 1]) n = nums(lines[i + 1]);
    if (!n.length) continue;
    return n.length >= 3 ? n[2] : n.length === 2 ? n[0] + n[1] : n[0];
  }
  return null;
}
/* Pares mês/valor de uma seção, aceitando layout em pares ou em linhas de cabeçalho */
function monthSeries(sec: string): Record<string, number> {
  const out: Record<string, number> = {};
  const queue: string[] = [];
  const tok = /(\d{2})\/(\d{4})|(-?\d{1,3}(?:\.\d{3})*,\d{2})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = tok.exec(sec))) {
    if (m[1]) { const mo = +m[1]; if (mo >= 1 && mo <= 12) queue.push(mk(+m[2], mo)); }
    else if (queue.length) { const k = queue.shift()!; out[k] = (out[k] || 0) + (parseBR(m[3]) as number); }
  }
  return out;
}
function section(text: string, startRe: RegExp, endRe: RegExp) {
  const s = text.search(startRe);
  if (s < 0) return '';
  const rest = text.slice(s);
  const firstNl = rest.indexOf('\n');
  const body = rest.slice(firstNl < 0 ? 0 : firstNl);
  const e = body.search(endRe);
  return e < 0 ? body.slice(0, 3000) : body.slice(0, e);
}

export interface Flags { st: boolean; mono: boolean; ret: boolean; exp: boolean }
export interface PgdasLido {
  pa: string | null; cnpj: string | null; nome: string | null;
  rpa: number | null; rbt12: number | null; rba: number | null;
  hist: Record<string, number>; folha: Record<string, number>;
  fatorR: number | null; trib: Record<string, number> | null; das: number | null;
  anexos: string[]; flags: Flags;
}

export function parsePGDAS(raw: string): PgdasLido {
  const t = raw.replace(/ /g, ' ');
  // Cabeçalho: "Período de Apuração: 01/09/2026 a 30/09/2026" (intervalo) ou "... 09/2026"
  let m = t.match(/Per[ií]odo de Apura[çc][ãa]o[^\d\n]{0,40}\d{2}\/(\d{2})\/(\d{4})/i)
    || t.match(/Per[ií]odo de Apura[çc][ãa]o[^\d\n]{0,40}(\d{2})\/(\d{4})/i)
    || t.match(/\(PA\)[^\d\n]{0,20}(\d{2})\/(\d{4})/);
  const pa = m && +m[1] >= 1 && +m[1] <= 12 ? mk(+m[2], +m[1]) : null;
  m = t.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  const cnpj = m ? m[0] : null;
  m = t.match(/Nome empresarial\s*:?\s*([^\n]+)/i);
  const nome = m ? m[1].split(/\s{2,}|Data de abertura|CNPJ/i)[0].trim() : null;
  const hist = monthSeries(section(t, /Receitas? Brutas? Anteriores/i, /Folha de Sal[áa]rios|Fator r\b|2\.3\)|Total do D[ée]bito|Informa[çc][õo]es da Declara/i));
  const folha = monthSeries(section(t, /Folha de Sal[áa]rios Anteriores/i, /Fator r\b|2\.4\)|Valor (?:Original|Informado)|Total do D[ée]bito|Informa[çc][õo]es da Declara/i));
  m = t.match(/Fator r\s*[:=]?\s*(\d+[,.]\d+)/i);
  const fatorR = m ? parseBR(m[1]) : null;
  // Total do débito: 9 números (8 tributos + total) cuja soma confere
  let trib: Record<string, number> | null = null;
  let das: number | null = null;
  const idx = t.search(/Total (?:Geral da Empresa|do D[ée]bito Exig[íi]vel)/i);
  if (idx >= 0) {
    const n = nums(t.slice(idx, idx + 1500));
    for (let i = 0; i + 9 <= n.length; i++) {
      const w = n.slice(i, i + 9);
      if (w[8] > 0 && Math.abs(sum(w.slice(0, 8)) - w[8]) < 0.05) {
        das = w[8]; trib = {}; TRIBS.forEach((tb, j) => { trib![tb] = w[j]; }); break;
      }
    }
    if (das == null) { const tot = t.slice(idx).match(/Total[^\n]*?(\d{1,3}(?:\.\d{3})*,\d{2})/); if (tot) das = parseBR(tot[1]); }
  }
  // 2.6) Resumo da Declaração: "Receita Bruta Auferida | Valor Total do Débito Declarado" → DAS da competência
  const i26 = t.search(/Valor Total do D[ée]bito Declarado/i);
  if (i26 >= 0) {
    const n = nums(t.slice(i26, i26 + 300));
    const v = n.length >= 2 ? n[1] : null;
    if (v != null && v > 0) das = v;
  }
  const anexos = [...new Set((t.match(/Anexo\s+(?:V|IV|III|II|I)\b/gi) || []).map(a => a.split(/\s+/)[1].toUpperCase()))];
  const L = t.split('\n');
  const any = (re: RegExp, not?: RegExp) => L.some(l => re.test(l) && !(not && not.test(l)));
  const flags: Flags = {
    st: any(/\bcom substitui[çc][ãa]o tribut/i),
    mono: any(/monof[áa]sic/i, /\bsem\b/i),
    ret: any(/\bcom reten[çc][ãa]o|ISS retido|\bretido\b/i, /\bsem reten/i),
    exp: any(/\bpara o exterior\b/i, /exceto para o exterior/i),
  };
  const rpa = rowTotal(t, /Receita Bruta do PA[^\n\d]*/i);
  // Sem cabeçalho legível: o PA é o mês seguinte ao último das receitas anteriores
  const hk = Object.keys(hist).sort();
  const paFinal = pa ?? (rpa != null && hk.length ? addM(hk[hk.length - 1], 1) : null);
  return {
    pa: paFinal, cnpj, nome,
    rpa,
    rbt12: rowTotal(t, /\(RBT12\)/),
    rba: rowTotal(t, /\(RBA\)/),
    hist, folha, fatorR, trib, das, anexos, flags,
  };
}

/* ---------- extração de texto do PDF (pdf.js via CDN, carregado sob demanda) ---------- */
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Não foi possível carregar o leitor de PDF.'));
    document.head.appendChild(s);
  });
}

// O worker é carregado como script comum (window.pdfjsWorker): o pdf.js roda na thread
// principal, sem precisar criar um Web Worker de outro domínio.
let pdfjsPromise: Promise<any> | null = null;
function loadPdfjs(): Promise<any> {
  const w = window as any;
  if (w.pdfjsLib && w.pdfjsWorker) return Promise.resolve(w.pdfjsLib);
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      if (!w.pdfjsLib) await loadScript(PDFJS_URL);
      if (!w.pdfjsWorker) await loadScript(PDFJS_WORKER);
      w.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return w.pdfjsLib;
    })().catch(err => { pdfjsPromise = null; throw err; });
  }
  return pdfjsPromise;
}

export async function pdfText(file: File): Promise<string> {
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const rows: { y: number; items: { x: number; s: string }[] }[] = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5], x = it.transform[4];
      let r = rows.find(r => Math.abs(r.y - y) < 2.5);
      if (!r) { r = { y, items: [] }; rows.push(r); }
      r.items.push({ x, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      lines.push(r.items.map(i => i.s).join(' ').replace(/\s+/g, ' ').trim());
    }
  }
  return lines.join('\n');
}

/* ---------- estado e análise ---------- */
export interface MesDados { rec: number | null; das: number | null; folha: number | null; trib: Record<string, number> | null; fromPA?: boolean }
export interface Cliente {
  nome: string; cnpj: string; anexo: Anexo;
  months: Record<string, MesDados>;
  rbt12P: Record<string, number>; rbaP: Record<string, number>; rP: Record<string, number>;
  anexosFound: string[]; flags: Flags;
}

export const novoCliente = (): Cliente => ({
  nome: '', cnpj: '', anexo: 'I', months: {}, rbt12P: {}, rbaP: {}, rP: {},
  anexosFound: [], flags: { st: false, mono: false, ret: false, exp: false },
});

/* Mescla um PGDAS lido no cliente (muta e devolve o mesmo objeto) */
export function mesclar(S: Cliente, r: PgdasLido): Cliente {
  const M = S.months;
  const get = (k: string) => M[k] || (M[k] = { rec: null, das: null, folha: null, trib: null });
  for (const [k, v] of Object.entries(r.hist)) { const o = get(k); if (!o.fromPA) o.rec = v; }
  for (const [k, v] of Object.entries(r.folha)) get(k).folha = v;
  if (r.pa) {
    const o = get(r.pa); o.fromPA = true;
    if (r.rpa != null) o.rec = r.rpa;
    if (r.das != null) o.das = r.das;
    if (r.trib) o.trib = r.trib;
    if (r.rbt12 != null) S.rbt12P[r.pa] = r.rbt12;
    if (r.rba != null) S.rbaP[r.pa] = r.rba;
    if (r.fatorR != null) S.rP[r.pa] = r.fatorR;
  }
  if (!S.nome && r.nome) S.nome = r.nome;
  if (!S.cnpj && r.cnpj) S.cnpj = r.cnpj;
  r.anexos.forEach(a => { if (!S.anexosFound.includes(a)) S.anexosFound.push(a); });
  if (S.anexosFound.length) S.anexo = (S.anexosFound.includes(S.anexo) ? S.anexo : S.anexosFound[0]) as Anexo;
  (Object.keys(r.flags) as (keyof Flags)[]).forEach(k => { S.flags[k] = S.flags[k] || r.flags[k]; });
  return S;
}

export function analyze(S: Cliente) {
  const M = S.months;
  const ks = Object.keys(M).filter(k => M[k].rec != null).sort();
  if (!ks.length) return null;
  const withDas = ks.filter(k => M[k].das != null);
  const pa = withDas.length ? withDas[withDas.length - 1] : ks[ks.length - 1];
  const rec = M[pa].rec as number, das = M[pa].das;
  const prev12: number[] = [];
  for (let i = 1; i <= 12; i++) { const v = M[addM(pa, -i)]?.rec; if (v != null) prev12.push(v); }
  const rbt12 = S.rbt12P[pa] ?? sum(prev12);
  const rbt12Parcial = S.rbt12P[pa] == null && prev12.length < 12;
  const fi = faixaDe(S.anexo, rbt12);
  const aliqCalc = efetiva(S.anexo, rbt12);
  const aliqReal = das != null && rec ? das / rec : null;
  const [y, mo] = pa.split('-').map(Number);
  const yearKs = ks.filter(k => k.startsWith(y + '-') && k <= pa);
  let rba = sum(yearKs.map(k => M[k].rec)), rbaEst = false;
  if (yearKs.length < mo && S.rbaP[pa] != null) { rba = S.rbaP[pa] + rec; rbaEst = true; }
  const last3 = [0, 1, 2].map(i => M[addM(pa, -i)]?.rec).filter((v): v is number => v != null);
  const ritmo = last3.length ? sum(last3) / last3.length : rec;
  const projAno = rba + ritmo * (12 - mo);
  const mesesAte = (lim: number) => (rba >= lim ? 0 : Math.ceil((lim - rba) / ritmo));
  const prevM = M[addM(pa, -1)]?.rec, prevY = M[addM(pa, -12)]?.rec;
  const rec12 = rec + sum(prev12.slice(0, 11));
  const folha12 = sum([...Array(12)].map((_, i) => M[addM(pa, -i - 1)]?.folha));
  const fatorR = S.rP[pa] ?? (folha12 > 0 && rbt12 > 0 ? folha12 / rbt12 : null);
  const cargaAcum = withDas.length ? sum(withDas.map(k => M[k].das)) / sum(withDas.map(k => M[k].rec)) : null;
  const serie = ks.filter(k => k <= pa).slice(-15);
  const media12 = rec12 / Math.min(12, 1 + ks.filter(k => k < pa && k >= addM(pa, -11)).length);
  return { ks, pa, rec, das, rbt12, rbt12Parcial, fi, aliqCalc, aliqReal, rba, rbaEst, mo, y, ritmo, projAno, mesesAte, prevM, prevY, rec12, folha12, fatorR, dasKs: withDas, cargaAcum, serie, media12, trib: M[pa].trib };
}
export type Analise = NonNullable<ReturnType<typeof analyze>>;

export type Nivel = 'bad' | 'warn' | 'ok' | 'info';
export function alerts(S: Cliente, a: Analise): [Nivel, string, string][] {
  const out: [Nivel, string, string][] = [];
  const f = ANEXOS[S.anexo].f;
  if (a.projAno > TETO) out.push(['bad', 'Risco de exclusão do Simples', `No ritmo atual, o faturamento de ${a.y} chega a ${brlK(a.projAno)}, acima do teto de R$ 4,8 milhões. É preciso planejar a mudança de regime.`]);
  else if (a.projAno > SUBLIMITE) out.push(['bad', 'Sublimite estadual em risco', `A projeção para ${a.y} é de ${brlK(a.projAno)}. Acima de R$ 3,6 milhões, ICMS e ISS passam a ser recolhidos fora do DAS no ano seguinte.`]);
  else if (a.projAno > SUBLIMITE * 0.85) out.push(['warn', 'Perto do sublimite', `A projeção para ${a.y} (${brlK(a.projAno)}) está a menos de 15% do sublimite de R$ 3,6 milhões. Acompanhar mês a mês.`]);
  else out.push(['ok', 'Dentro dos limites do Simples', `A projeção de faturamento para ${a.y} é de ${brlK(a.projAno)}, com folga em relação ao sublimite de R$ 3,6 milhões.`]);
  if (a.fi < f.length - 1) {
    const falta = f[a.fi][0] - a.rbt12;
    if (falta < f[a.fi][0] * 0.1) out.push(['warn', 'Mudança de faixa próxima', `Faltam ${brl(falta)} na receita dos últimos 12 meses para entrar na faixa ${a.fi + 2}, com alíquota nominal de ${pct(f[a.fi + 1][1], 1)}.`]);
  }
  if (a.aliqReal != null) {
    const d = a.aliqReal - a.aliqCalc;
    if (d > 0.001) out.push(['warn', 'DAS acima do esperado', `A alíquota paga em ${paLbl(a.pa)} (${pct(a.aliqReal)}) ficou acima da efetiva calculada para o anexo ${S.anexo} (${pct(a.aliqCalc)}). Vale revisar a classificação das receitas na declaração.`]);
    else if (d < -0.005) out.push(['info', 'DAS abaixo da tabela', `A alíquota paga (${pct(a.aliqReal)}) ficou abaixo da efetiva da tabela (${pct(a.aliqCalc)}). Costuma refletir receitas com ICMS-ST, monofásicos, ISS retido ou outro anexo.`]);
  }
  if ((S.anexo === 'I' || S.anexo === 'II') && !S.flags.st && !S.flags.mono)
    out.push(['info', 'Oportunidade: revisar ST e monofásicos', 'Não há receitas segregadas com ICMS-ST ou PIS/COFINS monofásico. Se a empresa vende produtos nessas condições, há imposto pago a mais que pode ser recuperado dos últimos 5 anos.']);
  if (a.fatorR != null && (S.anexo === 'III' || S.anexo === 'V')) {
    if (a.fatorR < 0.28 && a.fatorR > 0.2) out.push(['warn', 'Fator R abaixo de 28%', `O Fator R está em ${pct(a.fatorR, 1)}. Ajustando pró-labore ou folha, a atividade pode ser tributada no Anexo III, com alíquota menor.`]);
    else if (a.fatorR >= 0.28 && a.fatorR < 0.30) out.push(['warn', 'Fator R no limite', `O Fator R está em ${pct(a.fatorR, 1)}, muito perto dos 28%. Uma queda na folha pode levar a atividade ao Anexo V.`]);
  }
  if (a.prevY && a.rec < a.prevY * 0.8) out.push(['warn', 'Queda em relação ao ano anterior', `O faturamento de ${paLbl(a.pa)} ficou ${pct(1 - a.rec / a.prevY, 1)} abaixo do mesmo mês de ${a.y - 1}.`]);
  return out;
}
