'use client';

import { useEffect, useState } from 'react';

// ─── Types ───────────────────────────────────────────────────────
export type AchievementId =
  | 'first_message'
  | 'fast_responder'        // respondeu em <60s
  | 'inbox_zero'            // zerou a inbox em uma sessão
  | 'streak_3'              // 3 dias consecutivos
  | 'streak_7'              // 7 dias consecutivos
  | 'streak_30'             // 30 dias consecutivos
  | 'centurion'             // 100 mensagens enviadas
  | 'closer'                // ganhou um lead
  | 'night_owl'             // ativo após 22h
  | 'early_bird';           // ativo antes das 7h

export interface AchievementDef {
  id: AchievementId;
  label: string;
  description: string;
  xpReward: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
}

export const ACHIEVEMENTS: Record<AchievementId, AchievementDef> = {
  first_message:  { id: 'first_message',  label: 'Primeira Mensagem',  description: 'Respondeu a primeira mensagem do dia', xpReward: 25,  rarity: 'common' },
  fast_responder: { id: 'fast_responder', label: 'Resposta Relâmpago', description: 'Respondeu em menos de 60 segundos',     xpReward: 50,  rarity: 'rare' },
  inbox_zero:     { id: 'inbox_zero',     label: 'Inbox Zero',         description: 'Zerou a caixa de entrada',              xpReward: 200, rarity: 'epic' },
  streak_3:       { id: 'streak_3',       label: 'Combo x3',           description: 'Trabalhou 3 dias seguidos',             xpReward: 75,  rarity: 'rare' },
  streak_7:       { id: 'streak_7',       label: 'Semana Cheia',       description: 'Trabalhou 7 dias seguidos',             xpReward: 200, rarity: 'epic' },
  streak_30:      { id: 'streak_30',      label: 'Implacável',         description: 'Trabalhou 30 dias seguidos',            xpReward: 1000, rarity: 'legendary' },
  centurion:      { id: 'centurion',      label: 'Centurião',          description: 'Enviou 100 mensagens',                  xpReward: 150, rarity: 'rare' },
  closer:         { id: 'closer',         label: 'Closer',             description: 'Fechou um lead',                        xpReward: 500, rarity: 'legendary' },
  night_owl:      { id: 'night_owl',      label: 'Coruja',             description: 'Ativo depois das 22h',                  xpReward: 50,  rarity: 'rare' },
  early_bird:     { id: 'early_bird',     label: 'Madrugador',         description: 'Ativo antes das 7h',                    xpReward: 50,  rarity: 'rare' },
};

export interface GamificationState {
  xpTotal: number;
  level: number;
  xpInLevel: number;
  xpForNextLevel: number;
  streakDays: number;
  lastActiveDate: string | null;   // YYYY-MM-DD
  achievements: AchievementId[];
  messageCount: number;
}

// ─── Level curve ─────────────────────────────────────────────────
// 100, 250, 450, 700, 1000, 1350, ... (quadratic-ish growth)
export function xpForLevel(level: number): number {
  return Math.round(50 * level * (level + 1));
}

export function levelFromTotalXp(totalXp: number): { level: number; xpInLevel: number; xpForNextLevel: number } {
  let level = 1;
  let cumulative = 0;
  while (true) {
    const required = xpForLevel(level);
    if (cumulative + required > totalXp) {
      return {
        level,
        xpInLevel: totalXp - cumulative,
        xpForNextLevel: required,
      };
    }
    cumulative += required;
    level += 1;
    if (level > 999) return { level, xpInLevel: 0, xpForNextLevel: 999999 }; // safety
  }
}

// ─── Storage ─────────────────────────────────────────────────────
const STORAGE_KEY = 'gamification_state_v1';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

interface StoredState {
  xpTotal: number;
  streakDays: number;
  lastActiveDate: string | null;
  achievements: AchievementId[];
  messageCount: number;
}

const INITIAL: StoredState = {
  xpTotal: 0,
  streakDays: 0,
  lastActiveDate: null,
  achievements: [],
  messageCount: 0,
};

function loadState(): StoredState {
  if (typeof window === 'undefined') return INITIAL;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL;
    const parsed = JSON.parse(raw) as StoredState;
    return {
      xpTotal: Number(parsed.xpTotal) || 0,
      streakDays: Number(parsed.streakDays) || 0,
      lastActiveDate: typeof parsed.lastActiveDate === 'string' ? parsed.lastActiveDate : null,
      achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
      messageCount: Number(parsed.messageCount) || 0,
    };
  } catch {
    return INITIAL;
  }
}

function saveState(state: StoredState): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

// ─── Event bus ───────────────────────────────────────────────────
// Cross-component coordination: hooks subscribe to "game" events so any
// component (XP HUD, achievement toast queue) reacts to actions fired
// anywhere in the app.
type GameEvent =
  | { kind: 'xp'; amount: number; reason?: string }
  | { kind: 'achievement'; id: AchievementId }
  | { kind: 'level_up'; level: number };

type Listener = (e: GameEvent) => void;
const listeners = new Set<Listener>();

export function onGameEvent(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(e: GameEvent): void {
  listeners.forEach((fn) => { try { fn(e); } catch { /* ignore */ } });
}

// ─── Public API ──────────────────────────────────────────────────
export function awardXp(amount: number, reason?: string): void {
  if (typeof window === 'undefined' || amount <= 0) return;
  const prev = loadState();
  const prevLevel = levelFromTotalXp(prev.xpTotal).level;
  const next: StoredState = { ...prev, xpTotal: prev.xpTotal + amount };
  saveState(next);
  emit({ kind: 'xp', amount, reason });
  const newLevel = levelFromTotalXp(next.xpTotal).level;
  if (newLevel > prevLevel) emit({ kind: 'level_up', level: newLevel });
}

export function unlockAchievement(id: AchievementId): boolean {
  if (typeof window === 'undefined') return false;
  const prev = loadState();
  if (prev.achievements.includes(id)) return false;
  const def = ACHIEVEMENTS[id];
  if (!def) return false;
  const next: StoredState = {
    ...prev,
    achievements: [...prev.achievements, id],
    xpTotal: prev.xpTotal + def.xpReward,
  };
  saveState(next);
  emit({ kind: 'achievement', id });
  emit({ kind: 'xp', amount: def.xpReward, reason: `achievement:${id}` });
  const prevLevel = levelFromTotalXp(prev.xpTotal).level;
  const newLevel = levelFromTotalXp(next.xpTotal).level;
  if (newLevel > prevLevel) emit({ kind: 'level_up', level: newLevel });
  return true;
}

export function registerActivity(): void {
  if (typeof window === 'undefined') return;
  const prev = loadState();
  const today = todayKey();
  if (prev.lastActiveDate === today) return;

  let newStreak = 1;
  if (prev.lastActiveDate) {
    const diff = dayDiff(prev.lastActiveDate, today);
    if (diff === 1) newStreak = prev.streakDays + 1;
    else if (diff <= 0) newStreak = prev.streakDays || 1; // clock skew safety
    else newStreak = 1;
  }

  const next: StoredState = { ...prev, lastActiveDate: today, streakDays: newStreak };
  saveState(next);

  if (newStreak === 3) unlockAchievement('streak_3');
  if (newStreak === 7) unlockAchievement('streak_7');
  if (newStreak === 30) unlockAchievement('streak_30');

  const hour = new Date().getHours();
  if (hour >= 22) unlockAchievement('night_owl');
  if (hour < 7) unlockAchievement('early_bird');
}

export function incrementMessageCount(by = 1): void {
  if (typeof window === 'undefined') return;
  const prev = loadState();
  const next: StoredState = { ...prev, messageCount: prev.messageCount + by };
  saveState(next);
  if (prev.messageCount < 100 && next.messageCount >= 100) {
    unlockAchievement('centurion');
  }
}

// ─── Hook ────────────────────────────────────────────────────────
export function useGamification(): GamificationState & {
  awardXp: typeof awardXp;
  unlockAchievement: typeof unlockAchievement;
  registerActivity: typeof registerActivity;
} {
  // Lazy init reads localStorage on first client render. The effect only
  // subscribes to external sources (events + cross-tab storage) — no
  // setState-in-effect anti-pattern.
  const [stored, setStored] = useState<StoredState>(loadState);

  useEffect(() => {
    // registerActivity() may emit a 'xp' event which our listener below will
    // catch and refresh `stored` — so we don't have to setState here.
    registerActivity();

    const off = onGameEvent(() => setStored(loadState()));
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setStored(loadState());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      off();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const { level, xpInLevel, xpForNextLevel } = levelFromTotalXp(stored.xpTotal);

  return {
    xpTotal: stored.xpTotal,
    level,
    xpInLevel,
    xpForNextLevel,
    streakDays: stored.streakDays,
    lastActiveDate: stored.lastActiveDate,
    achievements: stored.achievements,
    messageCount: stored.messageCount,
    // These are module-level functions, so their identity is already stable
    // for the lifetime of the app — no useCallback needed.
    awardXp,
    unlockAchievement,
    registerActivity,
  };
}
