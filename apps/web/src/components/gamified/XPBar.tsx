'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { playGameSound } from '@/lib/notificationSounds';

export interface XPBarProps {
  level: number;
  xp: number;
  xpForNextLevel: number;
  className?: string;
  compact?: boolean;
  /** Plays xp_gain sound + floating "+N XP" pulse when xp increases. */
  cue?: boolean;
}

export function XPBar({ level, xp, xpForNextLevel, className, compact, cue = true }: XPBarProps) {
  const pct = Math.max(0, Math.min(100, (xp / Math.max(1, xpForNextLevel)) * 100));
  const prevXp = useRef(xp);
  const [pulse, setPulse] = useState<{ id: number; amount: number } | null>(null);
  const pulseId = useRef(0);

  useEffect(() => {
    if (!cue) {
      prevXp.current = xp;
      return;
    }
    const delta = xp - prevXp.current;
    if (delta > 0) {
      pulseId.current += 1;
      setPulse({ id: pulseId.current, amount: delta });
      playGameSound('xp_gain');
      const t = setTimeout(() => setPulse(null), 1300);
      prevXp.current = xp;
      return () => clearTimeout(t);
    }
    prevXp.current = xp;
  }, [xp, cue]);

  return (
    <div className={cn('relative flex items-center gap-2', className)}>
      <div
        className={cn(
          'flex items-center justify-center rounded-full font-bold text-white shrink-0',
          'bg-gradient-to-br from-[var(--color-xp-start)] to-[var(--color-xp-end)] glow-cyan',
          compact ? 'w-7 h-7 text-[11px]' : 'w-10 h-10 text-sm',
        )}
        aria-label={`Nível ${level}`}
      >
        {level}
      </div>

      <div className="flex-1 min-w-0">
        {!compact && (
          <div className="flex items-center justify-between text-[11px] mb-1 text-muted-foreground tabular-nums">
            <span className="font-semibold uppercase tracking-wider text-text-secondary">XP</span>
            <span>{xp.toLocaleString('pt-BR')} / {xpForNextLevel.toLocaleString('pt-BR')}</span>
          </div>
        )}
        <div className={cn('xp-bar-track', compact ? 'h-1.5' : 'h-2.5')}>
          <div className="xp-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {pulse && (
        <span
          key={pulse.id}
          className="absolute right-0 -top-2 animate-xp-pulse pointer-events-none text-xs font-bold text-glow-cyan"
          style={{ color: 'var(--neon-cyan)' }}
        >
          +{pulse.amount} XP
        </span>
      )}
    </div>
  );
}
