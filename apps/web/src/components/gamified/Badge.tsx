'use client';

import type { LucideIcon } from 'lucide-react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface BadgeProps {
  icon: LucideIcon;
  label: string;
  description?: string;
  rarity?: BadgeRarity;
  earned?: boolean;
  /** 0..1 — when shown but not yet earned, fills a progress arc visually. */
  progress?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}

const SIZE = {
  sm: { box: 'w-12 h-12', icon: 18 },
  md: { box: 'w-16 h-16', icon: 24 },
  lg: { box: 'w-20 h-20', icon: 32 },
} as const;

export function Badge({
  icon: Icon,
  label,
  description,
  rarity = 'common',
  earned = true,
  progress,
  size = 'md',
  className,
  onClick,
}: BadgeProps) {
  const sz = SIZE[size];
  const showLock = !earned && (progress === undefined || progress < 1);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex flex-col items-center gap-1.5 text-center',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg',
        onClick ? 'cursor-pointer' : 'cursor-default',
        className,
      )}
      aria-label={`${label}${earned ? '' : ' (bloqueada)'}`}
      title={description ?? label}
    >
      <span
        className={cn(
          `rarity-${rarity}`,
          'relative flex items-center justify-center rounded-full transition-transform',
          'bg-card',
          sz.box,
          earned ? 'rarity-ring' : 'border-2 border-border opacity-60 grayscale',
          onClick && 'group-hover:scale-105 group-active:scale-95',
        )}
        style={earned ? { color: 'var(--rarity-c)' } : undefined}
      >
        {showLock ? (
          <Lock size={sz.icon * 0.7} className="text-muted-foreground" strokeWidth={2} />
        ) : (
          <Icon size={sz.icon} strokeWidth={2} />
        )}

        {progress !== undefined && progress > 0 && progress < 1 && (
          <svg className="absolute inset-0 -rotate-90 w-full h-full pointer-events-none" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="var(--rarity-c)"
              strokeWidth="4"
              strokeDasharray={`${progress * 289} 289`}
              strokeLinecap="round"
              opacity="0.7"
            />
          </svg>
        )}
      </span>
      <span className={cn(
        'text-[11px] leading-tight font-semibold max-w-[88px] line-clamp-2',
        earned ? 'text-foreground' : 'text-muted-foreground',
      )}>
        {label}
      </span>
    </button>
  );
}
