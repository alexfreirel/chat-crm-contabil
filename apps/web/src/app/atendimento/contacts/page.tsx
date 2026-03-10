'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, User, Phone, Loader2, MessageSquare, FolderOpen, RotateCcw, ArrowLeft, UserPlus, AlertCircle, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { formatPhone } from '@/lib/utils';
import { showError, showSuccess } from '@/lib/toast';
import NewContactModal from './components/NewContactModal';
import { ClientPanel } from '@/components/ClientPanel';

interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string;
  conversations: number;
  conversationId?: string | null;
  lastMessage: string;
  origin: string;
  instanceName?: string;
  profile_picture_url?: string;
  stage: string;
}

function getIsAdminFromToken(): boolean {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return false;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload?.role === 'ADMIN';
  } catch {
    return false;
  }
}

export default function ContactsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  // 'active' = tela principal | 'archived' = tela de arquivados
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [archivedLeads, setArchivedLeads] = useState<Contact[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [showNewContact, setShowNewContact] = useState(false);
  const [isAdmin] = useState<boolean>(getIsAdminFromToken);
  // Paginacao
  const [page, setPage] = useState(1);
  const [totalContacts, setTotalContacts] = useState(0);
  const PAGE_SIZE = 50;

  // Debounce search — 300ms
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset para pagina 1 ao buscar
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search]);

  // Abre o painel do cliente via query param ?lead=<id> (sem useSearchParams para evitar Suspense)
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
      };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      const response = await api.get('/leads', { params });
      const result = response.data;

      // Backend retorna { data, total, page, limit } quando paginado
      const leads = Array.isArray(result) ? result : (result.data || []);
      const total = result.total ?? leads.length;
      setTotalContacts(total);

      const mappedContacts: Contact[] = leads.map((lead: any) => ({
        id: lead.id,
        name: lead.name || 'Sem Nome',
        phone: lead.phone,
        email: lead.email || '-',
        conversations: lead._count?.conversations || 0,
        conversationId: lead.conversations?.[0]?.id || null,
        lastMessage: lead.conversations?.[0]?.messages?.[0]?.text || '-',
        origin: lead.origin || 'crm',
        instanceName: lead.conversations?.[0]?.instance_name,
        profile_picture_url: lead.profile_picture_url,
        stage: lead.stage || 'INICIAL',
      }));

      mappedContacts.sort((a, b) => a.name.localeCompare(b.name));
      setContacts(mappedContacts);
    } catch {
      setLoadError(true);
      showError('Nao foi possivel carregar contatos.');
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

  const handleNewContactCreated = (convId: string) => {
    sessionStorage.setItem('crm_open_conv', convId);
    router.push('/atendimento');
  };

  const handleContactDeleted = (deletedId: string) => {
    setContacts(prev => prev.filter(c => c.id !== deletedId));
    setSelectedLeadId(null);
  };

  const handleUnarchive = async (contactId: string) => {
    setArchivedLeads(prev => prev.filter(c => c.id !== contactId));
    try {
      await api.patch(`/leads/${contactId}/stage`, { stage: 'INICIAL' });
      showSuccess('Contato movido de volta para o CRM.');
    } catch {
      fetchArchivedContacts();
      showError('Erro ao mover contato.');
    }
  };

  const fetchArchivedContacts = useCallback(async () => {
    try {
      setLoadingArchived(true);
      const response = await api.get('/leads', { params: { stage: 'PERDIDO', limit: '500' } });
      const result = response.data;
      const leads = Array.isArray(result) ? result : (result.data || []);
      const mapped: Contact[] = leads.map((lead: any) => ({
        id: lead.id,
        name: lead.name || 'Sem Nome',
        phone: lead.phone,
        email: lead.email || '-',
        conversations: lead._count?.conversations || 0,
        conversationId: lead.conversations?.[0]?.id || null,
        lastMessage: lead.conversations?.[0]?.messages?.[0]?.text || '-',
        origin: lead.origin || 'crm',
        instanceName: lead.conversations?.[0]?.instance_name,
        profile_picture_url: lead.profile_picture_url,
        stage: 'PERDIDO',
      }));
      mapped.sort((a, b) => a.name.localeCompare(b.name));
      setArchivedLeads(mapped);
    } catch {
      showError('Erro ao carregar contatos arquivados.');
    } finally {
      setLoadingArchived(false);
    }
  }, []);

  // Carrega arquivados ao abrir a aba
  useEffect(() => {
    if (view === 'archived') fetchArchivedContacts();
  }, [view, fetchArchivedContacts]);

  // Busca agora e server-side via debouncedSearch; filtragem local so por stage
  const activeContacts = contacts.filter(c => c.stage !== 'PERDIDO');
  const archivedCount  = archivedLeads.length;
  const filteredArchivedLeads = search.trim()
    ? archivedLeads.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search)
      )
    : archivedLeads;

  // ─── Tela de Arquivados ───────────────────────────────────────────────────
  if (view === 'archived') {
    return (
      <div className="flex h-screen bg-background overflow-hidden text-foreground">
        <main className="flex-1 flex flex-col bg-background overflow-hidden relative">
          {/* Header */}
          <header className="px-8 py-6 shrink-0 flex items-center justify-between border-b border-border bg-card/30 backdrop-blur-md z-10">
            <div className="flex items-center gap-4">
              <button
                onClick={() => { setView('active'); setSearch(''); }}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-[13px] font-medium"
              >
                <ArrowLeft size={16} />
                Contatos
              </button>
              <span className="text-muted-foreground/30 text-lg">|</span>
              <div>
                <div className="flex items-center gap-2">
                  <FolderOpen size={18} className="text-red-400" />
                  <h1 className="text-2xl font-bold text-foreground tracking-tight">Arquivados</h1>
                  {archivedCount > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-500 text-[12px] font-bold border border-red-500/20">
                      {archivedCount}
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-muted-foreground mt-0.5">
                  Leads marcados como Perdido no CRM
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={fetchArchivedContacts}
                disabled={loadingArchived}
                title="Recarregar arquivados"
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-[13px] font-medium border border-border bg-card hover:bg-accent transition-all text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw size={14} className={loadingArchived ? 'animate-spin' : ''} />
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

          {/* Table */}
          <div className="flex-1 overflow-y-auto p-8 bg-foreground/[0.01]">
            {loadingArchived ? (
              <div className="flex flex-col items-center justify-center py-20 opacity-50">
                <Loader2 className="w-10 h-10 animate-spin mb-4" />
                <p className="text-sm font-medium">Carregando arquivados...</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-red-500/20 bg-card shadow-sm overflow-hidden">
                <table className="w-full text-left table-auto">
                  <thead>
                    <tr className="bg-red-500/[0.04] border-b border-red-500/20">
                      <th className="px-6 py-4 text-[10px] font-bold text-red-400 uppercase tracking-widest">Nome</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-red-400 uppercase tracking-widest">Telefone</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-red-400 uppercase tracking-widest">Email</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-red-400 uppercase tracking-widest">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-500/[0.06]">
                    {filteredArchivedLeads.map((contact) => (
                      <tr key={contact.id} className="hover:bg-red-500/[0.03] transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div
                              className={`w-9 h-9 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center overflow-hidden shrink-0 shadow-sm grayscale ${contact.profile_picture_url ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                              onClick={contact.profile_picture_url ? (e) => { e.stopPropagation(); setLightbox(contact.profile_picture_url!); } : undefined}
                            >
                              {contact.profile_picture_url ? (
                                <img src={contact.profile_picture_url} alt={contact.name} className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <span className="text-red-400 font-bold text-xs">{contact.name.charAt(0).toUpperCase()}</span>
                              )}
                            </div>
                            <span
                              className="text-[14px] font-semibold text-muted-foreground tracking-tight cursor-pointer hover:text-foreground transition-colors"
                              onClick={() => setSelectedLeadId(contact.id)}
                            >
                              {contact.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-[13px] text-muted-foreground/70 font-medium">
                          {formatPhone(contact.phone)}
                        </td>
                        <td className="px-6 py-4 text-[13px] text-muted-foreground/70 font-medium">{contact.email || '-'}</td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleUnarchive(contact.id)}
                            title="Desarquivar lead (mover para Inicial)"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-foreground/[0.05] text-muted-foreground hover:bg-primary/10 hover:text-primary text-[11px] font-semibold border border-transparent hover:border-primary/20 transition-all"
                          >
                            <RotateCcw size={12} />
                            Desarquivar
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredArchivedLeads.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-20 text-center">
                          <div className="flex flex-col items-center opacity-30">
                            <FolderOpen className="w-12 h-12 mb-3 stroke-[1.2]" />
                            <p className="text-sm font-medium">
                              {search ? 'Nenhum arquivado encontrado para esta busca' : 'Nenhum lead arquivado'}
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>

        {selectedLeadId && (
          <ClientPanel
            leadId={selectedLeadId}
            onClose={() => setSelectedLeadId(null)}
            onLightbox={setLightbox}
            isAdmin={isAdmin}
            onDeleteSuccess={handleContactDeleted}
          />
        )}
        {lightbox && (
          <div className="fixed inset-0 z-[999] bg-black/80 backdrop-blur-sm flex items-center justify-center cursor-pointer" onClick={() => setLightbox(null)}>
            <img src={lightbox} alt="Foto do contato" className="max-w-[80vw] max-h-[80vh] rounded-2xl shadow-2xl object-contain" onClick={e => e.stopPropagation()} />
          </div>
        )}
      </div>
    );
  }

  // ─── Tela Principal (Contatos Ativos) ────────────────────────────────────
  return (
    <div className="flex h-screen bg-background overflow-hidden text-foreground">
      <main className="flex-1 flex flex-col bg-background overflow-hidden relative">
        {/* Header Section */}
        <header className="px-8 py-6 shrink-0 flex items-center justify-between border-b border-border bg-card/30 backdrop-blur-md z-10">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Contatos</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {loading ? 'Carregando...' : `${totalContacts} contatos${debouncedSearch ? ' encontrados' : ' ativos'}`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Botão Novo Contato */}
            <button
              onClick={() => setShowNewContact(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm shadow-primary/20"
            >
              <UserPlus size={15} />
              Novo Contato
            </button>

            {/* Botão Arquivados */}
            <button
              onClick={() => { setView('archived'); setSearch(''); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold border border-border bg-card hover:bg-accent transition-all text-muted-foreground hover:text-foreground"
            >
              <FolderOpen size={15} className="text-red-400" />
              Arquivados
              {archivedCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-500 text-[10px] font-bold">
                  {archivedCount}
                </span>
              )}
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

        {/* Table Section */}
        <div className="flex-1 overflow-y-auto p-8 bg-foreground/[0.01]">
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
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Nome</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Telefone</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Email</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest max-w-[200px]">Ultima Msg</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Origem</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-foreground/[0.04]">
                  {activeContacts.map((contact) => (
                    <tr key={contact.id} className="hover:bg-foreground/[0.02] transition-colors group">
                      <td className="px-6 py-5">
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
                          <span
                            className="text-[14px] font-semibold text-foreground tracking-tight cursor-pointer hover:text-primary transition-colors"
                            onClick={() => setSelectedLeadId(contact.id)}
                          >
                            {contact.name}
                          </span>
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
                      </td>
                    </tr>
                  ))}

                  {activeContacts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-20 text-center">
                        <div className="flex flex-col items-center opacity-30">
                          <User className="w-12 h-12 mb-3 stroke-[1.2]" />
                          <p className="text-sm font-medium">Nenhum contato encontrado</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Paginacao */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-foreground/[0.01]">
                  <span className="text-[12px] text-muted-foreground">
                    {totalContacts} contatos | Pagina {page} de {totalPages}
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
                      Proximo
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
