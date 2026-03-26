'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Bot, Send, Clock, CheckCircle, XCircle, RefreshCw, Plus,
  ChevronRight, Users, Zap, TrendingUp, AlertTriangle, Edit2,
  Trash2, Play, Pause, X, Search, Filter, ChevronDown,
  MessageSquare, Settings, BarChart2, List,
} from 'lucide-react';
import { showError, showSuccess } from '@/lib/toast';
import { API_BASE_URL } from '@/lib/api';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FollowupStep {
  id: string;
  sequence_id: string;
  position: number;
  delay_hours: number;
  channel: string;
  tone: string;
  objective: string;
  custom_prompt?: string;
  auto_send: boolean;
}

interface FollowupSequence {
  id: string;
  name: string;
  description?: string;
  category: string;
  active: boolean;
  auto_enroll_stages: string[];
  max_attempts: number;
  created_at: string;
  steps: FollowupStep[];
  _count?: { enrollments: number };
}

interface FollowupEnrollment {
  id: string;
  lead_id: string;
  sequence_id: string;
  current_step: number;
  status: string;
  enrolled_at: string;
  last_sent_at?: string;
  next_send_at?: string;
  lead: { id: string; name?: string; phone: string; stage: string };
  sequence: { id: string; name: string; category: string };
  messages: unknown[];
}

interface FollowupMessage {
  id: string;
  enrollment_id: string;
  lead_id: string;
  channel: string;
  generated_text: string;
  sent_text?: string;
  status: string;
  risk_level: string;
  created_at: string;
  enrollment: {
    lead: { name?: string; phone: string; stage: string };
    sequence: { name: string };
  };
  step: { position: number; channel: string; tone: string; objective: string };
}

interface Stats {
  total_enrollments: number;
  ativos: number;
  pendentes_aprovacao: number;
  total_enviados: number;
  convertidos: number;
  taxa_conversao: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const API = API_BASE_URL;

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart2 },
  { id: 'sequencias', label: 'Sequências', icon: List },
  { id: 'enrollments', label: 'Enrollments', icon: Users },
  { id: 'aprovacoes', label: 'Aprovações', icon: MessageSquare },
] as const;

type TabId = (typeof TABS)[number]['id'];

const CATEGORIES = [
  { id: 'LEADS', label: 'Leads', color: '#3b82f6' },
  { id: 'CLIENTS', label: 'Clientes', color: '#22c55e' },
  { id: 'COBRANCA', label: 'Cobrança', color: '#f59e0b' },
  { id: 'REENGAJAMENTO', label: 'Reengajamento', color: '#8b5cf6' },
];

const STAGES = [
  { id: 'NOVO', label: 'Novo' },
  { id: 'QUALIFICANDO', label: 'Qualificando' },
  { id: 'AGUARDANDO_DOCS', label: 'Aguardando Docs' },
  { id: 'AGUARDANDO_PROC', label: 'Aguardando Proc.' },
];

const CHANNELS = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email', label: 'E-mail' },
];

const TONES = [
  { id: 'amigavel', label: 'Amigável' },
  { id: 'profissional', label: 'Profissional' },
  { id: 'empatico', label: 'Empático' },
  { id: 'firme', label: 'Firme' },
];

const ENROLLMENT_STATUSES = [
  { id: '', label: 'Todos' },
  { id: 'ATIVO', label: 'Ativo', color: '#22c55e' },
  { id: 'PAUSADO', label: 'Pausado', color: '#f59e0b' },
  { id: 'CONCLUIDO', label: 'Concluído', color: '#6b7280' },
  { id: 'CANCELADO', label: 'Cancelado', color: '#ef4444' },
  { id: 'CONVERTIDO', label: 'Convertido', color: '#8b5cf6' },
];

const RISK_COLORS: Record<string, string> = {
  BAIXO: 'text-green-400 bg-green-400/10',
  MEDIO: 'text-yellow-400 bg-yellow-400/10',
  ALTO: 'text-red-400 bg-red-400/10',
};

const CATEGORY_COLORS: Record<string, string> = {
  LEADS: 'text-blue-400 bg-blue-400/10',
  CLIENTS: 'text-green-400 bg-green-400/10',
  COBRANCA: 'text-yellow-400 bg-yellow-400/10',
  REENGAJAMENTO: 'text-purple-400 bg-purple-400/10',
};

const STATUS_COLORS: Record<string, string> = {
  ATIVO: 'text-green-400 bg-green-400/10',
  PAUSADO: 'text-yellow-400 bg-yellow-400/10',
  CONCLUIDO: 'text-gray-400 bg-gray-400/10',
  CANCELADO: 'text-red-400 bg-red-400/10',
  CONVERTIDO: 'text-purple-400 bg-purple-400/10',
};

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function apiFetch(path: string, options?: RequestInit) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

// ─── Modais ──────────────────────────────────────────────────────────────────

interface ModalProps { onClose: () => void; children: React.ReactNode; title: string }

function Modal({ onClose, children, title }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-6 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function inputCls(extra = '') {
  return `w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors ${extra}`;
}

function labelCls() {
  return 'block text-xs font-medium text-gray-400 mb-1';
}

// ─── Modal: Criar/Editar Sequência ────────────────────────────────────────────

interface SeqForm {
  name: string;
  description: string;
  category: string;
  auto_enroll_stages: string[];
  max_attempts: number;
}

function SequenceModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: Partial<FollowupSequence>;
  onClose: () => void;
  onSave: (form: SeqForm) => Promise<void>;
}) {
  const [form, setForm] = useState<SeqForm>({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    category: initial?.category ?? 'LEADS',
    auto_enroll_stages: initial?.auto_enroll_stages ?? [],
    max_attempts: initial?.max_attempts ?? 3,
  });
  const [saving, setSaving] = useState(false);

  const toggleStage = (stage: string) => {
    setForm(f => ({
      ...f,
      auto_enroll_stages: f.auto_enroll_stages.includes(stage)
        ? f.auto_enroll_stages.filter(s => s !== stage)
        : [...f.auto_enroll_stages, stage],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { showError('Nome obrigatório'); return; }
    setSaving(true);
    try { await onSave(form); onClose(); }
    catch (err: unknown) { showError(err instanceof Error ? err.message : 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={initial?.id ? 'Editar Sequência' : 'Nova Sequência'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls()}>Nome *</label>
          <input
            className={inputCls()}
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Ex: Follow-up leads frios"
          />
        </div>

        <div>
          <label className={labelCls()}>Descrição</label>
          <input
            className={inputCls()}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Descrição opcional"
          />
        </div>

        <div>
          <label className={labelCls()}>Categoria *</label>
          <select
            className={inputCls()}
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
          >
            {CATEGORIES.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls()}>Auto-enroll nos stages</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {STAGES.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleStage(s.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  form.auto_enroll_stages.includes(s.id)
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls()}>Máximo de tentativas</label>
          <input
            type="number"
            min={1}
            max={20}
            className={inputCls()}
            value={form.max_attempts}
            onChange={e => setForm(f => ({ ...f, max_attempts: Number(e.target.value) }))}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 text-sm transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Modal: Adicionar Step ────────────────────────────────────────────────────

interface StepForm {
  position: number;
  delay_hours: number;
  channel: string;
  tone: string;
  objective: string;
  custom_prompt: string;
  auto_send: boolean;
}

function StepModal({
  sequenceId,
  initial,
  onClose,
  onSave,
}: {
  sequenceId: string;
  initial?: Partial<FollowupStep>;
  onClose: () => void;
  onSave: (form: StepForm) => Promise<void>;
}) {
  const [form, setForm] = useState<StepForm>({
    position: initial?.position ?? 1,
    delay_hours: initial?.delay_hours ?? 24,
    channel: initial?.channel ?? 'whatsapp',
    tone: initial?.tone ?? 'amigavel',
    objective: initial?.objective ?? '',
    custom_prompt: initial?.custom_prompt ?? '',
    auto_send: initial?.auto_send ?? false,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.objective.trim()) { showError('Objetivo obrigatório'); return; }
    setSaving(true);
    try { await onSave(form); onClose(); }
    catch (err: unknown) { showError(err instanceof Error ? err.message : 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={initial?.id ? 'Editar Step' : 'Novo Step'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls()}>Posição</label>
            <input
              type="number"
              min={1}
              className={inputCls()}
              value={form.position}
              onChange={e => setForm(f => ({ ...f, position: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className={labelCls()}>Delay (horas)</label>
            <input
              type="number"
              min={0}
              className={inputCls()}
              value={form.delay_hours}
              onChange={e => setForm(f => ({ ...f, delay_hours: Number(e.target.value) }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls()}>Canal</label>
            <select
              className={inputCls()}
              value={form.channel}
              onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}
            >
              {CHANNELS.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls()}>Tom</label>
            <select
              className={inputCls()}
              value={form.tone}
              onChange={e => setForm(f => ({ ...f, tone: e.target.value }))}
            >
              {TONES.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls()}>Objetivo *</label>
          <input
            className={inputCls()}
            value={form.objective}
            onChange={e => setForm(f => ({ ...f, objective: e.target.value }))}
            placeholder="Ex: Reativar lead com proposta de consulta gratuita"
          />
        </div>

        <div>
          <label className={labelCls()}>Prompt personalizado (opcional)</label>
          <textarea
            className={inputCls('resize-none')}
            rows={3}
            value={form.custom_prompt}
            onChange={e => setForm(f => ({ ...f, custom_prompt: e.target.value }))}
            placeholder="Instruções adicionais para a IA..."
          />
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
          <div>
            <p className="text-sm font-medium text-white">Envio automático</p>
            <p className="text-xs text-gray-500 mt-0.5">Envia sem aprovação humana</p>
          </div>
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, auto_send: !f.auto_send }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              form.auto_send ? 'bg-blue-600' : 'bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                form.auto_send ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 text-sm transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar Step'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Card de Aprovação ────────────────────────────────────────────────────────

function ApprovalCard({
  msg,
  onApprove,
  onReject,
  onRegenerate,
}: {
  msg: FollowupMessage;
  onApprove: (id: string, text: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onRegenerate: (id: string) => Promise<void>;
}) {
  const [text, setText] = useState(msg.generated_text);
  const [loading, setLoading] = useState<string | null>(null);

  const handle = async (action: () => Promise<void>, key: string) => {
    setLoading(key);
    try { await action(); }
    catch (err: unknown) { showError(err instanceof Error ? err.message : 'Erro'); }
    finally { setLoading(null); }
  };

  const riskCls = RISK_COLORS[msg.risk_level] ?? 'text-gray-400 bg-gray-400/10';

  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white">
            {msg.enrollment.lead.name || msg.enrollment.lead.phone}
          </p>
          <p className="text-xs text-gray-500">
            {msg.enrollment.sequence.name} · Step {msg.step.position} · {msg.step.channel.toUpperCase()}
          </p>
          <p className="text-xs text-gray-500">
            Stage: <span className="text-gray-300">{msg.enrollment.lead.stage}</span>
            {' · '}Tom: <span className="text-gray-300 capitalize">{msg.step.tone}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Badge label={msg.risk_level} colorClass={riskCls} />
          <span className="text-xs text-gray-500">{formatDate(msg.created_at)}</span>
        </div>
      </div>

      {/* Objetivo */}
      <div className="bg-gray-900/50 rounded-lg px-3 py-2">
        <p className="text-xs text-gray-500 font-medium mb-0.5">Objetivo</p>
        <p className="text-xs text-gray-300">{msg.step.objective}</p>
      </div>

      {/* Texto gerado (editável) */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">
          Mensagem gerada pela IA (editável)
        </label>
        <textarea
          className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
          rows={4}
          value={text}
          onChange={e => setText(e.target.value)}
        />
      </div>

      {/* Ações */}
      <div className="flex gap-2">
        <button
          onClick={() => handle(() => onApprove(msg.id, text), 'approve')}
          disabled={!!loading}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-600/20 border border-green-600/30 text-green-400 hover:bg-green-600/30 disabled:opacity-50 text-sm font-medium transition-colors"
        >
          {loading === 'approve' ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <CheckCircle size={14} />
          )}
          Aprovar
        </button>

        <button
          onClick={() => handle(() => onReject(msg.id), 'reject')}
          disabled={!!loading}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-600/20 border border-red-600/30 text-red-400 hover:bg-red-600/30 disabled:opacity-50 text-sm font-medium transition-colors"
        >
          {loading === 'reject' ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <XCircle size={14} />
          )}
          Rejeitar
        </button>

        <button
          onClick={() => handle(() => onRegenerate(msg.id), 'regen')}
          disabled={!!loading}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600/20 border border-blue-600/30 text-blue-400 hover:bg-blue-600/30 disabled:opacity-50 text-sm font-medium transition-colors"
        >
          {loading === 'regen' ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          Regenerar
        </button>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function FollowupPage() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  // Dados
  const [stats, setStats] = useState<Stats | null>(null);
  const [sequences, setSequences] = useState<FollowupSequence[]>([]);
  const [enrollments, setEnrollments] = useState<FollowupEnrollment[]>([]);
  const [approvals, setApprovals] = useState<FollowupMessage[]>([]);

  // Loading
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingSeq, setLoadingSeq] = useState(false);
  const [loadingEnroll, setLoadingEnroll] = useState(false);
  const [loadingApprovals, setLoadingApprovals] = useState(false);

  // Modais
  const [seqModal, setSeqModal] = useState<{ open: boolean; seq?: FollowupSequence }>({ open: false });
  const [stepModal, setStepModal] = useState<{ open: boolean; seqId: string; step?: FollowupStep }>({ open: false, seqId: '' });
  const [expandedSeq, setExpandedSeq] = useState<string | null>(null);

  // Filtros enrollments
  const [enrollFilter, setEnrollFilter] = useState('');
  const [enrollSearch, setEnrollSearch] = useState('');

  // ── Fetch functions ─────────────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const data = await apiFetch('/followup/stats');
      setStats(data);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro ao carregar stats');
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const fetchSequences = useCallback(async () => {
    setLoadingSeq(true);
    try {
      const data = await apiFetch('/followup/sequences');
      setSequences(Array.isArray(data) ? data : data.sequences ?? []);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro ao carregar sequências');
    } finally {
      setLoadingSeq(false);
    }
  }, []);

  const fetchEnrollments = useCallback(async () => {
    setLoadingEnroll(true);
    try {
      const qs = enrollFilter ? `?status=${enrollFilter}` : '';
      const data = await apiFetch(`/followup/enrollments${qs}`);
      setEnrollments(Array.isArray(data) ? data : data.enrollments ?? []);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro ao carregar enrollments');
    } finally {
      setLoadingEnroll(false);
    }
  }, [enrollFilter]);

  const fetchApprovals = useCallback(async () => {
    setLoadingApprovals(true);
    try {
      const data = await apiFetch('/followup/approvals');
      setApprovals(Array.isArray(data) ? data : data.messages ?? []);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro ao carregar aprovações');
    } finally {
      setLoadingApprovals(false);
    }
  }, []);

  // Fetch inicial por tab
  useEffect(() => {
    if (activeTab === 'dashboard') fetchStats();
    if (activeTab === 'sequencias') fetchSequences();
    if (activeTab === 'enrollments') fetchEnrollments();
    if (activeTab === 'aprovacoes') fetchApprovals();
  }, [activeTab, fetchStats, fetchSequences, fetchEnrollments, fetchApprovals]);

  useEffect(() => {
    if (activeTab === 'enrollments') fetchEnrollments();
  }, [enrollFilter, activeTab, fetchEnrollments]);

  // ── Sequências ──────────────────────────────────────────────────────────────

  const handleSaveSequence = async (form: SeqForm) => {
    if (seqModal.seq?.id) {
      await apiFetch(`/followup/sequences/${seqModal.seq.id}`, {
        method: 'PATCH',
        body: JSON.stringify(form),
      });
      showSuccess('Sequência atualizada');
    } else {
      await apiFetch('/followup/sequences', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      showSuccess('Sequência criada');
    }
    fetchSequences();
  };

  const handleToggleSequence = async (seq: FollowupSequence) => {
    try {
      await apiFetch(`/followup/sequences/${seq.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !seq.active }),
      });
      showSuccess(seq.active ? 'Sequência desativada' : 'Sequência ativada');
      fetchSequences();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro ao atualizar');
    }
  };

  const handleDeleteSequence = async (id: string) => {
    if (!confirm('Deletar esta sequência? Isso também cancelará todos os enrollments ativos.')) return;
    try {
      await apiFetch(`/followup/sequences/${id}`, { method: 'DELETE' });
      showSuccess('Sequência deletada');
      fetchSequences();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro ao deletar');
    }
  };

  // ── Steps ───────────────────────────────────────────────────────────────────

  const handleSaveStep = async (form: StepForm) => {
    if (stepModal.step?.id) {
      await apiFetch(`/followup/steps/${stepModal.step.id}`, {
        method: 'PATCH',
        body: JSON.stringify(form),
      });
      showSuccess('Step atualizado');
    } else {
      await apiFetch(`/followup/sequences/${stepModal.seqId}/steps`, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      showSuccess('Step adicionado');
    }
    fetchSequences();
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!confirm('Deletar este step?')) return;
    try {
      await apiFetch(`/followup/steps/${stepId}`, { method: 'DELETE' });
      showSuccess('Step deletado');
      fetchSequences();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro ao deletar step');
    }
  };

  // ── Enrollments ─────────────────────────────────────────────────────────────

  const handleEnrollmentAction = async (
    id: string,
    action: 'pause' | 'cancel' | 'converted',
  ) => {
    try {
      await apiFetch(`/followup/enrollments/${id}/${action}`, { method: 'PATCH' });
      const labels: Record<string, string> = {
        pause: 'Pausado', cancel: 'Cancelado', converted: 'Marcado como convertido',
      };
      showSuccess(labels[action]);
      fetchEnrollments();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro na ação');
    }
  };

  // ── Aprovações ──────────────────────────────────────────────────────────────

  const handleApprove = async (id: string, editedText: string) => {
    await apiFetch(`/followup/messages/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({ edited_text: editedText }),
    });
    showSuccess('Mensagem aprovada e enviada!');
    fetchApprovals();
    fetchStats();
  };

  const handleReject = async (id: string) => {
    await apiFetch(`/followup/messages/${id}/reject`, { method: 'PATCH' });
    showSuccess('Mensagem rejeitada');
    fetchApprovals();
  };

  const handleRegenerate = async (id: string) => {
    await apiFetch(`/followup/messages/${id}/regenerate`, { method: 'POST' });
    showSuccess('Regenerando mensagem...');
    setTimeout(() => fetchApprovals(), 2000);
  };

  // ── Filtro de enrollments ────────────────────────────────────────────────────

  const filteredEnrollments = enrollments.filter(e => {
    if (!enrollSearch) return true;
    const q = enrollSearch.toLowerCase();
    return (
      e.lead.name?.toLowerCase().includes(q) ||
      e.lead.phone.includes(q) ||
      e.sequence.name.toLowerCase().includes(q)
    );
  });

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-600/20 border border-blue-500/30">
            <Bot size={22} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Follow-up IA</h1>
            <p className="text-xs text-gray-500">Automação inteligente de mensagens</p>
          </div>
          {approvals.length > 0 && (
            <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <AlertTriangle size={14} className="text-yellow-400" />
              <span className="text-xs text-yellow-400 font-medium">
                {approvals.length} aguardando aprovação
              </span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-6 flex gap-1">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? 'text-blue-400 border-blue-500'
                    : 'text-gray-500 border-transparent hover:text-gray-300'
                }`}
              >
                <Icon size={15} />
                {tab.label}
                {tab.id === 'aprovacoes' && approvals.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-yellow-500 text-black text-xs font-bold leading-none">
                    {approvals.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* ── TAB: DASHBOARD ─────────────────────────────────────────────────── */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {loadingStats ? (
              <div className="flex items-center justify-center py-20 text-gray-500">
                <RefreshCw size={20} className="animate-spin mr-2" />
                Carregando...
              </div>
            ) : stats ? (
              <>
                {/* Stat Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {[
                    {
                      label: 'Total Enrollments',
                      value: stats.total_enrollments,
                      icon: Users,
                      grad: 'from-blue-600/20 to-blue-800/10',
                      border: 'border-blue-500/20',
                      text: 'text-blue-400',
                    },
                    {
                      label: 'Ativos',
                      value: stats.ativos,
                      icon: Play,
                      grad: 'from-green-600/20 to-green-800/10',
                      border: 'border-green-500/20',
                      text: 'text-green-400',
                    },
                    {
                      label: 'Aguard. Aprovação',
                      value: stats.pendentes_aprovacao,
                      icon: Clock,
                      grad: 'from-yellow-600/20 to-yellow-800/10',
                      border: 'border-yellow-500/20',
                      text: 'text-yellow-400',
                    },
                    {
                      label: 'Total Enviados',
                      value: stats.total_enviados,
                      icon: Send,
                      grad: 'from-indigo-600/20 to-indigo-800/10',
                      border: 'border-indigo-500/20',
                      text: 'text-indigo-400',
                    },
                    {
                      label: 'Convertidos',
                      value: stats.convertidos,
                      icon: CheckCircle,
                      grad: 'from-purple-600/20 to-purple-800/10',
                      border: 'border-purple-500/20',
                      text: 'text-purple-400',
                    },
                    {
                      label: 'Taxa Conversão',
                      value: `${stats.taxa_conversao.toFixed(1)}%`,
                      icon: TrendingUp,
                      grad: 'from-pink-600/20 to-pink-800/10',
                      border: 'border-pink-500/20',
                      text: 'text-pink-400',
                    },
                  ].map(card => {
                    const Icon = card.icon;
                    return (
                      <div
                        key={card.label}
                        className={`bg-gradient-to-br ${card.grad} border ${card.border} rounded-2xl p-5 flex flex-col gap-3`}
                      >
                        <div className={`p-2 rounded-lg bg-gray-900/40 w-fit ${card.text}`}>
                          <Icon size={18} />
                        </div>
                        <div>
                          <p className={`text-2xl font-bold ${card.text}`}>{card.value}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{card.label}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Quick actions */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Zap size={16} className="text-yellow-400" />
                      <h3 className="text-sm font-semibold text-white">Ações Rápidas</h3>
                    </div>
                    <div className="space-y-2">
                      <button
                        onClick={() => { setActiveTab('sequencias'); setSeqModal({ open: true }); }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-900/60 hover:bg-gray-900 border border-gray-700 hover:border-gray-600 text-sm text-gray-300 hover:text-white transition-colors"
                      >
                        <Plus size={15} className="text-blue-400" />
                        Nova sequência de follow-up
                        <ChevronRight size={14} className="ml-auto text-gray-600" />
                      </button>
                      <button
                        onClick={() => setActiveTab('aprovacoes')}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-900/60 hover:bg-gray-900 border border-gray-700 hover:border-gray-600 text-sm text-gray-300 hover:text-white transition-colors"
                      >
                        <MessageSquare size={15} className="text-yellow-400" />
                        Revisar aprovações pendentes
                        {stats.pendentes_aprovacao > 0 && (
                          <span className="ml-auto px-2 py-0.5 rounded-full bg-yellow-500 text-black text-xs font-bold">
                            {stats.pendentes_aprovacao}
                          </span>
                        )}
                        {stats.pendentes_aprovacao === 0 && (
                          <ChevronRight size={14} className="ml-auto text-gray-600" />
                        )}
                      </button>
                      <button
                        onClick={() => setActiveTab('enrollments')}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-900/60 hover:bg-gray-900 border border-gray-700 hover:border-gray-600 text-sm text-gray-300 hover:text-white transition-colors"
                      >
                        <Users size={15} className="text-green-400" />
                        Ver todos os enrollments
                        <ChevronRight size={14} className="ml-auto text-gray-600" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Bot size={16} className="text-blue-400" />
                      <h3 className="text-sm font-semibold text-white">Como funciona</h3>
                    </div>
                    <ol className="space-y-3 text-sm text-gray-400">
                      {[
                        'Crie uma sequência com os steps e delays desejados',
                        'Leads são enrollados automaticamente ao entrar em um stage configurado',
                        'A IA gera mensagens personalizadas para cada lead',
                        'Mensagens de alto risco ficam aguardando aprovação humana',
                        'Aprovadas, as mensagens são enviadas pelo canal configurado',
                      ].map((step, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="shrink-0 w-5 h-5 rounded-full bg-blue-600/20 border border-blue-500/30 text-blue-400 text-xs flex items-center justify-center font-bold">
                            {i + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-20 text-gray-500">
                <Bot size={40} className="mx-auto mb-3 opacity-30" />
                <p>Não foi possível carregar os dados.</p>
                <button
                  onClick={fetchStats}
                  className="mt-3 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors"
                >
                  Tentar novamente
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: SEQUÊNCIAS ────────────────────────────────────────────────── */}
        {activeTab === 'sequencias' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Sequências</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {sequences.length} sequência{sequences.length !== 1 ? 's' : ''} configurada{sequences.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => setSeqModal({ open: true })}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
              >
                <Plus size={15} />
                Nova Sequência
              </button>
            </div>

            {loadingSeq ? (
              <div className="flex items-center justify-center py-20 text-gray-500">
                <RefreshCw size={20} className="animate-spin mr-2" />
                Carregando...
              </div>
            ) : sequences.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-gray-700 rounded-2xl">
                <Bot size={40} className="mx-auto mb-3 text-gray-700" />
                <p className="text-gray-500">Nenhuma sequência criada ainda.</p>
                <button
                  onClick={() => setSeqModal({ open: true })}
                  className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors mx-auto"
                >
                  <Plus size={15} />
                  Criar primeira sequência
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {sequences.map(seq => (
                  <div
                    key={seq.id}
                    className="bg-gray-800/60 border border-gray-700 rounded-xl overflow-hidden"
                  >
                    {/* Sequence header */}
                    <div className="flex items-center gap-4 px-5 py-4">
                      <button
                        onClick={() => setExpandedSeq(expandedSeq === seq.id ? null : seq.id)}
                        className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        <ChevronDown
                          size={16}
                          className={`transition-transform ${expandedSeq === seq.id ? 'rotate-180' : ''}`}
                        />
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white text-sm">{seq.name}</span>
                          <Badge
                            label={CATEGORIES.find(c => c.id === seq.category)?.label ?? seq.category}
                            colorClass={CATEGORY_COLORS[seq.category] ?? 'text-gray-400 bg-gray-400/10'}
                          />
                          {!seq.active && (
                            <Badge label="Inativo" colorClass="text-gray-500 bg-gray-500/10" />
                          )}
                        </div>
                        {seq.description && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{seq.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                          <span>{seq.steps.length} step{seq.steps.length !== 1 ? 's' : ''}</span>
                          <span>·</span>
                          <span>{seq._count?.enrollments ?? 0} enrollment{(seq._count?.enrollments ?? 0) !== 1 ? 's' : ''}</span>
                          <span>·</span>
                          <span>Max {seq.max_attempts} tentativas</span>
                          {seq.auto_enroll_stages.length > 0 && (
                            <>
                              <span>·</span>
                              <span>Auto: {seq.auto_enroll_stages.join(', ')}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleToggleSequence(seq)}
                          title={seq.active ? 'Desativar' : 'Ativar'}
                          className={`p-2 rounded-lg border transition-colors ${
                            seq.active
                              ? 'bg-green-600/10 border-green-600/20 text-green-400 hover:bg-green-600/20'
                              : 'bg-gray-700/50 border-gray-700 text-gray-500 hover:text-gray-300'
                          }`}
                        >
                          {seq.active ? <Pause size={14} /> : <Play size={14} />}
                        </button>
                        <button
                          onClick={() => setSeqModal({ open: true, seq })}
                          title="Editar"
                          className="p-2 rounded-lg border border-gray-700 bg-gray-700/50 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteSequence(seq.id)}
                          title="Deletar"
                          className="p-2 rounded-lg border border-gray-700 bg-gray-700/50 text-gray-400 hover:text-red-400 hover:border-red-500/30 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Steps (expandido) */}
                    {expandedSeq === seq.id && (
                      <div className="border-t border-gray-700 bg-gray-900/40 px-5 py-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            Steps
                          </p>
                          <button
                            onClick={() => setStepModal({ open: true, seqId: seq.id })}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/30 text-xs font-medium transition-colors"
                          >
                            <Plus size={13} />
                            Adicionar Step
                          </button>
                        </div>

                        {seq.steps.length === 0 ? (
                          <p className="text-xs text-gray-600 py-2 text-center">
                            Nenhum step configurado.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {[...seq.steps]
                              .sort((a, b) => a.position - b.position)
                              .map((step, idx) => (
                                <div
                                  key={step.id}
                                  className="flex items-center gap-3 p-3 bg-gray-800/60 border border-gray-700 rounded-lg"
                                >
                                  {/* Position indicator */}
                                  <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                                    <span className="text-xs font-bold text-blue-400">{step.position}</span>
                                  </div>

                                  {/* Connector line (except last) */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-medium text-white capitalize">
                                        {step.channel === 'whatsapp' ? '📱 WhatsApp' : '📧 E-mail'}
                                      </span>
                                      <span className="text-xs text-gray-500">
                                        após {step.delay_hours}h
                                      </span>
                                      <Badge
                                        label={TONES.find(t => t.id === step.tone)?.label ?? step.tone}
                                        colorClass="text-gray-400 bg-gray-700/50"
                                      />
                                      {step.auto_send && (
                                        <Badge label="Auto-envio" colorClass="text-green-400 bg-green-400/10" />
                                      )}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-0.5 truncate">{step.objective}</p>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      onClick={() => setStepModal({ open: true, seqId: seq.id, step })}
                                      className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
                                    >
                                      <Edit2 size={12} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteStep(step.id)}
                                      className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: ENROLLMENTS ───────────────────────────────────────────────── */}
        {activeTab === 'enrollments' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Enrollments</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {filteredEnrollments.length} resultado{filteredEnrollments.length !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Busca */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Buscar lead..."
                    value={enrollSearch}
                    onChange={e => setEnrollSearch(e.target.value)}
                    className="pl-8 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 w-48 transition-colors"
                  />
                </div>

                {/* Filtro status */}
                <div className="relative">
                  <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <select
                    value={enrollFilter}
                    onChange={e => setEnrollFilter(e.target.value)}
                    className="pl-8 pr-8 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors appearance-none cursor-pointer"
                  >
                    {ENROLLMENT_STATUSES.map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={fetchEnrollments}
                  className="p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                  title="Atualizar"
                >
                  <RefreshCw size={15} className={loadingEnroll ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {loadingEnroll ? (
              <div className="flex items-center justify-center py-20 text-gray-500">
                <RefreshCw size={20} className="animate-spin mr-2" />
                Carregando...
              </div>
            ) : filteredEnrollments.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-gray-700 rounded-2xl">
                <Users size={40} className="mx-auto mb-3 text-gray-700" />
                <p className="text-gray-500">Nenhum enrollment encontrado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-700">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-800/80 border-b border-gray-700">
                      {['Lead', 'Sequência', 'Step', 'Status', 'Próximo envio', 'Inscrito em', 'Ações'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {filteredEnrollments.map(enroll => (
                      <tr
                        key={enroll.id}
                        className="bg-gray-900/40 hover:bg-gray-800/60 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-white text-sm">
                              {enroll.lead.name || '—'}
                            </p>
                            <p className="text-xs text-gray-500">{enroll.lead.phone}</p>
                            <p className="text-xs text-gray-600">{enroll.lead.stage}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-white text-sm">{enroll.sequence.name}</p>
                            <Badge
                              label={CATEGORIES.find(c => c.id === enroll.sequence.category)?.label ?? enroll.sequence.category}
                              colorClass={CATEGORY_COLORS[enroll.sequence.category] ?? 'text-gray-400 bg-gray-700/50'}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-white font-medium">#{enroll.current_step}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            label={enroll.status}
                            colorClass={STATUS_COLORS[enroll.status] ?? 'text-gray-400 bg-gray-700/50'}
                          />
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                          {formatDate(enroll.next_send_at)}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                          {formatDate(enroll.enrolled_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {enroll.status === 'ATIVO' && (
                              <button
                                onClick={() => handleEnrollmentAction(enroll.id, 'pause')}
                                title="Pausar"
                                className="p-1.5 rounded text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                              >
                                <Pause size={13} />
                              </button>
                            )}
                            {enroll.status === 'PAUSADO' && (
                              <button
                                onClick={() => handleEnrollmentAction(enroll.id, 'pause')}
                                title="Retomar"
                                className="p-1.5 rounded text-green-400 hover:bg-green-400/10 transition-colors"
                              >
                                <Play size={13} />
                              </button>
                            )}
                            {(enroll.status === 'ATIVO' || enroll.status === 'PAUSADO') && (
                              <>
                                <button
                                  onClick={() => handleEnrollmentAction(enroll.id, 'converted')}
                                  title="Marcar convertido"
                                  className="p-1.5 rounded text-purple-400 hover:bg-purple-400/10 transition-colors"
                                >
                                  <CheckCircle size={13} />
                                </button>
                                <button
                                  onClick={() => handleEnrollmentAction(enroll.id, 'cancel')}
                                  title="Cancelar"
                                  className="p-1.5 rounded text-red-400 hover:bg-red-400/10 transition-colors"
                                >
                                  <XCircle size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: APROVAÇÕES ────────────────────────────────────────────────── */}
        {activeTab === 'aprovacoes' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Fila de Aprovação</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {approvals.length} mensagem{approvals.length !== 1 ? 'ns' : ''} aguardando revisão
                </p>
              </div>
              <button
                onClick={fetchApprovals}
                className="p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                title="Atualizar"
              >
                <RefreshCw size={15} className={loadingApprovals ? 'animate-spin' : ''} />
              </button>
            </div>

            {loadingApprovals ? (
              <div className="flex items-center justify-center py-20 text-gray-500">
                <RefreshCw size={20} className="animate-spin mr-2" />
                Carregando...
              </div>
            ) : approvals.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-gray-700 rounded-2xl">
                <CheckCircle size={40} className="mx-auto mb-3 text-gray-700" />
                <p className="text-gray-500">Nenhuma mensagem aguardando aprovação.</p>
                <p className="text-xs text-gray-600 mt-1">
                  Tudo certo! As mensagens de baixo risco são enviadas automaticamente.
                </p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {approvals.map(msg => (
                  <ApprovalCard
                    key={msg.id}
                    msg={msg}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onRegenerate={handleRegenerate}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modais ─────────────────────────────────────────────────────────── */}
      {seqModal.open && (
        <SequenceModal
          initial={seqModal.seq}
          onClose={() => setSeqModal({ open: false })}
          onSave={handleSaveSequence}
        />
      )}

      {stepModal.open && (
        <StepModal
          sequenceId={stepModal.seqId}
          initial={stepModal.step}
          onClose={() => setStepModal({ open: false, seqId: '' })}
          onSave={handleSaveStep}
        />
      )}
    </div>
  );
}
