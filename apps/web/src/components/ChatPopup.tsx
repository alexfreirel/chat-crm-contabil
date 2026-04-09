'use client';

/**
 * ChatPopup — Mini-chat flutuante para falar com um cliente diretamente
 * de qualquer tela (ex.: menu de Processos), sem sair da página.
 *
 * Funcionalidades:
 * - Resolve a conversa ativa do lead (via conversation_id ou GET /conversations/lead/:leadId)
 * - Exibe histórico de mensagens com scroll automático
 * - Envio de mensagens em tempo real
 * - Atualizações via Socket.io (newMessage, messageUpdate)
 * - Fecha com Esc ou clique no overlay
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { X, Send, MessageSquare, Loader2, AlertCircle } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import api from '@/lib/api';

// ─── Tipos locais ────────────────────────────────────────────────────────────

interface MiniMessage {
  id: string;
  conversation_id: string;
  direction: 'in' | 'out';
  type: string;
  text: string | null;
  status: string;
  created_at: string;
  media?: {
    original_url?: string;
    mime_type?: string;
    original_name?: string | null;
  } | null;
}

export interface ChatPopupProps {
  /** ID do lead para buscar a conversa ativa */
  leadId: string;
  /** Nome do cliente (exibição no header) */
  leadName: string | null;
  /** ID da conversa já conhecida (evita busca extra) */
  conversationId?: string | null;
  /** Callback para fechar o popup */
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getWsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
  if (apiUrl.startsWith('http')) {
    try { return new URL(apiUrl).origin; } catch { /* fall through */ }
  }
  return typeof window !== 'undefined' ? window.location.origin : '';
}

function getSocketPath(): string {
  return process.env.NEXT_PUBLIC_SOCKET_PATH || '/socket.io/';
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ─── Componente de bolha de mensagem ─────────────────────────────────────────

function MiniMessageBubble({ msg }: { msg: MiniMessage }) {
  const isOut = msg.direction === 'out';
  const time = formatTime(msg.created_at);

  let content: React.ReactNode;
  if (msg.type === 'image' && msg.media?.original_url) {
    content = (
      <a href={msg.media.original_url} target="_blank" rel="noopener noreferrer">
        <img
          src={msg.media.original_url}
          alt="imagem"
          className="max-w-[200px] rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
        />
      </a>
    );
  } else if (msg.type === 'audio') {
    content = <span className="text-xs italic opacity-80">🎵 Áudio</span>;
  } else if (msg.type === 'video' && msg.media?.original_url) {
    content = (
      <a href={msg.media.original_url} target="_blank" rel="noopener noreferrer"
         className="text-xs underline opacity-80">
        🎬 Vídeo
      </a>
    );
  } else if ((msg.type === 'document' || msg.type === 'file') && msg.media) {
    content = (
      <a href={msg.media.original_url} target="_blank" rel="noopener noreferrer"
         className="text-xs underline opacity-90 flex items-center gap-1">
        📄 {msg.media.original_name || 'Documento'}
      </a>
    );
  } else {
    content = (
      <span className="text-sm whitespace-pre-wrap break-words leading-relaxed">
        {msg.text || ''}
      </span>
    );
  }

  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[78%] px-3 py-2 rounded-2xl ${
          isOut
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-muted text-foreground rounded-bl-sm'
        }`}
      >
        {content}
        <p className={`text-[10px] mt-1 ${isOut ? 'text-primary-foreground/60 text-right' : 'text-muted-foreground'}`}>
          {time}
        </p>
      </div>
    </div>
  );
}

// ─── ChatPopup principal ──────────────────────────────────────────────────────

export function ChatPopup({ leadId, leadName, conversationId: initialConvId, onClose }: ChatPopupProps) {
  const [resolvedConvId, setResolvedConvId] = useState<string | null>(initialConvId ?? null);
  const [messages, setMessages] = useState<MiniMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [noConversation, setNoConversation] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const convIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Resolve conversa ativa ──────────────────────────────────────────────
  const resolveConversation = useCallback(async (): Promise<string | null> => {
    // 1. Usa o ID já conhecido
    if (initialConvId) return initialConvId;

    // 2. Busca conversas do lead e pega a mais recente ativa
    try {
      const res = await api.get(`/conversations/lead/${leadId}`);
      const convs: any[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
      const active = convs.find((c) => c.status !== 'ENCERRADO') || convs[0];
      return active?.id ?? null;
    } catch {
      return null;
    }
  }, [initialConvId, leadId]);

  // ── Busca mensagens ─────────────────────────────────────────────────────
  const fetchMessages = useCallback(async (convId: string) => {
    try {
      const res = await api.get(`/messages/conversation/${convId}`, {
        params: { page: 1, limit: 100 },
      });
      const msgs: MiniMessage[] = Array.isArray(res.data)
        ? res.data
        : (res.data?.data ?? []);
      // API retorna DESC (mais recente primeiro) — invertemos para exibir ASC
      setMessages([...msgs].reverse());
    } catch {
      setFetchError('Erro ao carregar mensagens');
    }
  }, []);

  // ── Inicializa: resolve conversa → mensagens → socket ──────────────────
  useEffect(() => {
    let socket: Socket | null = null;
    let mounted = true;

    const init = async () => {
      setLoading(true);
      setNoConversation(false);
      setFetchError(null);

      const convId = await resolveConversation();

      if (!mounted) return;

      if (!convId) {
        setNoConversation(true);
        setLoading(false);
        return;
      }

      setResolvedConvId(convId);
      convIdRef.current = convId;
      await fetchMessages(convId);

      if (!mounted) return;
      setLoading(false);

      // ── Socket ────────────────────────────────────────────────────────
      socket = io(getWsUrl(), {
        path: getSocketPath(),
        transports: ['polling', 'websocket'],
        auth: { token: localStorage.getItem('token') || '' },
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        socket?.emit('join_conversation', convId);
      });

      socket.on('newMessage', (msg: MiniMessage) => {
        if (msg.conversation_id !== convIdRef.current) return;
        setMessages((prev) => {
          // dedup por id e external_message_id
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      });

      socket.on('messageUpdate', (updated: MiniMessage) => {
        if (updated.conversation_id !== convIdRef.current) return;
        setMessages((prev) =>
          prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
        );
      });
    };

    init();

    return () => {
      mounted = false;
      if (socket) {
        if (convIdRef.current) socket.emit('leave_conversation', convIdRef.current);
        socket.disconnect();
      }
    };
  }, [resolveConversation, fetchMessages]);

  // ── Auto-scroll para última mensagem ────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Fechar com Esc ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // ── Auto-resize textarea ────────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  // ── Enviar mensagem ─────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!text.trim() || !resolvedConvId || sending) return;
    const msgText = text.trim();
    setText('');
    setSending(true);
    try {
      await api.post('/messages/send', { conversationId: resolvedConvId, text: msgText });
    } catch {
      setText(msgText); // restaura em caso de erro
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const firstName = (leadName || 'Cliente').split(' ')[0];
  const initial = firstName[0]?.toUpperCase() ?? 'C';

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    // Overlay escuro — clique fora fecha
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Janela do popup */}
      <div
        className="relative bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        style={{ width: 'min(500px, 95vw)', height: 'min(660px, 88vh)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-sm shrink-0">
            {initial}
          </div>

          {/* Nome + status */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{leadName || 'Cliente'}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MessageSquare size={10} />
              {loading ? 'Carregando conversa…' : noConversation ? 'Sem conversa ativa' : 'Chat direto'}
            </p>
          </div>

          {/* Fechar */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
            title="Fechar (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Área de mensagens ── */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={22} className="animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Sem conversa */}
          {!loading && noConversation && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <MessageSquare size={22} className="text-muted-foreground/60" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Nenhuma conversa encontrada</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {leadName ? `${firstName} ainda` : 'Este cliente ainda'} não possui histórico de chat.
                  <br />Inicie o contato pelo WhatsApp.
                </p>
              </div>
            </div>
          )}

          {/* Erro de carregamento */}
          {!loading && fetchError && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-destructive flex items-center gap-2">
                <AlertCircle size={16} /> {fetchError}
              </p>
            </div>
          )}

          {/* Mensagens */}
          {!loading && !noConversation && !fetchError && messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-xs text-muted-foreground">Nenhuma mensagem ainda</p>
            </div>
          )}

          {!loading && !noConversation && !fetchError && messages.map((msg) => (
            <MiniMessageBubble key={msg.id} msg={msg} />
          ))}

          {/* Âncora de scroll */}
          <div ref={bottomRef} />
        </div>

        {/* ── Input de envio ── */}
        {!loading && !noConversation && !fetchError && resolvedConvId && (
          <div className="px-3 py-3 border-t border-border bg-card shrink-0 flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Mensagem… (Enter para enviar)"
              rows={1}
              className="flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 overflow-y-auto transition-colors"
              style={{ minHeight: '40px', maxHeight: '120px' }}
            />
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              title="Enviar (Enter)"
              className="p-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:pointer-events-none shrink-0"
            >
              {sending
                ? <Loader2 size={16} className="animate-spin" />
                : <Send size={16} />
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
