import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005',
});

// ─── Helpers de token ────────────────────────────────────────────────────────

/** Decodifica o payload do JWT (sem verificar assinatura — só para leitura local) */
function decodeTokenPayload(token: string): { exp?: number } | null {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

/** Retorna true se o token está genuinamente expirado (sem buffer prematuro) */
function isTokenExpired(token: string): boolean {
  const payload = decodeTokenPayload(token);
  if (!payload?.exp) return false; // Se não conseguiu decodificar, não desloga — deixa o servidor decidir
  return payload.exp * 1000 < Date.now();
}

/** Dispara logout limpo: remove token e notifica o app */
function triggerLogout(reason: 'expired' | 'unauthorized') {
  if (typeof window === 'undefined') return;
  if (_redirectingToLogin) return;
  _redirectingToLogin = true;
  localStorage.removeItem('token');
  window.dispatchEvent(new CustomEvent('auth:logout', { detail: { reason } }));
  setTimeout(() => { _redirectingToLogin = false; }, 10_000);
}

let _redirectingToLogin = false;
let _consecutive401Count = 0;
let _last401ResetTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Check periódico de expiração (roda a cada 30min — tokens duram 365d) ────
if (typeof window !== 'undefined') {
  setInterval(() => {
    const token = localStorage.getItem('token');
    if (token && isTokenExpired(token)) {
      triggerLogout('expired');
    }
  }, 30 * 60_000); // 30 minutos — adequado para tokens de 365d
}

// ─── Interceptor de REQUEST ───────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// ─── Interceptor de RESPONSE ─────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => {
    // Reset contador de 401 em caso de sucesso
    _consecutive401Count = 0;
    return response;
  },
  (error) => {
    // Chamadas de background (_silent401: true) nunca causam logout
    const isSilent = (error.config as any)?._silent401 === true;

    if (error.response?.status === 401 && !isSilent) {
      _consecutive401Count++;

      // Log para diagnóstico — ajuda a identificar qual endpoint está retornando 401
      const url = (error.config as any)?.url || 'unknown';
      console.warn(`[api] 401 em ${url} (consecutivo: ${_consecutive401Count})`);

      // Resetar o contador após 15s sem 401 (janela maior para evitar falsos positivos)
      if (_last401ResetTimer) clearTimeout(_last401ResetTimer);
      _last401ResetTimer = setTimeout(() => { _consecutive401Count = 0; }, 15_000);

      // Só desloga após 5 erros 401 consecutivos — threshold maior para suportar páginas
      // com múltiplas requests simultâneas (ex: workspace com vários widgets)
      if (_consecutive401Count >= 5) {
        // Verifica se o token está realmente expirado antes de deslogar
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        const reason = token && isTokenExpired(token) ? 'expired' : 'unauthorized';
        console.error(`[api] ${_consecutive401Count} erros 401 consecutivos — logout (${reason})`);
        triggerLogout(reason);
      }
    }

    return Promise.reject(error);
  }
);

// ─── Helpers de URL ─────────────────────────────────────────────────────────

/** URL base da API — centralizado para evitar hardcode em cada componente */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';

/** Gera URL completa para o endpoint de mídia */
export function getMediaUrl(messageId: string, download = false): string {
  return `${API_BASE_URL}/media/${messageId}${download ? '?dl=1' : ''}`;
}

export default api;
