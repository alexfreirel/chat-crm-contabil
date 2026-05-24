'use client';

import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  /** Percentage delta vs previous period (e.g. 12.5 = +12.5%). */
  deltaPct?: number;
  /** Color accent: cyan (default), magenta, amber, quest. */
  accent?: 'cyan' | 'magenta' | 'amber' | 'quest';
  /** When true, numeric values count up from 0 on mount. */
  animateValue?: boolean;
  hint?: string;
  className?: string;
}

const ACCENT_VAR: Record<NonNullable<StatCardProps['accent']>, string> = {
  cyan: 'var(--neon-cyan)',
  magenta: 'var(--neon-magenta)',
  amber: 'var(--neon-amber)',
  quest: 'var(--color-quest)',
};

function useCountUp(target: number, enabled: boolean, durationMs = 900): number {
  // Lazy init: skipping the animation case fills the initial render with the
  // final value, avoiding a setState-in-effect for the disabled path.
  const [val, setVal] = useState<number>(() => (enabled && Number.isFinite(target) ? 0 : target));
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !Number.isFinite(target)) return;
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const elapsed = ts - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      // setState inside RAF callback is treated as external sync, not
      // synchronous render — react-hooks/set-state-in-effect doesn't flag it.
      setVal(t < 1 ? target * eased : target);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, enabled, durationMs]);

  return val;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  deltaPct,
  accent = 'cyan',
  animateValue = true,
  hint,
  className,
}: StatCardProps) {
  const numericTarget = typeof value === 'number' ? value : NaN;
  const animatedValue = useCountUp(numericTarget, animateValue && Number.isFinite(numericTarget));
  const accentColor = ACCENT_VAR[accent];

  const displayValue = typeof value === 'number'
    ? Math.round(animatedValue).toLocaleString('pt-BR')
    : value;

  const deltaIsPositive = (deltaPct ?? 0) > 0;
  const deltaIsZero = (deltaPct ?? 0) === 0;
  const TrendIcon = deltaIsZero ? Minus : deltaIsPositive ? TrendingUp : TrendingDown;

  return (
    <div
      className={cn(
        'card-holographic relative rounded-xl bg-card border border-border p-4 overflow-hidden',
        'transition-all hover:-translate-y-0.5',
        className,
      )}
    >
      {/* corner accent */}
      <span
        className="absolute -top-12 -right-12 w-28 h-28 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${accentColor} 0%, transparent 65%)`, opacity: 0.18 }}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-3 relative z-10">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {label}
          </div>
          <div
            className="mt-1.5 text-3xl font-black tabular-nums leading-none"
            style={{ color: accentColor, textShadow: `0 0 12px color-mix(in srgb, ${accentColor} 35%, transparent)` }}
          >
            {displayValue}
          </div>
          {hint && (
            <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>
          )}
        </div>

        {Icon && (
          <div
            className="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg"
            style={{
              background: `color-mix(in srgb, ${accentColor} 14%, transparent)`,
              color: accentColor,
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accentColor} 30%, transparent)`,
            }}
          >
            <Icon size={20} strokeWidth={2} />
          </div>
        )}
      </div>

      {deltaPct !== undefined && (
        <div
          className={cn(
            'mt-3 inline-flex items-center gap-1 text-xs font-semibold relative z-10',
            deltaIsZero ? 'text-muted-foreground' : deltaIsPositive ? 'text-[color:var(--color-quest)]' : 'text-destructive',
          )}
        >
          <TrendIcon size={13} strokeWidth={2.5} />
          <span>{deltaIsPositive ? '+' : ''}{deltaPct.toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}
