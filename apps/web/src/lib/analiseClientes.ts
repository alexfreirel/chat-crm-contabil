/* Chamadas da API da Análise de Clientes: empresas (Clientes Contábeis) e análises salvas por CNPJ. */
import { API_BASE_URL } from '@/lib/api';
import { Cliente, analyze, alerts } from '@/lib/pgdas';

export interface Empresa { cnpj: string; nome: string; clienteId?: string }

export interface Resumo {
  pa: string; rbt12: number; aliq: number; projAno: number; meses: number;
  criticos: number; atencao: number; oportunidades: number;
}
export interface AnaliseSalva { dados: Cliente | null; obs: string; resumo: Resumo | null; updated_at?: string }

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}
export const limparCnpj = (c: string) => c.replace(/\D/g, '');
export const fmtCnpj = (c: string) => limparCnpj(c).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

/* Empresas PJ com CNPJ válido dos Clientes Contábeis (mesma regra das Certidões) */
export async function carregarEmpresas(): Promise<{ empresas: Empresa[]; total: number; semCnpj: number }> {
  const res = await fetch(`${API_BASE_URL}/clientes-contabil?limit=500`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Falha ao carregar clientes');
  const data = await res.json();
  type ClienteRaw = {
    id?: string; cpf_cnpj?: string; nome_empresa?: string;
    lead?: { name?: string; cpf_cnpj?: string; ficha_contabil?: { cnpj?: string; razao_social?: string } };
  };
  const clientes: ClienteRaw[] = data?.data || data || [];
  const seen = new Set<string>();
  const empresas: Empresa[] = [];
  let semCnpj = 0;
  for (const c of clientes) {
    // Primeiro valor com 14 dígitos (o cpf_cnpj do cadastro pode estar vazio ou ser um CPF)
    const cnpj = [c.cpf_cnpj, c.lead?.ficha_contabil?.cnpj, c.lead?.cpf_cnpj]
      .map(v => limparCnpj(v || '')).find(v => v.length === 14) || '';
    if (cnpj.length !== 14) { semCnpj++; continue; }
    if (seen.has(cnpj)) continue;
    seen.add(cnpj);
    empresas.push({ cnpj, nome: c.nome_empresa || c.lead?.ficha_contabil?.razao_social || c.lead?.name || cnpj, clienteId: c.id });
  }
  empresas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return { empresas, total: clientes.length, semCnpj };
}

export async function listarAnalises(): Promise<{ cnpj: string; resumo: Resumo | null; updated_at: string }[]> {
  const res = await fetch(`${API_BASE_URL}/settings/analise-pgdas`, { headers: authHeaders() });
  return res.ok ? res.json() : [];
}

export async function buscarAnalise(cnpj: string): Promise<AnaliseSalva | null> {
  const res = await fetch(`${API_BASE_URL}/settings/analise-pgdas/${limparCnpj(cnpj)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Falha ao carregar a análise');
  const d = await res.json();
  return d?.dados ? d : null;
}

export async function salvarAnalise(cnpj: string, dados: Cliente, obs: string): Promise<string | undefined> {
  const res = await fetch(`${API_BASE_URL}/settings/analise-pgdas/${limparCnpj(cnpj)}`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ dados, obs, resumo: resumir(dados) }),
  });
  if (!res.ok) throw new Error('Falha ao salvar');
  return (await res.json())?.updated_at;
}

export async function apagarAnalise(cnpj: string) {
  await fetch(`${API_BASE_URL}/settings/analise-pgdas/${limparCnpj(cnpj)}`, { method: 'DELETE', headers: authHeaders() });
}

export function resumir(S: Cliente): Resumo | null {
  const a = analyze(S);
  if (!a) return null;
  const al = alerts(S, a);
  return {
    pa: a.pa, rbt12: a.rbt12, aliq: a.aliqReal ?? a.aliqCalc, projAno: a.projAno,
    meses: a.ks.length,
    criticos: al.filter(x => x[0] === 'bad').length,
    atencao: al.filter(x => x[0] === 'warn').length,
    oportunidades: al.filter(x => x[0] === 'info').length,
  };
}
