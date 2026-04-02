'use client';

import { useMemo } from 'react';

export type AppRole = 'ADMIN' | 'ADVOGADO' | 'OPERADOR' | 'ESTAGIARIO';

export interface RoleInfo {
  role: AppRole | null;
  userId: string | null;
  isAdmin: boolean;
  isAdvogado: boolean;
  isOperador: boolean;
  isEstagiario: boolean;
  canManageLegalCases: boolean;  // criar, editar, arquivar processos
  canViewLegalCases: boolean;    // visualizar processos
  canManageSettings: boolean;    // configurações do sistema
  canViewDashboard: boolean;     // dashboard
  canViewAnalytics: boolean;     // analytics/marketing
  canViewDjen: boolean;          // publicações DJEN
  canViewFinanceiro: boolean;    // módulo financeiro
  canViewAdvogado: boolean;      // triagem e peticionamento
}

/** Lê o role do JWT salvo no localStorage e retorna helpers de permissão. */
export function useRole(): RoleInfo {
  return useMemo(() => {
    if (typeof window === 'undefined') return buildInfo(null, null);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('[useRole] Sem token no localStorage — role=null');
        return buildInfo(null, null);
      }
      // JWT base64url → base64 standard para atob()
      const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(b64));
      if (!payload?.role) {
        console.warn('[useRole] Token decodificado mas sem role:', payload);
      }
      return buildInfo(payload?.role ?? null, payload?.sub ?? null);
    } catch (e) {
      console.error('[useRole] ERRO ao decodificar token:', e);
      return buildInfo(null, null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function buildInfo(role: string | null, userId: string | null): RoleInfo {
  const r = role as AppRole | null;
  const is = (roles: AppRole[]) => r !== null && roles.includes(r);

  return {
    role: r,
    userId,
    isAdmin: r === 'ADMIN',
    isAdvogado: r === 'ADVOGADO',
    isOperador: r === 'OPERADOR',
    isEstagiario: r === 'ESTAGIARIO',
    canManageLegalCases: is(['ADMIN', 'ADVOGADO']),
    canViewLegalCases: is(['ADMIN', 'ADVOGADO', 'ESTAGIARIO']),
    canManageSettings: r === 'ADMIN',
    canViewDashboard: is(['ADMIN', 'ADVOGADO']),
    canViewAnalytics: is(['ADMIN', 'ADVOGADO']),
    canViewDjen: is(['ADMIN', 'ADVOGADO', 'ESTAGIARIO']),
    canViewFinanceiro: is(['ADMIN', 'ADVOGADO']),
    canViewAdvogado: is(['ADMIN', 'ADVOGADO', 'ESTAGIARIO']),
  };
}
