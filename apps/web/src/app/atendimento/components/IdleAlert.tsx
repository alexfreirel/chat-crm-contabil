'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlarmClock, Coffee, ListChecks, Loader2, Moon, Toilet } from 'lucide-react';
import api from '@/lib/api';
import { useRole } from '@/lib/useRole';
import { showError } from '@/lib/toast';

const IDLE_LIMIT_MS = 10 * 60_000;
const POLL_MS = 30_000;

interface IdleStatus {
  inWorkHours: boolean;
  busy: boolean;
  idleSince: string | null;
}

/**
 * Alerta em tela cheia para o assistente que ficou 10 min sem tarefa em execução
 * e sem pausa. Some quando ele inicia uma tarefa ou registra lanche / banheiro /
 * "estou ocioso" (esta última confirma que realmente não há o que fazer).
 */
export function IdleAlert() {
  const { isAssistente } = useRole();
  const router = useRouter();
  const [status, setStatus] = useState<IdleStatus | null>(null);
  const [, tick] = useState(0);
  const [busy, setBusy] = useState(false);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/tasks/time/idle-status');
      if (aliveRef.current) setStatus(res.data);
    } catch {
      /* mantém o último estado */
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    if (!isAssistente) return;
    load();
    const poll = setInterval(load, POLL_MS);
    const clock = setInterval(() => tick(n => n + 1), 15_000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      aliveRef.current = false;
      clearInterval(poll);
      clearInterval(clock);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAssistente, load]);

  if (!isAssistente || !status || !status.inWorkHours || status.busy || !status.idleSince) return null;
  const idleMs = Date.now() - new Date(status.idleSince).getTime();
  if (idleMs < IDLE_LIMIT_MS) return null;

  const pause = async (kind: 'LANCHE' | 'BANHEIRO' | 'OCIOSO') => {
    setBusy(true);
    try {
      await api.post('/tasks/time/pause', { kind });
      setStatus({ inWorkHours: true, busy: true, idleSince: null });
      window.dispatchEvent(new Event('time-control:refresh'));
    } catch {
      showError('Não foi possível registrar. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  const minutes = Math.floor(idleMs / 60_000);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl p-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15 text-red-400">
          <AlarmClock size={28} />
        </div>
        <h2 className="text-lg font-bold text-foreground">Você está ocioso há {minutes} min</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Informe a tarefa que está executando (inicie-a no painel) ou registre uma pausa.
          Se realmente não há o que fazer, use &quot;Estou ocioso&quot;.
        </p>

        <div className="mt-5 grid gap-2">
          <button
            onClick={() => router.push('/atendimento/dashboard')}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90"
          >
            <ListChecks size={16} /> Informar tarefa em execução
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => pause('LANCHE')}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-50"
            >
              <Coffee size={15} /> Lanche
            </button>
            <button
              onClick={() => pause('BANHEIRO')}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-50"
            >
              <Toilet size={15} /> Banheiro
            </button>
          </div>
          <button
            onClick={() => pause('OCIOSO')}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-400 hover:bg-amber-500/20 disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Moon size={15} />}
            Estou ocioso (sem o que fazer)
          </button>
        </div>
      </div>
    </div>
  );
}
