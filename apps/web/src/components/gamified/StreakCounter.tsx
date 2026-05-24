'use client';

import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StreakCounterProps {
  days: number;
  className?: string;
  compact?: boolean;
  /** Whether the flame should flicker. Defaults to true when days > 0. */
  animate?: boolean;
}

export function StreakCounter({ days, className, compact, animate }: StreakCounterProps) {
  const active = days > 0;
  const shouldAnimate = animate ?? active;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 font-bold tabular-nums select-none',
        compact ? 'text-xs' : 'text-sm',
        className,
      )}
      title={active ? `Sequência de ${days} ${days === 1 ? 'dia' : 'dias'}` : 'Sem sequência ativa'}
    >
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-lg',
          compact ? 'w-6 h-6' : 'w-8 h-8',
          active ? 'streak-flame text-white' : 'bg-bg-tertiary text-muted-foreground',
          shouldAnimate && 'animate-flame',
        )}
      >
        <Flame size={compact ? 13 : 16} strokeWidth={2.5} />
      </span>
      <span
        className={cn(
          'leading-none',
          active ? 'text-glow-amber' : 'text-muted-foreground',
        )}
        style={active ? { color: 'var(--neon-amber)' } : undefined}
      >
        {days}
      </span>
    </div>
  );
}
