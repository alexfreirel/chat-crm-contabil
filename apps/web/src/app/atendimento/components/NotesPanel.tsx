'use client';

import { useEffect, useState, useRef } from 'react';
import { X, Send, Sparkles, StickyNote } from 'lucide-react';
import api from '@/lib/api';
import { showError, showSuccess } from '@/lib/toast';
import type { ConversationNoteItem } from '../types';
import type { Socket } from 'socket.io-client';

interface NotesPanelProps {
  conversationId: string;
  onClose: () => void;
  socketRef: React.RefObject<Socket | null>;
}

export function NotesPanel({ conversationId, onClose, socketRef }: NotesPanelProps) {
  const [notes, setNotes] = useState<ConversationNoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch notes on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/conversations/${conversationId}/notes`);
        setNotes(res.data || []);
      } catch {
        showError('Erro ao carregar notas.');
      } finally {
        setLoading(false);
      }
    })();
  }, [conversationId]);

  // Socket listener for real-time notes
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const handler = (note: ConversationNoteItem) => {
      if (note.conversation_id === conversationId) {
        setNotes(prev => {
          if (prev.some(n => n.id === note.id)) return prev;
          return [...prev, note];
        });
      }
    };
    socket.on('newNote', handler);
    return () => { socket.off('newNote', handler); };
  }, [conversationId, socketRef]);

  // Auto-scroll when notes change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [notes]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    const noteText = text.trim();
    setSending(true);
    setText('');
    try {
      await api.post(`/conversations/${conversationId}/notes`, { text: noteText });
    } catch {
      showError('Erro ao salvar nota.');
      setText(noteText);
    } finally {
      setSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const handleCorrectWithAI = async () => {
    if (!text.trim() || correcting) return;
    setCorrecting(true);
    try {
      const res = await api.post('/messages/ai-correct', { text: text.trim(), action: 'profissional' });
      if (res.data?.result) {
        setText(res.data.result);
        showSuccess('Texto corrigido pela IA.');
      }
    } catch {
      showError('Erro ao corrigir com IA.');
    } finally {
      setCorrecting(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Hoje ${time}`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ` ${time}`;
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[380px] z-50 bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <StickyNote size={18} className="text-amber-400" />
            <h2 className="text-sm font-bold text-foreground">Notas da Conversa</h2>
            {notes.length > 0 && (
              <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                {notes.length}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        {/* Notes list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 opacity-50">
              <StickyNote size={40} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhuma nota para esta conversa.</p>
              <p className="text-xs text-muted-foreground">Adicione notas para outros operadores verem.</p>
            </div>
          ) : (
            notes.map(note => (
              <div key={note.id} className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                    {note.user?.name || 'Operador'}
                  </span>
                  <span className="text-[10px] text-amber-400/50">{formatDate(note.created_at)}</span>
                </div>
                <p className="text-sm text-amber-100/90 leading-relaxed whitespace-pre-wrap">{note.text}</p>
              </div>
            ))
          )}
        </div>

        {/* Input area */}
        <div className="shrink-0 border-t border-border p-4">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder="Escreva uma nota para a equipe..."
            rows={2}
            className="w-full resize-none rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-sm text-amber-100 placeholder:text-amber-400/40 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
          />
          <div className="flex items-center justify-between mt-2">
            <button
              onClick={handleCorrectWithAI}
              disabled={!text.trim() || correcting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-lg hover:bg-violet-500/20 transition-colors disabled:opacity-40"
            >
              {correcting ? (
                <div className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}
              Corrigir com IA
            </button>
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-bold text-amber-900 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors disabled:opacity-40"
            >
              {sending ? (
                <div className="w-3 h-3 border-2 border-amber-900 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send size={12} />
              )}
              Salvar Nota
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
