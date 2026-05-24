'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { Trophy, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { playGameSound } from '@/lib/notificationSounds';
import type { BadgeRarity } from './Badge';

export interface AchievementToastProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: LucideIcon;
  rarity?: BadgeRarity;
  xpReward?: number;
  /** Auto-dismiss after this many ms. 0 = never. Default 4500. */
  duration?: number;
}

export function AchievementToast({
  open,
  onClose,
  title,
  description,
  icon: Icon = Trophy,
  rarity = 'rare',
  xpReward,
  duration = 4500,
}: AchievementToastProps) {
  useEffect(() => {
    if (!open) return;
    playGameSound('achievement');
    if (duration <= 0) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [open, duration, onClose]);

  if (!open || typeof window === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-x-0 top-6 z-[9999] flex justify-center pointer-events-none">
      <div
        className={cn(
          `rarity-${rarity}`,
          'animate-achievement-pop pointer-events-auto rarity-ring',
          'flex items-center gap-3 px-4 py-3 rounded-xl bg-card/95 backdrop-blur-md',
          'min-w-[300px] max-w-[440px] shadow-2xl',
        )}
        role="alert"
      >
        <div
          className="relative flex items-center justify-center w-12 h-12 rounded-lg shrink-0"
          style={{ background: 'color-mix(in srgb, var(--rarity-c) 18%, transparent)', color: 'var(--rarity-c)' }}
        >
          <Icon size={26} strokeWidth={2} />
          <span className="absolute inset-0 rounded-lg animate-pulse-ring pointer-events-none" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: 'var(--rarity-c)' }}
            >
              Conquista desbloqueada
            </span>
            {xpReward !== undefined && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{
                  background: 'color-mix(in srgb, var(--color-xp-end) 22%, transparent)',
                  color: 'var(--color-xp-end)',
                }}
              >
                +{xpReward} XP
              </span>
            )}
          </div>
          <div className="text-sm font-bold text-foreground truncate">{title}</div>
          {description && (
            <div className="text-xs text-muted-foreground line-clamp-2">{description}</div>
          )}
        </div>

        <button
          onClick={onClose}
          aria-label="Fechar"
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0 -mr-1"
        >
          <X size={16} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
