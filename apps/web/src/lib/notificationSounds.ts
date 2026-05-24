export type SoundId = 'ding' | 'chime' | 'pop' | 'swoosh' | 'bell';

export interface SoundDef {
  id: SoundId;
  label: string;
  description: string;
}

export const NOTIFICATION_SOUNDS: SoundDef[] = [
  { id: 'ding',   label: 'Ding',       description: 'Sino simples e suave' },
  { id: 'chime',  label: 'Chime',      description: 'Dois tons ascendentes' },
  { id: 'pop',    label: 'Pop',        description: 'Bolha leve' },
  { id: 'swoosh', label: 'Swoosh',     description: 'Varredura ascendente' },
  { id: 'bell',   label: 'Sino Rico',  description: 'Sino com harmônicos' },
];

const STORAGE_KEY = 'notification_sound_id';

export function getNotificationSoundId(): SoundId {
  if (typeof window === 'undefined') return 'ding';
  return (localStorage.getItem(STORAGE_KEY) as SoundId) || 'ding';
}

export function setNotificationSoundId(id: SoundId): void {
  localStorage.setItem(STORAGE_KEY, id);
}

// ─── WAV generator ───────────────────────────────────────────────
// Gera um buffer WAV 16-bit mono diretamente em PCM (sem arquivo externo).

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function buildWav(samples: Float32Array, sampleRate: number): Blob {
  const numSamples = samples.length;
  const buf = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buf);
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);   // PCM
  view.setUint16(22, 1, true);   // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(view, 36, 'data');
  view.setUint32(40, numSamples * 2, true);
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

type Partial2 = { freq: number; vol: number };

function synthWav(
  partials: Partial2[],
  duration: number,
  sampleRate = 22050,
  attackTime = 0.005,
): Blob {
  const n = Math.floor(sampleRate * duration);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t / attackTime) * Math.exp(-t * 6);
    let s = 0;
    for (const { freq, vol } of partials) {
      s += Math.sin(2 * Math.PI * freq * t) * vol * env;
    }
    out[i] = s;
  }
  return buildWav(out, sampleRate);
}

// Sequenced synth — for arpeggios (XP, achievements). Each entry is
// {start, duration, partials}. Output is a single WAV file.
type SeqStep = { start: number; duration: number; partials: Partial2[]; attack?: number };
function synthSequence(steps: SeqStep[], totalDuration: number, sampleRate = 22050): Blob {
  const n = Math.floor(sampleRate * totalDuration);
  const out = new Float32Array(n);
  for (const step of steps) {
    const startSample = Math.floor(step.start * sampleRate);
    const stepSamples = Math.floor(step.duration * sampleRate);
    const attack = step.attack ?? 0.005;
    for (let i = 0; i < stepSamples && startSample + i < n; i++) {
      const t = i / sampleRate;
      const env = Math.min(1, t / attack) * Math.exp(-t * 5);
      let s = 0;
      for (const { freq, vol } of step.partials) {
        s += Math.sin(2 * Math.PI * freq * t) * vol * env;
      }
      out[startSample + i] += s;
    }
  }
  // soft-clip
  for (let i = 0; i < n; i++) {
    out[i] = Math.tanh(out[i] * 0.8);
  }
  return buildWav(out, sampleRate);
}

// Pre-generates WAV blobs for each sound at module load time.
function makeSounds(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const make = URL.createObjectURL;
  return {
    // ─── Notification sounds ──────────────────────────────
    ding:   make(synthWav([{ freq: 880, vol: 0.4 }], 0.9)),
    chime:  make(synthWav([{ freq: 659, vol: 0.3 }, { freq: 784, vol: 0.25 }], 0.8, 22050, 0.01)),
    pop:    make(synthWav([{ freq: 280, vol: 0.55 }], 0.12, 22050, 0.001)),
    swoosh: make(synthWav([{ freq: 350, vol: 0.3 }, { freq: 700, vol: 0.2 }, { freq: 1100, vol: 0.1 }], 0.35, 22050, 0.06)),
    bell:   make(synthWav([
      { freq: 440, vol: 0.40 }, { freq: 880, vol: 0.20 },
      { freq: 1100, vol: 0.15 }, { freq: 1320, vol: 0.10 },
    ], 1.4, 22050, 0.01)),

    // ─── Gamification sounds ──────────────────────────────
    // Quick blip + sparkle — earned XP
    xp_gain: make(synthSequence([
      { start: 0.00, duration: 0.12, partials: [{ freq: 880, vol: 0.35 }] },
      { start: 0.06, duration: 0.18, partials: [{ freq: 1320, vol: 0.25 }, { freq: 1760, vol: 0.15 }], attack: 0.003 },
    ], 0.30)),

    // Three-note ascending fanfare — unlocked an achievement
    achievement: make(synthSequence([
      { start: 0.00, duration: 0.18, partials: [{ freq: 523, vol: 0.35 }, { freq: 659, vol: 0.20 }] },
      { start: 0.14, duration: 0.18, partials: [{ freq: 659, vol: 0.35 }, { freq: 784, vol: 0.20 }] },
      { start: 0.28, duration: 0.45, partials: [{ freq: 988, vol: 0.40 }, { freq: 1319, vol: 0.25 }, { freq: 1568, vol: 0.15 }], attack: 0.008 },
    ], 0.80)),

    // Triumphant chord — leveled up
    level_up: make(synthSequence([
      { start: 0.00, duration: 0.16, partials: [{ freq: 523, vol: 0.30 }] },
      { start: 0.12, duration: 0.16, partials: [{ freq: 659, vol: 0.30 }] },
      { start: 0.24, duration: 0.16, partials: [{ freq: 784, vol: 0.30 }] },
      { start: 0.36, duration: 0.16, partials: [{ freq: 1047, vol: 0.30 }] },
      { start: 0.50, duration: 0.70, partials: [
        { freq: 523, vol: 0.28 }, { freq: 659, vol: 0.22 },
        { freq: 784, vol: 0.20 }, { freq: 1047, vol: 0.18 },
        { freq: 1568, vol: 0.10 },
      ], attack: 0.01 },
    ], 1.25)),

    // Single confident bell — streak day registered
    streak: make(synthSequence([
      { start: 0.00, duration: 0.30, partials: [{ freq: 698, vol: 0.40 }, { freq: 1047, vol: 0.20 }, { freq: 1397, vol: 0.10 }], attack: 0.005 },
      { start: 0.18, duration: 0.50, partials: [{ freq: 1047, vol: 0.25 }, { freq: 1568, vol: 0.15 }], attack: 0.005 },
    ], 0.75)),

    // Satisfying "done" — completed a quest/task
    quest_complete: make(synthSequence([
      { start: 0.00, duration: 0.10, partials: [{ freq: 1047, vol: 0.30 }] },
      { start: 0.08, duration: 0.30, partials: [{ freq: 1319, vol: 0.32 }, { freq: 1568, vol: 0.18 }] },
    ], 0.45)),
  };
}

const SOUND_URLS: Record<string, string> = makeSounds();

// ─── Audio element singleton ─────────────────────────────────────
// <audio> elements desbloqueados via user gesture não ficam suspensos
// como o AudioContext. O padrão é: play()+pause() no primeiro gesto
// do usuário para desbloquear; depois play() funciona de qualquer contexto.

let _audio: HTMLAudioElement | null = null;
let _unlocked = false;

function getAudio(soundUrl: string): HTMLAudioElement {
  if (!_audio) {
    _audio = new Audio(soundUrl);
  } else {
    _audio.src = soundUrl;
  }
  _audio.currentTime = 0;
  return _audio;
}

/**
 * Chame no primeiro clique/keydown do usuário para desbloquear o áudio.
 * Após isso, playNotificationSound() funciona a qualquer momento.
 */
export function unlockAudioContext(): void {
  if (_unlocked || typeof window === 'undefined') return;
  const soundId = getNotificationSoundId();
  const url = SOUND_URLS[soundId] || SOUND_URLS['ding'];
  if (!url) return;
  const audio = new Audio(url);
  audio.volume = 0.001;
  audio.play().then(() => {
    audio.pause();
    _unlocked = true;
  }).catch(() => { _unlocked = true; }); // mark as attempted even on error
}

export function playNotificationSound(soundId?: SoundId | string): void {
  if (typeof window === 'undefined') return;
  const id: string = soundId ?? getNotificationSoundId();
  const url = SOUND_URLS[id] || SOUND_URLS['ding'];
  if (!url) return;

  try {
    const audio = getAudio(url);
    audio.volume = 1;
    const p = audio.play();
    if (p) p.catch(() => {});
  } catch {
    // silently ignore
  }
}

// ─── Gamification sound API ──────────────────────────────────────
export type GameSoundId = 'xp_gain' | 'achievement' | 'level_up' | 'streak' | 'quest_complete';

const GAME_SOUNDS_ENABLED_KEY = 'game_sounds_enabled';

export function areGameSoundsEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(GAME_SOUNDS_ENABLED_KEY) !== '0';
}

export function setGameSoundsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GAME_SOUNDS_ENABLED_KEY, enabled ? '1' : '0');
}

/** Gamification cues use a dedicated audio element so they don't preempt the
 *  inbox notification sound when both fire at once. Volume is intentionally
 *  lower than notifications so XP feedback feels ambient, not intrusive. */
let _gameAudio: HTMLAudioElement | null = null;
export function playGameSound(id: GameSoundId, volume = 0.55): void {
  if (typeof window === 'undefined' || !areGameSoundsEnabled()) return;
  const url = SOUND_URLS[id];
  if (!url) return;
  try {
    if (!_gameAudio) _gameAudio = new Audio();
    _gameAudio.src = url;
    _gameAudio.currentTime = 0;
    _gameAudio.volume = volume;
    const p = _gameAudio.play();
    if (p) p.catch(() => {});
  } catch { /* ignore */ }
}
