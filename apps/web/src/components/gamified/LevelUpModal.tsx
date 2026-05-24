'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { playGameSound } from '@/lib/notificationSounds';

export interface LevelUpModalProps {
  open: boolean;
  level: number;
  onClose: () => void;
  /** Headline shown above the level. Defaults to "Você subiu de nível". */
  headline?: string;
  /** Optional perks / rewards to display under the level. */
  perks?: string[];
}

interface Particle {
  left: number;
  delay: number;
  duration: number;
  size: number;
  hue: number;
}

function makeParticles(): Particle[] {
  return Array.from({ length: 36 }, () => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    duration: 2.5 + Math.random() * 2.5,
    size: 3 + Math.random() * 6,
    hue: Math.random() < 0.5 ? 190 : 290,
  }));
}

/** Mounted only while `open` is true — lazy initializer generates a fresh
 *  particle set per appearance without triggering setState-in-effect. */
function ParticlesLayer() {
  const [particles] = useState<Particle[]>(makeParticles);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute bottom-0 rounded-full"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            background: `hsl(${p.hue}, 95%, 65%)`,
            boxShadow: `0 0 8px hsl(${p.hue}, 95%, 65%)`,
            animation: `level-particle ${p.duration}s ${p.delay}s ease-out forwards`,
          }}
        />
      ))}
    </div>
  );
}

export function LevelUpModal({ open, level, onClose, headline = 'Você subiu de nível', perks }: LevelUpModalProps) {
  useEffect(() => {
    if (!open) return;
    playGameSound('level_up');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof window === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* particles — sub-component remounts per appearance */}
      <ParticlesLayer />

      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'relative animate-level-up bg-card border border-border rounded-2xl px-10 py-8 max-w-md w-[92%]',
          'shadow-[0_0_60px_rgba(168,85,247,0.4),0_0_120px_rgba(34,211,238,0.3)]',
          'card-holographic',
        )}
      >
        <div className="flex flex-col items-center text-center gap-3">
          <Sparkles className="animate-spin-slow" size={28} style={{ color: 'var(--neon-amber)' }} />
          <div className="text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground">
            {headline}
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Nível</span>
            <span className="text-7xl font-black tabular-nums text-holographic leading-none">
              {level}
            </span>
          </div>

          {perks && perks.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-sm">
              {perks.map((perk, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 text-text-secondary"
                >
                  <Sparkles size={14} style={{ color: 'var(--neon-cyan)' }} />
                  {perk}
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={onClose}
            className={cn(
              'mt-4 px-6 py-2 rounded-lg font-bold text-sm',
              'bg-gradient-to-r from-[var(--color-xp-start)] to-[var(--color-xp-end)]',
              'text-white glow-magenta hover:scale-105 active:scale-95 transition-transform',
            )}
          >
            Continuar
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes level-particle {
          0%   { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-110vh) scale(0.3); opacity: 0; }
        }
      `}</style>
    </div>,
    document.body,
  );
}
