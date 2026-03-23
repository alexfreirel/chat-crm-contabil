'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE_URL } from '@/lib/api';
import {
  Send, Plus, FileText, ChevronDown, Bot, User,
  Copy, Check, Loader2, Paperclip, X, Sparkles,
  Trash2, MessageSquare, Cpu, BookOpen, AlertCircle,
  Download, ChevronRight, Zap,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────

interface Skill {
  id: string;
  name: string;
  description: string | null;
  skillType: string;
  provider: string;
  triggerKeywords: string[];
  assetCount: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  title: string;
  skillId: string;
  model: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

interface AttachedFile {
  name: string;
  content: string;
  size: number;
}

// ─── Constants ──────────────────────────────────────────────

const MODELS = [
  { id: 'claude-haiku-4-5',  label: 'Claude Haiku',  desc: 'Rápido e econômico',   badge: 'Rápido' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet', desc: 'Equilíbrio custo/qualidade', badge: 'Recomendado' },
  { id: 'claude-opus-4-6',   label: 'Claude Opus',   desc: 'Máxima qualidade',      badge: 'Premium' },
];

const STORAGE_KEY = 'peticoes_conversations';
const MAX_CONVERSATIONS = 50;

// ─── Markdown Renderer ──────────────────────────────────────

function renderMarkdown(text: string): string {
  if (!text) return '';

  // Escape HTML first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="bg-muted/60 rounded-lg p-3 my-2 overflow-x-auto text-sm font-mono"><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">$1</code>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-base font-bold mt-4 mb-1">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-5 mb-2 border-b border-border pb-1">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-5 mb-2">$1</h1>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr class="border-border my-4" />');

  // Unordered lists
  html = html.replace(/^([ \t]*)[*\-] (.+)$/gm, (_, indent, item) => {
    const level = indent.length > 0 ? ' ml-4' : '';
    return `<li class="ml-4${level} list-disc">${item}</li>`;
  });

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>');

  // Wrap consecutive <li> in <ul>/<ol>
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => {
    return `<ul class="my-2 space-y-1">${match}</ul>`;
  });

  // Paragraphs (double newline)
  html = html.replace(/\n\n/g, '</p><p class="mb-2">');
  html = `<p class="mb-2">${html}</p>`;

  // Single newlines
  html = html.replace(/\n/g, '<br/>');

  return html;
}

// ─── Helpers ────────────────────────────────────────────────

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConversations(convs: Conversation[]) {
  try {
    // Keep only last MAX_CONVERSATIONS
    const trimmed = convs.slice(-MAX_CONVERSATIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage full — ignore
  }
}

function getConvTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user');
  if (!first) return 'Nova Conversa';
  return first.content.slice(0, 60) + (first.content.length > 60 ? '…' : '');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return `${diffDays}d atrás`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

// ─── Message Component ──────────────────────────────────────

function MessageBubble({
  msg,
  isStreaming,
}: {
  msg: ChatMessage;
  isStreaming: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = msg.role === 'user';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([msg.content], { type: 'text/plain; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `peticao-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[80%] flex items-end gap-2">
          <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap shadow-sm">
            {msg.content}
          </div>
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
            <User size={14} className="text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-4 group">
      <div className="max-w-[85%] flex items-start gap-2">
        <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 mt-1">
          <Sparkles size={13} className="text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed shadow-sm prose-custom"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
          />
          {isStreaming && msg.content === '' && (
            <div className="flex gap-1 mt-2 ml-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}
          {!isStreaming && msg.content && (
            <div className="flex gap-1.5 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground text-[11px] transition-colors"
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground text-[11px] transition-colors"
              >
                <Download size={11} />
                Salvar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────

export default function PeticoesPage() {
  // Skills
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(true);
  const [selectedSkillId, setSelectedSkillId] = useState<string>('default');
  const [showSkillMenu, setShowSkillMenu] = useState(false);

  // Model
  const [selectedModel, setSelectedModel] = useState<string>('claude-sonnet-4-6');
  const [showModelMenu, setShowModelMenu] = useState(false);

  // Conversations
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);

  // UI
  const [sidebarWidth, setSidebarWidth] = useState<'normal' | 'collapsed'>('normal');

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const skillMenuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  // ─── Init ──────────────────────────────────────────────

  useEffect(() => {
    const savedConvs = loadConversations();
    setConversations(savedConvs);
    // Auto-select last conversation
    if (savedConvs.length > 0) {
      const last = savedConvs[savedConvs.length - 1];
      setActiveConvId(last.id);
      setMessages(last.messages);
      setSelectedSkillId(last.skillId);
      setSelectedModel(last.model);
    }

    // Load skills
    const token = localStorage.getItem('token');
    fetch(`${API_BASE_URL}/petitions/chat/skills`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSkills(data);
      })
      .catch(() => {})
      .finally(() => setLoadingSkills(false));
  }, []);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close menus on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (skillMenuRef.current && !skillMenuRef.current.contains(e.target as Node)) {
        setShowSkillMenu(false);
      }
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  // ─── Conversation Management ───────────────────────────

  const createNewConversation = useCallback(() => {
    const id = genId();
    const conv: Conversation = {
      id,
      title: 'Nova Conversa',
      skillId: selectedSkillId,
      model: selectedModel,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setConversations((prev) => {
      const next = [...prev, conv];
      saveConversations(next);
      return next;
    });
    setActiveConvId(id);
    setMessages([]);
    setStreamError(null);
    setAttachedFile(null);
    setInput('');
  }, [selectedSkillId, selectedModel]);

  const selectConversation = useCallback((conv: Conversation) => {
    if (isStreaming) return;
    setActiveConvId(conv.id);
    setMessages(conv.messages);
    setSelectedSkillId(conv.skillId);
    setSelectedModel(conv.model);
    setStreamError(null);
    setAttachedFile(null);
  }, [isStreaming]);

  const deleteConversation = useCallback((convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== convId);
      saveConversations(next);
      return next;
    });
    if (activeConvId === convId) {
      setActiveConvId(null);
      setMessages([]);
    }
  }, [activeConvId]);

  const persistMessages = useCallback(
    (convId: string, msgs: ChatMessage[], skillId: string, model: string) => {
      setConversations((prev) => {
        const next = prev.map((c) => {
          if (c.id !== convId) return c;
          return {
            ...c,
            messages: msgs,
            title: getConvTitle(msgs),
            skillId,
            model,
            updatedAt: new Date().toISOString(),
          };
        });
        saveConversations(next);
        return next;
      });
    },
    [],
  );

  // ─── Send Message ──────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text && !attachedFile) return;
    if (isStreaming) return;

    setStreamError(null);

    // Build user content
    let userContent = text;
    if (attachedFile) {
      userContent = `--- Arquivo: ${attachedFile.name} ---\n${attachedFile.content}\n\n${text}`;
      setAttachedFile(null);
    }

    // Ensure there's an active conversation
    let convId = activeConvId;
    if (!convId) {
      const id = genId();
      const conv: Conversation = {
        id,
        title: 'Nova Conversa',
        skillId: selectedSkillId,
        model: selectedModel,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setConversations((prev) => {
        const next = [...prev, conv];
        saveConversations(next);
        return next;
      });
      convId = id;
      setActiveConvId(id);
    }

    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      content: userContent,
      createdAt: new Date().toISOString(),
    };

    const assistantMsg: ChatMessage = {
      id: genId(),
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    };

    const newMessages = [...messages, userMsg, assistantMsg];
    setMessages(newMessages);
    setInput('');
    setIsStreaming(true);

    const token = localStorage.getItem('token');
    const controller = new AbortController();
    abortRef.current = controller;

    // Build API messages (exclude the empty assistant placeholder)
    const apiMessages = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Use custom prompt as override if set
    const effectiveSkillId =
      selectedSkillId === 'custom' ? 'default' : selectedSkillId;
    const effectiveSystem = selectedSkillId === 'custom' ? customPrompt : undefined;

    try {
      const res = await fetch(`${API_BASE_URL}/petitions/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: apiMessages,
          skillId: effectiveSkillId,
          model: selectedModel,
          ...(effectiveSystem ? { systemPrompt: effectiveSystem } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Erro desconhecido' }));
        throw new Error(err.message || `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'text') {
              fullText += data.text;
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: fullText };
                }
                return updated;
              });
            } else if (data.type === 'error') {
              throw new Error(data.message);
            } else if (data.type === 'done') {
              break;
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }

      // Save completed conversation
      const finalMsgs: ChatMessage[] = [
        ...messages,
        userMsg,
        { ...assistantMsg, content: fullText },
      ];
      persistMessages(convId, finalMsgs, selectedSkillId, selectedModel);
      setMessages(finalMsgs);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      const errMsg = err?.message || 'Erro ao conectar com a IA';
      setStreamError(errMsg);
      // Remove the empty assistant message
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id));
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [
    input, attachedFile, isStreaming, activeConvId, messages,
    selectedSkillId, selectedModel, customPrompt, persistMessages,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleStopStreaming = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  // ─── File Attachment ───────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 500 * 1024; // 500KB
    if (file.size > maxSize) {
      setStreamError('Arquivo muito grande. Use arquivos de até 500KB.');
      return;
    }

    const allowedTypes = [
      'text/plain', 'text/markdown', 'text/html',
      'application/json',
    ];
    const ext = file.name.split('.').pop()?.toLowerCase();
    const allowedExts = ['txt', 'md', 'json', 'html', 'htm', 'csv'];

    if (!allowedTypes.includes(file.type) && !allowedExts.includes(ext || '')) {
      setStreamError('Tipo de arquivo não suportado. Use .txt, .md, .json, .csv ou .html');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setAttachedFile({
        name: file.name,
        content: ev.target?.result as string,
        size: file.size,
      });
      setStreamError(null);
    };
    reader.readAsText(file, 'UTF-8');

    // Reset input so same file can be re-attached
    e.target.value = '';
  };

  // ─── Derived state ─────────────────────────────────────

  const selectedSkill = selectedSkillId === 'default'
    ? null
    : selectedSkillId === 'custom'
    ? { name: 'Prompt Personalizado', description: customPrompt.slice(0, 60) }
    : skills.find((s) => s.id === selectedSkillId);

  const selectedModelInfo = MODELS.find((m) => m.id === selectedModel) || MODELS[1];

  const sortedConversations = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* ─── Left Sidebar ────────────────────────────── */}
      <aside
        className={`${
          sidebarWidth === 'normal' ? 'w-72' : 'w-14'
        } hidden md:flex flex-col border-r border-border bg-card shrink-0 transition-all duration-200`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <FileText size={16} className="text-amber-500" />
          </div>
          {sidebarWidth === 'normal' && (
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-bold text-foreground">IA Jurídica</h1>
              <p className="text-[11px] text-muted-foreground truncate">Assistente de Petições</p>
            </div>
          )}
        </div>

        {sidebarWidth === 'normal' && (
          <>
            {/* New Conversation Button */}
            <div className="px-3 pt-3">
              <button
                onClick={createNewConversation}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
              >
                <Plus size={16} />
                Nova Conversa
              </button>
            </div>

            {/* ── Skill Selector ── */}
            <div className="px-3 pt-3" ref={skillMenuRef}>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 px-1">
                Skill Ativa
              </p>
              <button
                onClick={() => setShowSkillMenu(!showSkillMenu)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-border bg-background hover:bg-muted/50 transition-colors text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <BookOpen size={14} className="text-amber-500 shrink-0" />
                  <span className="truncate text-foreground font-medium">
                    {selectedSkillId === 'default'
                      ? 'Assistente Padrão'
                      : selectedSkillId === 'custom'
                      ? 'Prompt Personalizado'
                      : (selectedSkill as Skill)?.name || 'Selecionar...'}
                  </span>
                </div>
                <ChevronDown size={14} className="text-muted-foreground shrink-0" />
              </button>

              {showSkillMenu && (
                <div className="mt-1 rounded-xl border border-border bg-card shadow-xl overflow-hidden max-h-72 overflow-y-auto z-50 relative">
                  {/* Default */}
                  <button
                    onClick={() => { setSelectedSkillId('default'); setShowSkillMenu(false); setShowCustomPrompt(false); }}
                    className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors ${selectedSkillId === 'default' ? 'bg-amber-500/10' : ''}`}
                  >
                    <Sparkles size={14} className="text-amber-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Assistente Padrão</p>
                      <p className="text-[11px] text-muted-foreground">Assistente jurídico geral</p>
                    </div>
                  </button>

                  {loadingSkills && (
                    <div className="flex items-center gap-2 px-3 py-2.5 text-muted-foreground text-sm">
                      <Loader2 size={14} className="animate-spin" />
                      Carregando skills...
                    </div>
                  )}

                  {/* Skills from system */}
                  {skills.map((skill) => (
                    <button
                      key={skill.id}
                      onClick={() => { setSelectedSkillId(skill.id); setShowSkillMenu(false); setShowCustomPrompt(false); }}
                      className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors border-t border-border/50 ${selectedSkillId === skill.id ? 'bg-amber-500/10' : ''}`}
                    >
                      <Bot size={14} className="text-blue-500 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{skill.name}</p>
                        {skill.description && (
                          <p className="text-[11px] text-muted-foreground line-clamp-2">{skill.description}</p>
                        )}
                        {skill.assetCount > 0 && (
                          <span className="text-[10px] text-green-600 font-medium">
                            {skill.assetCount} referência{skill.assetCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}

                  {/* Custom prompt */}
                  <button
                    onClick={() => { setSelectedSkillId('custom'); setShowSkillMenu(false); setShowCustomPrompt(true); }}
                    className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors border-t border-border ${selectedSkillId === 'custom' ? 'bg-amber-500/10' : ''}`}
                  >
                    <Zap size={14} className="text-purple-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Prompt Personalizado</p>
                      <p className="text-[11px] text-muted-foreground">Cole seu prompt do Claude Desktop</p>
                    </div>
                  </button>
                </div>
              )}

              {/* Custom Prompt Textarea */}
              {selectedSkillId === 'custom' && showCustomPrompt && (
                <div className="mt-2">
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Cole aqui o system prompt da sua skill do Claude Desktop..."
                    rows={6}
                    className="w-full text-xs bg-background border border-border rounded-xl px-3 py-2 resize-none text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={() => setShowCustomPrompt(false)}
                    className="mt-1 text-[11px] text-primary hover:underline"
                  >
                    Salvar e fechar
                  </button>
                </div>
              )}
            </div>

            {/* ── Model Selector ── */}
            <div className="px-3 pt-3" ref={modelMenuRef}>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 px-1">
                Modelo
              </p>
              <button
                onClick={() => setShowModelMenu(!showModelMenu)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-border bg-background hover:bg-muted/50 transition-colors text-sm"
              >
                <div className="flex items-center gap-2">
                  <Cpu size={14} className="text-blue-500 shrink-0" />
                  <span className="font-medium text-foreground truncate">{selectedModelInfo.label}</span>
                </div>
                <ChevronDown size={14} className="text-muted-foreground shrink-0" />
              </button>

              {showModelMenu && (
                <div className="mt-1 rounded-xl border border-border bg-card shadow-xl overflow-hidden z-50 relative">
                  {MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setSelectedModel(m.id); setShowModelMenu(false); }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors ${selectedModel === m.id ? 'bg-primary/10' : ''} ${m !== MODELS[0] ? 'border-t border-border/50' : ''}`}
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{m.label}</p>
                        <p className="text-[11px] text-muted-foreground">{m.desc}</p>
                      </div>
                      {m.badge && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                          m.badge === 'Recomendado' ? 'bg-green-500/10 text-green-600' :
                          m.badge === 'Premium'     ? 'bg-purple-500/10 text-purple-600' :
                          'bg-blue-500/10 text-blue-600'
                        }`}>{m.badge}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Conversations List ── */}
            <div className="flex-1 overflow-y-auto px-3 pt-4 pb-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">
                Conversas Recentes
              </p>

              {sortedConversations.length === 0 ? (
                <p className="text-[12px] text-muted-foreground text-center py-4">
                  Nenhuma conversa ainda
                </p>
              ) : (
                <div className="space-y-0.5">
                  {sortedConversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={`group flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition-colors ${
                        activeConvId === conv.id
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-muted/50 text-foreground'
                      }`}
                      onClick={() => selectConversation(conv)}
                    >
                      <MessageSquare size={13} className="text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium truncate leading-snug">{conv.title}</p>
                        <p className="text-[10px] text-muted-foreground">{formatDate(conv.updatedAt)}</p>
                      </div>
                      <button
                        onClick={(e) => deleteConversation(conv.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-destructive/10 hover:text-destructive transition-all"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </aside>

      {/* ─── Main Chat Area ───────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="md:hidden w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <FileText size={16} className="text-amber-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {activeConvId
                  ? (conversations.find((c) => c.id === activeConvId)?.title || 'Nova Conversa')
                  : 'Assistente de Petições'}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {selectedSkillId === 'default'
                    ? 'Assistente Padrão'
                    : selectedSkillId === 'custom'
                    ? 'Prompt Personalizado'
                    : skills.find((s) => s.id === selectedSkillId)?.name || ''}
                </span>
                {selectedSkillId !== 'default' && <span className="text-muted-foreground/50">·</span>}
                <span className="text-[11px] text-muted-foreground">{selectedModelInfo.label}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isStreaming && (
              <button
                onClick={handleStopStreaming}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive text-[12px] font-medium transition-colors"
              >
                <X size={12} />
                Parar
              </button>
            )}
            <button
              onClick={createNewConversation}
              className="md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus size={12} />
              Nova
            </button>
          </div>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
                <Sparkles size={28} className="text-amber-500" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">Assistente de Petições</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                Redija petições, recursos, contestações e outros documentos jurídicos com auxílio da IA.
                Selecione uma skill no painel lateral ou use o Assistente Padrão.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                {[
                  { text: 'Redija uma petição inicial trabalhista por rescisão indireta', icon: '⚖️' },
                  { text: 'Elabore um recurso ordinário para o TST impugnando danos morais', icon: '📋' },
                  { text: 'Calcule os prazos processuais para contestação no CPC', icon: '📅' },
                  { text: 'Analise a viabilidade de uma ação de habeas corpus', icon: '🔍' },
                ].map((s) => (
                  <button
                    key={s.text}
                    onClick={() => { setInput(s.text); textareaRef.current?.focus(); }}
                    className="flex items-start gap-2 p-3 rounded-xl border border-border bg-card hover:bg-muted/50 text-left text-sm text-foreground transition-colors"
                  >
                    <span className="text-base shrink-0">{s.icon}</span>
                    <span className="text-[12px] text-muted-foreground leading-relaxed">{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto">
              {messages.map((msg, idx) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  isStreaming={isStreaming && idx === messages.length - 1}
                />
              ))}
            </div>
          )}

          {/* Error */}
          {streamError && (
            <div className="max-w-3xl mx-auto mt-2">
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                <AlertCircle size={16} className="shrink-0" />
                <span>{streamError}</span>
                <button onClick={() => setStreamError(null)} className="ml-auto">
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="shrink-0 border-t border-border bg-card px-4 py-3">
          <div className="max-w-3xl mx-auto">
            {/* Attached file indicator */}
            {attachedFile && (
              <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-muted/50 border border-border text-sm">
                <FileText size={14} className="text-blue-500 shrink-0" />
                <span className="flex-1 truncate text-foreground text-[12px]">{attachedFile.name}</span>
                <span className="text-muted-foreground text-[11px]">
                  {(attachedFile.size / 1024).toFixed(1)}KB
                </span>
                <button
                  onClick={() => setAttachedFile(null)}
                  className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            <div className="flex items-end gap-2">
              {/* File attach */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.json,.csv,.html,.htm"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming}
                className="p-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                title="Anexar arquivo (.txt, .md, .json, .csv)"
              >
                <Paperclip size={18} />
              </button>

              {/* Textarea */}
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Descreva a petição ou faça uma pergunta jurídica... (Enter para enviar, Shift+Enter para nova linha)"
                  rows={1}
                  disabled={isStreaming}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 min-h-[46px] max-h-[200px] leading-relaxed"
                />
              </div>

              {/* Send / Stop button */}
              {isStreaming ? (
                <button
                  onClick={handleStopStreaming}
                  className="p-2.5 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                >
                  <X size={18} />
                </button>
              ) : (
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() && !attachedFile}
                  className="p-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                  <Send size={18} />
                </button>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground text-center mt-2">
              {selectedModelInfo.label} · Conteúdo gerado por IA — revise antes de usar em processos judiciais
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
