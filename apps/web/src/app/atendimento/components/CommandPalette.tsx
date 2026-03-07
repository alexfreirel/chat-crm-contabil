'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, MessageSquare, Bot, ArrowRightLeft, XCircle, Clock } from 'lucide-react';
import type { ConversationSummary } from '../types';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  conversations: ConversationSummary[];
  selectedId: string | null;
  onSelectConversation: (id: string) => void;
  onToggleAI: () => void;
  onOpenTransferModal: () => void;
  onCloseConversation: () => void;
}

interface PaletteItem {
  id: string;
  type: 'conversation' | 'action';
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

export function CommandPalette({
  open,
  onClose,
  conversations,
  selectedId,
  onSelectConversation,
  onToggleAI,
  onOpenTransferModal,
  onCloseConversation,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build items list
  const items: PaletteItem[] = [];

  // Recent conversations
  const recentIds: string[] = (() => {
    try { return JSON.parse(sessionStorage.getItem('recent_convs') || '[]'); } catch { return []; }
  })();

  const q = query.toLowerCase().trim();

  if (!q) {
    // Show recent conversations when no query
    const recentConvs = recentIds
      .map(id => conversations.find(c => c.id === id))
      .filter((c): c is ConversationSummary => !!c)
      .slice(0, 5);

    recentConvs.forEach(conv => {
      items.push({
        id: `recent-${conv.id}`,
        type: 'conversation',
        label: conv.contactName,
        sublabel: conv.contactPhone,
        icon: <Clock size={14} className="text-muted-foreground/60" />,
        onSelect: () => onSelectConversation(conv.id),
      });
    });
  } else {
    // Filter conversations by query
    const filtered = conversations.filter(c =>
      c.contactName.toLowerCase().includes(q) ||
      c.contactPhone.toLowerCase().includes(q)
    ).slice(0, 10);

    filtered.forEach(conv => {
      items.push({
        id: `conv-${conv.id}`,
        type: 'conversation',
        label: conv.contactName,
        sublabel: conv.contactPhone,
        icon: <MessageSquare size={14} className="text-muted-foreground/60" />,
        onSelect: () => onSelectConversation(conv.id),
      });
    });
  }

  // Quick actions (only when a conversation is selected)
  if (selectedId && !selectedId.startsWith('demo-')) {
    const actions: PaletteItem[] = [
      {
        id: 'action-ai',
        type: 'action',
        label: 'Alternar modo IA',
        sublabel: 'Ctrl+Shift+A',
        icon: <Bot size={14} className="text-blue-400" />,
        onSelect: () => { onToggleAI(); onClose(); },
      },
      {
        id: 'action-transfer',
        type: 'action',
        label: 'Transferir conversa',
        icon: <ArrowRightLeft size={14} className="text-amber-400" />,
        onSelect: () => { onOpenTransferModal(); onClose(); },
      },
      {
        id: 'action-close',
        type: 'action',
        label: 'Fechar conversa',
        icon: <XCircle size={14} className="text-red-400" />,
        onSelect: () => { onCloseConversation(); onClose(); },
      },
    ];

    // Filter actions by query if there is one
    const filteredActions = q
      ? actions.filter(a => a.label.toLowerCase().includes(q))
      : actions;

    items.push(...filteredActions);
  }

  // Clamp selected index
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Auto-focus input
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[selectedIndex]) items[selectedIndex].onSelect();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [items, selectedIndex, onClose]);

  if (!open) return null;

  const convItems = items.filter(i => i.type === 'conversation');
  const actionItems = items.filter(i => i.type === 'action');

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search size={16} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar conversa ou acao..."
            className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground/60"
          />
          <kbd className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {items.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum resultado encontrado
            </div>
          )}

          {/* Conversations section */}
          {convItems.length > 0 && (
            <>
              <div className="px-4 pt-2 pb-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  {q ? 'Conversas' : 'Recentes'}
                </span>
              </div>
              {convItems.map((item) => {
                const globalIdx = items.indexOf(item);
                return (
                  <button
                    key={item.id}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      globalIdx === selectedIndex ? 'bg-accent' : 'hover:bg-accent/50'
                    }`}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                    onClick={item.onSelect}
                  >
                    {item.icon}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate">{item.label}</p>
                      {item.sublabel && (
                        <p className="text-[11px] text-muted-foreground truncate">{item.sublabel}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </>
          )}

          {/* Actions section */}
          {actionItems.length > 0 && (
            <>
              <div className="px-4 pt-3 pb-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Acoes rapidas
                </span>
              </div>
              {actionItems.map((item) => {
                const globalIdx = items.indexOf(item);
                return (
                  <button
                    key={item.id}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      globalIdx === selectedIndex ? 'bg-accent' : 'hover:bg-accent/50'
                    }`}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                    onClick={item.onSelect}
                  >
                    {item.icon}
                    <span className="text-[13px] font-medium flex-1">{item.label}</span>
                    {item.sublabel && (
                      <span className="text-[10px] text-muted-foreground font-mono">{item.sublabel}</span>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* Footer hints */}
        <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-[10px] text-muted-foreground">
          <span>↑↓ navegar</span>
          <span>↵ selecionar</span>
          <span>esc fechar</span>
        </div>
      </div>
    </div>
  );
}
