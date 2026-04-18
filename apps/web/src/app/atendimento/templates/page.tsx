'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, FileText, X, ChevronDown } from 'lucide-react';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tipo =
  | 'CONTRATO_SERVICO'
  | 'PROCURACAO'
  | 'PROPOSTA'
  | 'NOTIFICACAO'
  | 'OUTRO';

interface Template {
  id: string;
  name: string;
  tipo: Tipo;
  description?: string;
  content_json: any;
  variables: string[];
  is_global: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<Tipo | 'TODOS', string> = {
  TODOS: 'Todos',
  CONTRATO_SERVICO: 'Contrato de Serviço',
  PROCURACAO: 'Procuração',
  PROPOSTA: 'Proposta Comercial',
  NOTIFICACAO: 'Notificação',
  OUTRO: 'Outro',
};

const TIPO_OPTIONS: Tipo[] = [
  'CONTRATO_SERVICO',
  'PROCURACAO',
  'PROPOSTA',
  'NOTIFICACAO',
  'OUTRO',
];

const VARIABLES = [
  '{{razao_social}}',
  '{{cnpj}}',
  '{{regime_tributario}}',
  '{{contador}}',
  '{{data_atual}}',
  '{{email}}',
  '{{telefone}}',
];

const TIPO_BADGE_COLORS: Record<Tipo, string> = {
  CONTRATO_SERVICO: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  PROCURACAO: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  PROPOSTA: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  NOTIFICACAO: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  OUTRO: 'bg-muted text-muted-foreground',
};

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  template: Partial<Template> | null;
  onClose: () => void;
  onSave: (data: Partial<Template>) => Promise<void>;
}

function TemplateModal({ template, onClose, onSave }: ModalProps) {
  const [name, setName] = useState(template?.name || '');
  const [tipo, setTipo] = useState<Tipo>(template?.tipo || 'CONTRATO_SERVICO');
  const [description, setDescription] = useState(template?.description || '');
  const [content, setContent] = useState<string>(
    typeof template?.content_json === 'string'
      ? template.content_json
      : template?.content_json?.text || ''
  );
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertVariable = (variable: string) => {
    const el = textareaRef.current;
    if (!el) {
      setContent(prev => prev + variable);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const newContent = content.slice(0, start) + variable + content.slice(end);
    setContent(newContent);
    // Restore cursor after the inserted variable
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        tipo,
        description: description.trim(),
        content_json: { text: content },
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            {template?.id ? 'Editar Template' : 'Novo Template'}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Nome do Template *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Contrato de Prestação de Serviços"
              required
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Tipo
            </label>
            <div className="relative">
              <select
                value={tipo}
                onChange={e => setTipo(e.target.value as Tipo)}
                className="w-full appearance-none bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 pr-8"
              >
                {TIPO_OPTIONS.map(t => (
                  <option key={t} value={t}>{TIPO_LABELS[t]}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Descrição
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Breve descrição do template"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Variables */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Inserir variável
            </label>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map(v => (
                <button
                  type="button"
                  key={v}
                  onClick={() => insertVariable(v)}
                  className="px-2 py-1 bg-accent hover:bg-accent/70 text-accent-foreground text-xs rounded-md font-mono transition-colors"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Conteúdo
            </label>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Digite o conteúdo do template aqui. Use as variáveis acima para inserir campos dinâmicos."
              rows={10}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono resize-y"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit as any}
            disabled={saving || !name.trim()}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onEdit,
  onDelete,
}: {
  template: Template;
  onEdit: (t: Template) => void;
  onDelete: (t: Template) => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:border-primary/30 transition-colors group">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${TIPO_BADGE_COLORS[template.tipo]}`}
            >
              {TIPO_LABELS[template.tipo]}
            </span>
            {template.is_global && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground">
                Global
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-foreground truncate">{template.name}</h3>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => onEdit(template)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Editar"
          >
            <Edit2 size={13} />
          </button>
          <button
            onClick={() => onDelete(template)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors"
            title="Excluir"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {template.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{template.description}</p>
      )}

      <div className="flex items-center justify-between mt-auto pt-1 border-t border-border/50">
        <span className="text-[11px] text-muted-foreground">
          Usado {template.usage_count}x
        </span>
        <span className="text-[11px] text-muted-foreground">
          {new Date(template.updated_at).toLocaleDateString('pt-BR')}
        </span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<Tipo | 'TODOS'>('TODOS');
  const [modalTemplate, setModalTemplate] = useState<Partial<Template> | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await api.get('/templates-contabil');
      setTemplates(res.data?.data || res.data || []);
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleCreate = () => {
    setModalTemplate({});
    setShowModal(true);
  };

  const handleEdit = (template: Template) => {
    setModalTemplate(template);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setModalTemplate(null);
  };

  const handleSave = async (data: Partial<Template>) => {
    if (modalTemplate?.id) {
      await api.patch(`/templates-contabil/${modalTemplate.id}`, data);
    } else {
      await api.post('/templates-contabil', data);
    }
    handleCloseModal();
    fetchTemplates();
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/templates-contabil/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchTemplates();
    } finally {
      setDeleting(false);
    }
  };

  const filtered =
    activeFilter === 'TODOS'
      ? templates
      : templates.filter(t => t.tipo === activeFilter);

  const filterTabs: Array<Tipo | 'TODOS'> = [
    'TODOS',
    'CONTRATO_SERVICO',
    'PROCURACAO',
    'PROPOSTA',
    'NOTIFICACAO',
    'OUTRO',
  ];

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText size={18} className="text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Templates Contábeis</h1>
              <p className="text-xs text-muted-foreground">
                {templates.length} template{templates.length !== 1 ? 's' : ''} cadastrado{templates.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus size={15} />
            Novo Template
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-1.5">
          {filterTabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeFilter === tab
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {TIPO_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse h-36">
                <div className="h-4 w-24 bg-muted rounded mb-2" />
                <div className="h-5 w-40 bg-muted rounded mb-3" />
                <div className="h-3 w-full bg-muted rounded mb-1.5" />
                <div className="h-3 w-3/4 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FileText size={40} className="text-muted-foreground mb-3 opacity-40" />
            <p className="text-sm font-medium text-muted-foreground">
              {activeFilter === 'TODOS'
                ? 'Nenhum template cadastrado ainda.'
                : `Nenhum template do tipo "${TIPO_LABELS[activeFilter]}".`}
            </p>
            <button
              onClick={handleCreate}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary text-sm font-medium rounded-lg hover:bg-primary/20 transition-colors"
            >
              <Plus size={14} />
              Criar primeiro template
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(t => (
              <TemplateCard
                key={t.id}
                template={t}
                onEdit={handleEdit}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && modalTemplate !== null && (
        <TemplateModal
          template={modalTemplate}
          onClose={handleCloseModal}
          onSave={handleSave}
        />
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-semibold text-foreground mb-2">Excluir template?</h3>
            <p className="text-sm text-muted-foreground mb-5">
              O template <span className="font-medium text-foreground">"{deleteTarget.name}"</span> será excluído permanentemente. Esta ação não pode ser desfeita.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
