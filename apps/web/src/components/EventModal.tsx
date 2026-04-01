'use client';

/**
 * EventModal — Modal completo de criação de evento de calendário vinculado a um processo.
 * Compartilhado entre TabTarefas (workspace) e processos/page.tsx (painel lateral).
 */

import { useState } from 'react';
import {
  X, MapPin, User, Bell, ChevronDown, AlertTriangle, Flag,
  Loader2, Calendar as CalendarIcon,
} from 'lucide-react';
import api from '@/lib/api';
import { showError, showSuccess } from '@/lib/toast';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface UserOption { id: string; name: string; }

// ─── Constantes ─────────────────────────────────────────────────────────────

export const EVENT_TYPES = [
  { id: 'TAREFA',    label: 'Tarefa',    emoji: '✅', color: 'text-green-400',  bg: 'bg-green-400/10'  },
  { id: 'AUDIENCIA', label: 'Audiência', emoji: '⚖️', color: 'text-red-400',    bg: 'bg-red-400/10'    },
  { id: 'PRAZO',     label: 'Prazo',     emoji: '🕐', color: 'text-amber-400',  bg: 'bg-amber-400/10'  },
  { id: 'CONSULTA',  label: 'Consulta',  emoji: '🟣', color: 'text-purple-400', bg: 'bg-purple-400/10' },
  { id: 'OUTRO',     label: 'Outro',     emoji: '📌', color: 'text-muted-foreground', bg: 'bg-accent/50' },
] as const;

const PRIORITIES = [
  { id: 'BAIXA',   label: 'Baixa',   color: 'text-muted-foreground' },
  { id: 'NORMAL',  label: 'Normal',  color: 'text-blue-400'  },
  { id: 'ALTA',    label: 'Alta',    color: 'text-amber-400' },
  { id: 'URGENTE', label: 'Urgente', color: 'text-red-400'   },
] as const;

const REMINDER_OPTIONS = [
  { value: 15,   label: '15 min antes' },
  { value: 30,   label: '30 min antes' },
  { value: 60,   label: '1 hora antes' },
  { value: 1440, label: '1 dia antes'  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function typeInfo(type: string) {
  return EVENT_TYPES.find(t => t.id === type) ?? EVENT_TYPES[4];
}

function localInputToISO(local: string): string {
  const [datePart, timePart = '00:00'] = local.replace('T', ' ').split(' ');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, 0)).toISOString();
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface EventModalProps {
  caseId: string;
  lawyerId?: string;
  users: UserOption[];
  onClose: () => void;
  onCreated: () => void;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function EventModal({ caseId, lawyerId = '', users, onClose, onCreated }: EventModalProps) {
  const now = new Date();
  const padded = (n: number) => String(n).padStart(2, '0');
  const todayLocal = `${now.getUTCFullYear()}-${padded(now.getUTCMonth() + 1)}-${padded(now.getUTCDate())}`;

  const [type, setType] = useState<string>('TAREFA');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayLocal);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [timeError, setTimeError] = useState(false);
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [assignedUserId, setAssignedUserId] = useState(lawyerId);
  const [reminders, setReminders] = useState<{ minutes_before: number; channel: string }[]>([
    { minutes_before: 30, channel: 'WHATSAPP' },
  ]);
  const [saving, setSaving] = useState(false);

  const toggleReminder = (minutes: number, channel: string) => {
    const key = `${minutes}-${channel}`;
    setReminders(prev => {
      const exists = prev.some(r => `${r.minutes_before}-${r.channel}` === key);
      if (exists) return prev.filter(r => `${r.minutes_before}-${r.channel}` !== key);
      return [...prev, { minutes_before: minutes, channel }];
    });
  };

  const handleSave = async () => {
    if (!title.trim() || !date) return;
    if (!allDay && (!startTime || !endTime)) {
      setTimeError(true);
      return;
    }
    setTimeError(false);
    setSaving(true);
    try {
      const startISO = allDay
        ? new Date(Date.UTC(...(date.split('-').map(Number) as [number, number, number]), 0, 0, 0)).toISOString()
        : localInputToISO(`${date} ${startTime}`);
      const endISO = allDay ? undefined : localInputToISO(`${date} ${endTime}`);

      await api.post('/calendar/events', {
        type,
        title: title.trim(),
        description: description.trim() || undefined,
        start_at: startISO,
        end_at: endISO,
        all_day: allDay,
        location: location.trim() || undefined,
        priority,
        assigned_user_id: assignedUserId || undefined,
        legal_case_id: caseId,
        reminders: reminders.length > 0 ? reminders : undefined,
      });

      showSuccess('Evento criado');
      onCreated();
      onClose();
    } catch {
      showError('Erro ao criar evento');
    } finally {
      setSaving(false);
    }
  };

  const ti = typeInfo(type);

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[301] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="shrink-0 flex items-center gap-3 px-5 py-4 border-b border-border">
            <span className="text-xl">{ti.emoji}</span>
            <h2 className="flex-1 text-sm font-bold text-foreground">Novo Evento no Processo</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-4">

            {/* Tipo */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Tipo</label>
              <div className="flex flex-wrap gap-1.5">
                {EVENT_TYPES.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setType(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      type === t.id
                        ? `${t.bg} ${t.color} border-current`
                        : 'border-border text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    <span>{t.emoji}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Título */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Título *</label>
              <input
                autoFocus
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder={`Ex: ${type === 'AUDIENCIA' ? 'Audiência de Instrução' : type === 'PRAZO' ? 'Prazo contestação' : type === 'CONSULTA' ? 'Consulta com cliente' : 'Revisar documentos'}`}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-primary/25"
              />
            </div>

            {/* Descrição */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Descrição</label>
              <textarea
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Detalhes adicionais..."
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-primary/25 resize-none"
              />
            </div>

            {/* Data e horário */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className={`text-xs font-semibold ${timeError && !allDay ? 'text-red-400' : 'text-muted-foreground'}`}>
                  Data e Horário *
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={e => { setAllDay(e.target.checked); setTimeError(false); }}
                    className="w-3.5 h-3.5 rounded"
                  />
                  Dia inteiro
                </label>
              </div>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/25"
                />
                {!allDay && (
                  <>
                    <input
                      type="time"
                      value={startTime}
                      onChange={e => { setStartTime(e.target.value); if (e.target.value) setTimeError(false); }}
                      className={`w-28 px-3 py-2 rounded-xl border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/25 ${timeError && !startTime ? 'border-red-400 ring-2 ring-red-400/25' : 'border-border'}`}
                    />
                    <span className="flex items-center text-muted-foreground text-xs">até</span>
                    <input
                      type="time"
                      value={endTime}
                      onChange={e => { setEndTime(e.target.value); if (e.target.value) setTimeError(false); }}
                      className={`w-28 px-3 py-2 rounded-xl border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/25 ${timeError && !endTime ? 'border-red-400 ring-2 ring-red-400/25' : 'border-border'}`}
                    />
                  </>
                )}
              </div>
              {timeError && !allDay && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertTriangle size={11} /> Horário de início e fim são obrigatórios
                </p>
              )}
            </div>

            {/* Localização */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                <MapPin size={11} />
                Local / Sala
                {type !== 'AUDIENCIA' && <span className="font-normal opacity-60">(opcional)</span>}
              </label>
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder={type === 'AUDIENCIA' ? 'Ex: Vara do Trabalho — Sala 3' : 'Local ou link de reunião'}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-primary/25"
              />
            </div>

            {/* Prioridade e Responsável */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                  <Flag size={11} /> Prioridade
                </label>
                <div className="relative">
                  <select
                    value={priority}
                    onChange={e => setPriority(e.target.value)}
                    className="w-full pl-3 pr-7 py-2 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/25 appearance-none"
                  >
                    {PRIORITIES.map(p => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                  <User size={11} /> Responsável
                </label>
                <div className="relative">
                  <select
                    value={assignedUserId}
                    onChange={e => setAssignedUserId(e.target.value)}
                    className="w-full pl-3 pr-7 py-2 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/25 appearance-none"
                  >
                    <option value="">Nenhum</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Lembretes */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                <Bell size={11} /> Lembretes
              </label>
              <div className="space-y-1.5">
                {REMINDER_OPTIONS.map(r => (
                  <div key={r.value} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-28 shrink-0">{r.label}</span>
                    <div className="flex gap-2">
                      {(['PUSH', 'WHATSAPP'] as const).map(ch => {
                        const active = reminders.some(rem => rem.minutes_before === r.value && rem.channel === ch);
                        return (
                          <button
                            key={ch}
                            type="button"
                            onClick={() => toggleReminder(r.value, ch)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                              active
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'border-border text-muted-foreground hover:bg-accent'
                            }`}
                          >
                            {ch === 'PUSH' ? '🔔' : '💬'} {ch}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim() || !date || saving}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 flex items-center gap-1.5"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <CalendarIcon size={13} />}
              Criar evento
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
