'use client';

import { Sparkles, Trophy, Zap, Award, Star, Crown, Flame, Rocket } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useGamification, ACHIEVEMENTS, type AchievementId } from '@/lib/gamification';
import { XPBar } from '@/components/gamified/XPBar';
import { StreakCounter } from '@/components/gamified/StreakCounter';
import { Badge } from '@/components/gamified/Badge';

const ACHIEVEMENT_ICON: Record<AchievementId, LucideIcon> = {
  first_message:  Zap,
  fast_responder: Rocket,
  inbox_zero:     Sparkles,
  streak_3:       Flame,
  streak_7:       Flame,
  streak_30:      Crown,
  centurion:      Award,
  closer:         Trophy,
  night_owl:      Star,
  early_bird:     Star,
};

export function JourneyStrip() {
  const game = useGamification();

  // Show 5 badges: earned first (most recent), then ones in progress
  const earnedSet = new Set(game.achievements);
  const allIds = Object.keys(ACHIEVEMENTS) as AchievementId[];
  const earned = game.achievements.slice(-5).reverse();
  const remainingSlots = Math.max(0, 5 - earned.length);
  const locked = allIds.filter((id) => !earnedSet.has(id)).slice(0, remainingSlots);

  return (
    <div className="card-holographic rounded-2xl bg-card border border-border p-4 md:p-5 relative overflow-hidden">
      {/* corner gradient flair */}
      <div
        aria-hidden
        className="absolute -top-24 -right-24 w-64 h-64 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, var(--neon-magenta) 0%, transparent 65%)',
          opacity: 0.12,
        }}
      />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
        {/* Level + XP */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
              Sua Jornada
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground tabular-nums">
              {game.xpTotal.toLocaleString('pt-BR')} XP totais
            </span>
          </div>
          <XPBar
            level={game.level}
            xp={game.xpInLevel}
            xpForNextLevel={game.xpForNextLevel}
          />
        </div>

        {/* Streak */}
        <div className="flex flex-col items-center md:items-end gap-1 md:border-l md:border-border md:pl-6 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Sequência
          </span>
          <StreakCounter days={game.streakDays} />
        </div>

        {/* Badges */}
        {(earned.length > 0 || locked.length > 0) && (
          <div className="flex flex-col items-center md:items-start gap-1 md:border-l md:border-border md:pl-6 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Conquistas
            </span>
            <div className="flex items-center gap-2">
              {earned.map((id) => {
                const def = ACHIEVEMENTS[id];
                return (
                  <Badge
                    key={id}
                    icon={ACHIEVEMENT_ICON[id] ?? Trophy}
                    label={def.label}
                    description={def.description}
                    rarity={def.rarity}
                    size="sm"
                  />
                );
              })}
              {locked.map((id) => {
                const def = ACHIEVEMENTS[id];
                return (
                  <Badge
                    key={id}
                    icon={ACHIEVEMENT_ICON[id] ?? Trophy}
                    label={def.label}
                    description={def.description}
                    rarity={def.rarity}
                    size="sm"
                    earned={false}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
