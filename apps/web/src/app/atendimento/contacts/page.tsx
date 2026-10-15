'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, User, Phone, Loader2, MessageSquare,
  UserPlus, AlertCircle, RefreshCw, CheckSquare,
  Square, Trash2, X, Pencil,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { formatPhone } from '@/lib/utils';
import { showError, showSuccess } from '@/lib/toast';
import NewContactModal from './components/NewContactModal';
import EditContactModal from './components/EditContactModal';
import { ClientPanel } from '@/components/ClientPanel';

type ChatStatus = 'BOT' | 'ACTIVE' | 'WAITING' | null;

interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string;
  cpf_cnpj?: string;
  conversations: number;
  conversationId?: string | null;
  lastMessage: string;
  origin: string;
  instanceName?: string;
  profile_picture_url?: string;
  stage: string;
  chatStatus: ChatStatus;
}

function getChatStatus(conv: any): ChatStatus {
  if (!conv || conv.status === 'FECHADO') return null;
  // Bot/IA e "Aguardando" não são mais usados — o atendente é atribuído a quem abre a conversa
  if (conv.assigned_user_id || conv.assigned_lawyer_id) return 'ACTIVE';
  return null;
}

const CHAT_STATUS_BADGE: Record<NonNullable<ChatStatus>, { label: string; classes: string; dot: string }> = {
  ACTIVE:  { label: 'Em atendimento', classes: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', dot: 'bg-emerald-500' },
  BOT:     { label: 'Bot ativo',      classes: 'bg-amber-500/10  text-amber-600  border-amber-500/20',  dot: 'bg-amber-500 animate-pulse' },
  WAITING: { label: 'Aguardando',     classes: 'bg-blue-500/10   text-blue-600   border-blue-500/20',   dot: 'bg-blue-500' },
};

function getTokenPayload(): any {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return null;
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

function getIsAdminFromToken(): boolean {
  const p = getTokenPayload();
  if (!p) return false;
  // suporta role (string) e roles (array)
  return p.role === 'ADMIN' || (Array.isArray(p.roles) && p.roles.includes('ADMIN'));
}

function getIsContadorFromToken(): boolean {
  const p = getTokenPayload();
  if (!p) return false;
  return (
    p.role === 'CONTADOR' || p.role === 'ADMIN' ||
    (Array.isArray(p.roles) && (p.roles.includes('CONTADOR') || p.roles.includes('ADMIN')))
  );
}

export default function ContactsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [showNewContact, setShowNewContact] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [isAdmin]    = useState<boolean>(getIsAdminFromToken);
  const [isContador] = useState<boolean>(getIsContadorFromToken);

  // Excluir em massa
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Paginação
  const [page, setPage] = useState(1);
  const [totalContacts, setTotalContacts] = useState(0);
  const PAGE_SIZE = 50;

  // ─── Seleção em massa ──────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Debounce search — 300ms
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search]);

  // Limpa seleção ao mudar de página
  useEffect(() => { setSelectedIds(new Set()); }, [page, debouncedSearch]);

  useEffect(() => {
    const leadId = new URLSearchParams(window.location.search).get('lead');
    if (leadId) setSelectedLeadId(leadId);
  }, []);

  const [loadError, setLoadError] = useState(false);

  const fetchAllContacts = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const params: Record<string, string> = {
        page: String(page),
        limit: String(PAGE_SIZE),
        // Mostra também contatos "perdidos" — senão o cadastro acusa "já existe" e a lista não exibe
        includeAllStages: 'true',
      };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      const response = await api.get('/leads', { params });
      const result = response.data;

      const leads = Array.isArray(result) ? result : (result.data || []);
      const total = result.total ?? leads.length;
      setTotalContacts(total);

      const mappedContacts: Contact[] = leads.map((lead: any) => ({
        id: lead.id,
        name: lead.name || 'Sem Nome',
        phone: lead.phone,
        email: lead.email || '-',
        cpf_cnpj: lead.cpf_cnpj || '',
        conversations: lead._count?.conversations || 0,
        conversationId: lead.conversations?.[0]?.id || null,
        lastMessage: lead.conversations?.[0]?.messages?.[0]?.text || '-',
        origin: lead.origin || 'crm',
        instanceName: lead.conversations?.[0]?.instance_name,
        profile_picture_url: lead.profile_picture_url,
        stage: lead.stage || 'INICIAL',
        chatStatus: getChatStatus(lead.conversations?.[0]),
      }));

      mappedContacts.sort((a, b) => a.name.localeCompare(b.name));
      setContacts(mappedContacts);
    } catch {
      setLoadError(true);
      showError('Não foi possível carregar contatos.');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchAllContacts();
    const onLogout = () => router.push('/atendimento/login');
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, [fetchAllContacts, router]);

  const totalPages = Math.ceil(totalContacts / PAGE_SIZE);

  const handleNewContactCreated = () => {
    setShowNewContact(false);
    showSuccess('Contato cadastrado com sucesso');
    fetchAllContacts();
  };

  const handleContactDeleted = (deletedId: string) => {
    setContacts(prev => prev.filter(c => c.id !== deletedId));
    setSelectedLeadId(null);
    setSelectedIds(prev => { const n = new Set(prev); n.delete(deletedId); return n; });
  };

  const handleContactUpdated = (updated: { id: string; name: string; phone: string; email?: string; cpf_cnpj?: string }) => {
    setContacts(prev => prev.map(c =>
      c.id === updated.id
        ? { ...c, name: updated.name, phone: updated.phone }
        : c
    ));
  };

  // ─── Helpers de seleção ────────────────────────────────────

  function toggleSelectAll() {
    if (allCurrentSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(activeContacts.map(c => c.id)));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Servidor já exclui PERDIDO quando stage não é passado — não filtrar no cliente
  const activeContacts = contacts;

  const allCurrentSelected = activeContacts.length > 0 && activeContacts.every(c => selectedIds.has(c.id));
  const someSelected = selectedIds.size > 0;
  const indeterminate = someSelected && !allCurrentSelected;

  // ─── Excluir contato individual ───────────────────────────
  const handleDeleteContact = async (id: string, name: string) => {
    if (!confirm(`Excluir permanentemente "${name}"?\n\nTodos os dados, conversas e histórico serão removidos. Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/leads/${id}`);
      handleContactDeleted(id);
      showSuccess('Contato excluído.');
    } catch {
      showError('Erro ao excluir contato.');
    }
  };

  // ─── Excluir selecionados ──────────────────────────────────
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Excluir permanentemente ${selectedIds.size} contato(s)?\n\nTodos os dados serão removidos. Esta ação não pode ser desfeita.`)) return;
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    try {
      const results = await Promise.allSettled(ids.map(id => api.delete(`/leads/${id}`)));
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      setContacts(prev => prev.filter(c => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
      setTotalContacts(t => Math.max(0, t - succeeded));
      if (failed === 0) showSuccess(`${succeeded} contato(s) excluído(s).`);
      else showError(`${succeeded} excluídos, ${failed} falharam.`);
    } catch {
      showError('Erro ao excluir contatos.');
    } finally {
      setBulkDeleting(false);
    }
  };

  // Barra de ação em massa
  const BulkActionBar = () => {
    if (selectedIds.size === 0) return null;
    return (
      <div className="mx-8 mb-4 flex items-center justify-between gap-3 px-5 py-3 rounded-xl bg-primary/8 border border-primary/20 animate-in slide-in-from-top-2 duration-200">
        <div className="flex items-center gap-3">
          <CheckSquare size={16} className="text-primary shrink-0" />
          <span className="text-[13px] font-semibold text-foreground">
            {selectedIds.size} contato{selectedIds.size !== 1 ? 's' : ''} selecionado{selectedIds.size !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Excluir selecionados — somente CONTADOR */}
          {isContador && (
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {bulkDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {bulkDeleting ? 'Excluindo...' : 'Excluir selecionados'}
            </button>
          )}

          <button
            onClick={() => setSelectedIds(new Set())}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Cancelar seleção"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  };

  // ─── Tela Principal (Contatos Ativos) ─────────────────────
  return (
    <div className="flex h-screen bg-background overflow-hidden text-foreground">
      <main className="flex-1 flex flex-col bg-background overflow-hidden relative">
        {/* Header */}
        <header className="px-8 py-6 shrink-0 flex items-center justify-between border-b border-border bg-card/30 backdrop-blur-md z-10">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Contatos</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {loading ? 'Carregando...' : `${totalContacts} contato${totalContacts !== 1 ? 's' : ''}${debouncedSearch ? ' encontrados' : ' ativos'}`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowNewContact(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm shadow-primary/20"
            >
              <UserPlus size={15} />
              Novo Contato
            </button>

            <div className="relative w-80 group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                placeholder="Buscar por nome ou telefone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl text-[13px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-muted-foreground/50"
              />
            </div>
          </div>
        </header>

        {/* Barra de ações em massa */}
        <div className="pt-4">
          <BulkActionBar />
        </div>

        {/* Table */}
        <div className={`flex-1 overflow-y-auto bg-foreground/[0.01] ${someSelected ? 'px-8 pb-8' : 'p-8'}`}>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 opacity-50">
              <Loader2 className="w-10 h-10 animate-spin mb-4" />
              <p className="text-sm font-medium">Carregando contatos...</p>
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <AlertCircle className="w-10 h-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Erro ao carregar contatos.</p>
              <button onClick={fetchAllContacts} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 transition-colors">
                <RefreshCw size={14} />
                Tentar novamente
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <table className="w-full text-left table-auto">
                <thead>
                  <tr className="bg-foreground/[0.02] border-b border-border">
                    {/* Checkbox "Selecionar todos" */}
                    <th className="pl-5 pr-2 py-4 w-10">
                      <button
                        onClick={toggleSelectAll}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title={allCurrentSelected ? 'Desmarcar todos' : 'Selecionar todos desta página'}
                      >
                        {allCurrentSelected
                          ? <CheckSquare size={16} className="text-primary" />
                          : indeterminate
                            ? <CheckSquare size={16} className="text-primary opacity-60" />
                            : <Square size={16} />
                        }
                      </button>
                    </th>
                    <th className="px-4 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Nome</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Telefone</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Email</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest max-w-[200px]">Ultima Msg</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Origem</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-foreground/[0.04]">
                  {activeContacts.map((contact) => {
                    const isSelected = selectedIds.has(contact.id);
                    return (
                      <tr
                        key={contact.id}
                        className={`transition-colors group ${isSelected ? 'bg-primary/[0.04]' : 'hover:bg-foreground/[0.02]'}`}
                      >
                        {/* Checkbox */}
                        <td className="pl-5 pr-2 py-5 w-10">
                          <button
                            onClick={() => toggleSelect(contact.id)}
                            className={`transition-colors ${isSelected ? 'text-primary' : 'text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100'}`}
                          >
                            {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                          </button>
                        </td>
                        <td className="px-4 py-5">
                          <div className="flex items-center gap-4">
                            <div
                              className={`w-9 h-9 rounded-full bg-primary/10 border border-border flex items-center justify-center overflow-hidden shrink-0 shadow-sm ${contact.profile_picture_url ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                              onClick={contact.profile_picture_url ? (e) => { e.stopPropagation(); setLightbox(contact.profile_picture_url!); } : undefined}
                            >
                              {contact.profile_picture_url ? (
                                <img src={contact.profile_picture_url} alt={contact.name} className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <span className="text-primary font-bold text-xs">{contact.name.charAt(0).toUpperCase()}</span>
                              )}
                            </div>
                            <div className="flex flex-col gap-1">
                              <span
                                className="text-[14px] font-semibold text-foreground tracking-tight cursor-pointer hover:text-primary transition-colors"
                                onClick={() => setSelectedLeadId(contact.id)}
                              >
                                {contact.name}
                              </span>
                              {contact.chatStatus && (() => {
                                const badge = CHAT_STATUS_BADGE[contact.chatStatus];
                                return (
                                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider w-fit ${badge.classes}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${badge.dot}`} />
                                    {badge.label}
                                  </span>
                                );
                              })()}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-[13px] text-muted-foreground font-medium">
                          {formatPhone(contact.phone)}
                        </td>
                        <td className="px-6 py-5 text-[13px] text-muted-foreground font-medium">{contact.email || '-'}</td>
                        <td className="px-6 py-5 max-w-[200px]">
                          <p className="text-[12px] text-muted-foreground truncate" title={contact.lastMessage !== '-' ? contact.lastMessage : undefined}>
                            {contact.lastMessage !== '-' ? contact.lastMessage : <span className="text-muted-foreground/40 italic">Sem mensagens</span>}
                          </p>
                          {contact.conversations > 0 && (
                            <span className="text-[10px] text-muted-foreground/50 mt-0.5">
                              {contact.conversations} conversa{contact.conversations !== 1 ? 's' : ''}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 text-green-600 text-[10px] font-bold uppercase tracking-wider border border-green-500/20">
                              <Phone className="w-3 h-3" />
                              WhatsApp
                            </span>
                            {contact.instanceName && (
                              <span className="text-[10px] text-muted-foreground font-mono ml-2">
                                via {contact.instanceName}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                if (contact.conversationId) {
                                  sessionStorage.setItem('crm_open_conv', contact.conversationId);
                                } else {
                                  sessionStorage.setItem('crm_open_lead', contact.id);
                                }
                                router.push('/atendimento');
                              }}
                              title="Abrir no chat"
                              className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <MessageSquare size={15} />
                            </button>
                            <button
                              onClick={() => setEditContact(contact)}
                              title="Editar contato"
                              className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Pencil size={15} />
                            </button>
                            {isContador && (
                              <button
                                onClick={() => handleDeleteContact(contact.id, contact.name)}
                                title="Excluir contato permanentemente"
                                className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {activeContacts.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-20 text-center">
                        <div className="flex flex-col items-center opacity-30">
                          <User className="w-12 h-12 mb-3 stroke-[1.2]" />
                          <p className="text-sm font-medium">Nenhum contato encontrado</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Paginação */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-foreground/[0.01]">
                  <span className="text-[12px] text-muted-foreground">
                    {totalContacts} contatos | Página {page} de {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-border bg-card hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Anterior
                    </button>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => p + 1)}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-border bg-card hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Próximo
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Painel do Cliente */}
      {selectedLeadId && (
        <ClientPanel
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
          onLightbox={setLightbox}
          isAdmin={isAdmin}
          onDeleteSuccess={handleContactDeleted}
        />
      )}

      {/* Modal: Novo Contato */}
      {showNewContact && (
        <NewContactModal
          onClose={() => setShowNewContact(false)}
          onCreated={handleNewContactCreated}
        />
      )}

      {/* Modal: Editar Contato */}
      {editContact && (
        <EditContactModal
          contact={editContact}
          onClose={() => setEditContact(null)}
          onUpdated={handleContactUpdated}
        />
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[999] bg-black/80 backdrop-blur-sm flex items-center justify-center cursor-pointer"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="Foto do contato"
            className="max-w-[80vw] max-h-[80vh] rounded-2xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

    </div>
  );
}
