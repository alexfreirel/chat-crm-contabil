'use client';

import { useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import { ACHIEVEMENTS, onGameEvent, useGamification, type AchievementId } from '@/lib/gamification';
import { AchievementToast } from './AchievementToast';
import { LevelUpModal } from './LevelUpModal';
import { XPBar } from './XPBar';
import { StreakCounter } from './StreakCounter';
import { cn } from '@/lib/utils';

interface ToastItem {
  key: number;
  id: AchievementId;
}

export interface GameHudProps {
  /** Where to dock the XP/streak HUD. Pass null to hide the HUD (toasts only). */
  position?: 'top-right' | 'bottom-right' | null;
  className?: string;
}

export function GameHud({ position = 'bottom-right', className }: GameHudProps) {
  const state = useGamification();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const keyRef = useRef(0);

  useEffect(() => {
    return onGameEvent((e) => {
      if (e.kind === 'achievement') {
        keyRef.current += 1;
        setToasts((prev) => [...prev, { key: keyRef.current, id: e.id }]);
      } else if (e.kind === 'level_up') {
        setLevelUp(e.level);
      }
    });
  }, []);

  const closeToast = (key: number) =>
    setToasts((prev) => prev.filter((t) => t.key !== key));

  const dockClasses = position === 'top-right'
    ? 'top-4 right-4'
    : position === 'bottom-right'
    ? 'bottom-4 right-4'
    : '';

  return (
    <>
      {position && (
        <div
          className={cn(
            'fixed z-[9000] pointer-events-none',
            dockClasses,
            className,
          )}
        >
          <div className="pointer-events-auto flex items-center gap-3 px-3 py-2 rounded-full bg-card/95 backdrop-blur-md border border-border shadow-xl min-w-[240px]">
            <XPBar
              level={state.level}
              xp={state.xpInLevel}
              xpForNextLevel={state.xpForNextLevel}
              compact
              className="flex-1"
            />
            <StreakCounter days={state.streakDays} compact />
          </div>
        </div>
      )}

      {toasts.map((t) => {
        const def = ACHIEVEMENTS[t.id];
        return (
          <AchievementToast
            key={t.key}
            open
            onClose={() => closeToast(t.key)}
            title={def.label}
            description={def.description}
            rarity={def.rarity}
            icon={Trophy}
            xpReward={def.xpReward}
          />
        );
      })}

      <LevelUpModal
        open={levelUp !== null}
        level={levelUp ?? 1}
        onClose={() => setLevelUp(null)}
      />
    </>
  );
}
