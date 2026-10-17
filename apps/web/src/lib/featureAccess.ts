'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

/** Perfis cujo acesso é configurável em Configurações › Permissões. ADMIN e CONTADOR sempre têm acesso. */
export const EDITABLE_ROLES = ['ASSISTENTE', 'ASSISTENTE_PESSOAL', 'FINANCEIRO'] as const;
export type EditableRole = typeof EDITABLE_ROLES[number];

export interface FeatureDef {
  key: string;
  /** Prefixos de rota que a funcionalidade controla */
  routes: string[];
  /** Quando true, só a rota exata (ex.: o Inbox em /atendimento) */
  exact?: string[];
  /** Acesso padrão (antes de qualquer alteração em Permissões) = comportamento atual do sistema */
  defaults: Record<EditableRole, boolean>;
}

const t = true;
const f = false;

export const FEATURES: FeatureDef[] = [
  { key: 'dashboard',   routes: ['/atendimento/dashboard'],                          defaults: { ASSISTENTE: t, ASSISTENTE_PESSOAL: t, FINANCEIRO: f } },
  { key: 'analytics',   routes: ['/atendimento/marketing', '/atendimento/relatorios'], defaults: { ASSISTENTE: f, ASSISTENTE_PESSOAL: f, FINANCEIRO: f } },
  { key: 'inbox',       routes: ['/atendimento/chat'], exact: ['/atendimento'],       defaults: { ASSISTENTE: t, ASSISTENTE_PESSOAL: t, FINANCEIRO: t } },
  { key: 'crm',         routes: ['/atendimento/crm'],                                defaults: { ASSISTENTE: f, ASSISTENTE_PESSOAL: f, FINANCEIRO: f } },
  { key: 'contatos',    routes: ['/atendimento/contacts'],                           defaults: { ASSISTENTE: t, ASSISTENTE_PESSOAL: t, FINANCEIRO: t } },
  { key: 'followup',    routes: ['/atendimento/followup'],                           defaults: { ASSISTENTE: f, ASSISTENTE_PESSOAL: f, FINANCEIRO: f } },
  { key: 'clientes',    routes: ['/atendimento/clientes', '/atendimento/workspace'], defaults: { ASSISTENTE: t, ASSISTENTE_PESSOAL: t, FINANCEIRO: t } },
  { key: 'obrigacoes',  routes: ['/atendimento/calendario-fiscal'],                  defaults: { ASSISTENTE: f, ASSISTENTE_PESSOAL: f, FINANCEIRO: t } },
  { key: 'agenteFiscal', routes: ['/atendimento/agente-fiscal'],                     defaults: { ASSISTENTE: t, ASSISTENTE_PESSOAL: t, FINANCEIRO: t } },
  { key: 'certidoes',   routes: ['/atendimento/agente-certidoes'],                   defaults: { ASSISTENTE: t, ASSISTENTE_PESSOAL: t, FINANCEIRO: t } },
  { key: 'impostos',    routes: ['/atendimento/impostos'],                           defaults: { ASSISTENTE: t, ASSISTENTE_PESSOAL: t, FINANCEIRO: t } },
  { key: 'folha',       routes: ['/atendimento/folha-pagamento'],                    defaults: { ASSISTENTE: t, ASSISTENTE_PESSOAL: t, FINANCEIRO: t } },
  { key: 'analiseClientes', routes: ['/atendimento/analise-clientes'],              defaults: { ASSISTENTE: t, ASSISTENTE_PESSOAL: t, FINANCEIRO: t } },
  { key: 'financeiro', routes: ['/atendimento/financeiro'],                         defaults: { ASSISTENTE: f, ASSISTENTE_PESSOAL: f, FINANCEIRO: t } },
  { key: 'agenda',      routes: ['/atendimento/agenda', '/atendimento/tasks'],       defaults: { ASSISTENTE: t, ASSISTENTE_PESSOAL: t, FINANCEIRO: t } },
];

export type AccessMatrix = Record<string, Partial<Record<EditableRole, boolean>>>;

// Cache em módulo: a matriz é buscada uma vez e compartilhada entre menu, rotas e a página de Permissões.
let cache: AccessMatrix | null = null;
let inflight: Promise<AccessMatrix> | null = null;
const listeners = new Set<(m: AccessMatrix) => void>();

function currentToken(): string | null {
  return typeof window === 'undefined' ? null : localStorage.getItem('token');
}

/** Perfis do usuário lidos do JWT a cada chamada (o layout persiste entre login e telas, então não pode ficar em cache). */
function rolesFromToken(): string[] {
  const token = currentToken();
  if (!token) return [];
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64));
    return Array.isArray(payload?.roles) ? payload.roles : (payload?.role ? [payload.role] : []);
  } catch {
    return [];
  }
}

async function loadMatrix(): Promise<AccessMatrix> {
  if (cache) return cache;
  if (!currentToken()) return {}; // sem login: não busca nem guarda em cache
  if (!inflight) {
    inflight = api.get('/settings/access-matrix')
      .then(r => {
        cache = (r.data && typeof r.data === 'object' ? r.data : {}) as AccessMatrix;
        return cache;
      })
      .catch(() => ({} as AccessMatrix)) // falha: usa os padrões, tenta de novo no próximo carregamento
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** Atualiza o cache (chamado após salvar em Permissões). */
export function setAccessMatrix(m: AccessMatrix) {
  cache = m;
  listeners.forEach(l => l(m));
}

const PRIORIDADE: EditableRole[] = ['ASSISTENTE_PESSOAL', 'FINANCEIRO', 'ASSISTENTE'];

/** Valor efetivo para um perfil: o que foi salvo em Permissões ou, na falta, o padrão. */
export function effectiveFor(matrix: AccessMatrix, feature: FeatureDef, role: EditableRole): boolean {
  const saved = matrix[feature.key]?.[role];
  return typeof saved === 'boolean' ? saved : feature.defaults[role];
}

export function featureForPath(pathname: string): FeatureDef | null {
  return FEATURES.find(ft =>
    ft.exact?.includes(pathname) ||
    ft.routes.some(r => pathname === r || pathname.startsWith(r + '/')),
  ) ?? null;
}

export function useFeatureAccess() {
  const token = currentToken();
  const roles = rolesFromToken();
  const [matrix, setMatrix] = useState<AccessMatrix>(cache ?? {});
  const [loaded, setLoaded] = useState(cache !== null);

  useEffect(() => {
    if (!token) { setLoaded(false); return; }
    let alive = true;
    loadMatrix().then(m => { if (alive) { setMatrix(m); setLoaded(true); } });
    const l = (m: AccessMatrix) => setMatrix(m);
    listeners.add(l);
    return () => { alive = false; listeners.delete(l); };
  }, [token]);

  const privileged = roles.includes('ADMIN') || roles.includes('CONTADOR');

  /** Usuário pode acessar a funcionalidade? Admin/Contador sempre; demais pelo perfil mais específico. */
  const canAccess = (key: string): boolean => {
    const feature = FEATURES.find(ft => ft.key === key);
    if (!feature || privileged) return true;
    const role = PRIORIDADE.find(r => roles.includes(r));
    if (!role) return true; // perfil não configurável: mantém o comportamento existente
    return effectiveFor(matrix, feature, role);
  };

  const firstAllowedPath = (): string => {
    const ordem = ['inbox', 'agenda', 'clientes', 'contatos', 'dashboard'];
    for (const key of ordem) {
      if (canAccess(key)) {
        const ft = FEATURES.find(x => x.key === key)!;
        return ft.exact?.[0] ?? ft.routes[0];
      }
    }
    return '/atendimento/login';
  };

  return { matrix, loaded, canAccess, firstAllowedPath };
}
