'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Shield, Check, X, ChevronDown, Loader2, Users } from 'lucide-react';
import api from '@/lib/api';

// ─── Roles visíveis (ADMIN removido — CONTADOR é o superadmin) ───────────────
const ROLES = ['CONTADOR', 'OPERADOR', 'ASSISTENTE', 'FINANCEIRO'] as const;
type Role = typeof ROLES[number];

const ROLE_LABELS: Record<Role, string> = {
  CONTADOR:   'Contador',
  OPERADOR:   'Atendente',
  ASSISTENTE: 'Assistente',
  FINANCEIRO: 'Financeiro',
};

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  CONTADOR:   'Controle total do sistema',
  OPERADOR:   'Atendimento e comercial',
  ASSISTENTE: 'Suporte e tarefas',
  FINANCEIRO: 'Cobranças e financeiro',
};

const ROLE_COLORS: Record<Role, string> = {
  CONTADOR:   'bg-violet-500/10 text-violet-400 border-violet-500/20',
  OPERADOR:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
  ASSISTENTE: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  FINANCEIRO: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

type Permission = 'full' | 'partial' | 'none';

interface MatrixSection {
  section: string;
  rows: { label: string; description: string; permissions: Record<Role, Permission> }[];
}

const MATRIX_SECTIONS: MatrixSection[] = [
  {
    section: 'Visão Geral',
    rows: [
      {
        label: 'Dashboard',
        description: 'Painel com métricas e KPIs do escritório',
        permissions: { CONTADOR: 'full', OPERADOR: 'partial', ASSISTENTE: 'partial', FINANCEIRO: 'partial' },
      },
      {
        label: 'Analytics',
        description: 'Relatórios avançados e gráficos de performance',
        permissions: { CONTADOR: 'full', OPERADOR: 'none', ASSISTENTE: 'none', FINANCEIRO: 'partial' },
      },
    ],
  },
  {
    section: 'Atendimento',
    rows: [
      {
        label: 'Inbox — WhatsApp',
        description: 'Conversas com leads e clientes via WhatsApp',
        permissions: { CONTADOR: 'full', OPERADOR: 'full', ASSISTENTE: 'partial', FINANCEIRO: 'none' },
      },
      {
        label: 'Leads & CRM',
        description: 'Funil comercial e gestão de leads',
        permissions: { CONTADOR: 'full', OPERADOR: 'full', ASSISTENTE: 'partial', FINANCEIRO: 'none' },
      },
      {
        label: 'Contatos',
        description: 'Lista completa de contatos e clientes',
        permissions: { CONTADOR: 'full', OPERADOR: 'full', ASSISTENTE: 'partial', FINANCEIRO: 'none' },
      },
      {
        label: 'Follow-up IA',
        description: 'Sequências automáticas de mensagens e nutrição',
        permissions: { CONTADOR: 'full', OPERADOR: 'full', ASSISTENTE: 'none', FINANCEIRO: 'none' },
      },
    ],
  },
  {
    section: 'Contabilidade',
    rows: [
      {
        label: 'Clientes Contábeis',
        description: 'Workspace completo dos clientes do escritório',
        permissions: { CONTADOR: 'full', OPERADOR: 'partial', ASSISTENTE: 'partial', FINANCEIRO: 'none' },
      },
      {
        label: 'Obrigações Fiscais',
        description: 'Vencimentos, SPED, DIRF, PGDAS e obrigações acessórias',
        permissions: { CONTADOR: 'full', OPERADOR: 'none', ASSISTENTE: 'full', FINANCEIRO: 'none' },
      },
      {
        label: 'Documentos Contábeis',
        description: 'Upload e gestão de documentos dos clientes',
        permissions: { CONTADOR: 'full', OPERADOR: 'none', ASSISTENTE: 'full', FINANCEIRO: 'none' },
      },
      {
        label: 'Agente Fiscal SEFAZ',
        description: 'Consultas automáticas na SEFAZ e alertas fiscais',
        permissions: { CONTADOR: 'full', OPERADOR: 'none', ASSISTENTE: 'partial', FINANCEIRO: 'none' },
      },
    ],
  },
  {
    section: 'Financeiro',
    rows: [
      {
        label: 'Honorários & Contratos',
        description: 'Planos de cobrança e parcelas dos clientes',
        permissions: { CONTADOR: 'full', OPERADOR: 'none', ASSISTENTE: 'none', FINANCEIRO: 'full' },
      },
      {
        label: 'Financeiro',
        description: 'Fluxo de caixa, cobranças e relatórios financeiros',
        permissions: { CONTADOR: 'full', OPERADOR: 'none', ASSISTENTE: 'none', FINANCEIRO: 'full' },
      },
      {
        label: 'Notas Fiscais',
        description: 'Emissão e gestão de NFS-e do escritório',
        permissions: { CONTADOR: 'full', OPERADOR: 'none', ASSISTENTE: 'none', FINANCEIRO: 'full' },
      },
    ],
  },
  {
    section: 'Organização',
    rows: [
      {
        label: 'Agenda & Tarefas',
        description: 'Calendário, reuniões e tarefas da equipe',
        permissions: { CONTADOR: 'full', OPERADOR: 'partial', ASSISTENTE: 'full', FINANCEIRO: 'none' },
      },
      {
        label: 'Contatos — editar',
        description: 'Criar e editar dados de contatos',
        permissions: { CONTADOR: 'full', OPERADOR: 'full', ASSISTENTE: 'none', FINANCEIRO: 'none' },
      },
    ],
  },
  {
    section: 'Administração',
    rows: [
      {
        label: 'Configurações do Sistema',
        description: 'Ajustes gerais, inboxes e integrações',
        permissions: { CONTADOR: 'full', OPERADOR: 'none', ASSISTENTE: 'none', FINANCEIRO: 'none' },
      },
      {
        label: 'Usuários & Perfis',
        description: 'Criar, editar e remover usuários',
        permissions: { CONTADOR: 'full', OPERADOR: 'none', ASSISTENTE: 'none', FINANCEIRO: 'none' },
      },
      {
        label: 'Automações',
        description: 'Regras automáticas e bots do sistema',
        permissions: { CONTADOR: 'full', OPERADOR: 'none', ASSISTENTE: 'none', FINANCEIRO: 'none' },
      },
      {
        label: 'Permissões',
        description: 'Controle de acesso por perfil',
        permissions: { CONTADOR: 'full', OPERADOR: 'none', ASSISTENTE: 'none', FINANCEIRO: 'none' },
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function PermIcon({ p }: { p: Permission }) {
  if (p === 'full')    return <Check size={14} className="text-emerald-400 mx-auto" />;
  if (p === 'partial') return <span className="text-amber-400 text-[10px] font-bold leading-none">parcial</span>;
  return <X size={14} className="text-muted-foreground/30 mx-auto" />;
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function PermissionsSettingsPage() {
  const [users, setUsers]           = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadError, setLoadError]   = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos]   = useState<{ top: number; left: number } | null>(null);
  const [activeTab, setActiveTab]   = useState<'matrix' | 'users'>('matrix');

  const openDropdownAt = (userId: string, btnEl: HTMLElement) => {
    if (openDropdown === userId) { setOpenDropdown(null); setDropdownPos(null); return; }
    const rect = btnEl.getBoundingClientRect();
    const MENU_H = ROLES.length * 36 + 32;
    const top = rect.bottom + MENU_H > window.innerHeight ? rect.top - MENU_H : rect.bottom + 4;
    setDropdownPos({ top, left: rect.right - 192 });
    setOpenDropdown(userId);
  };

  useEffect(() => {
    api.get('/users')
      .then(r => { setUsers(Array.isArray(r.data) ? r.data : []); })
      .catch(() => setLoadError(true))
      .finally(() => setLoadingUsers(false));
  }, []);

  const getUserRoles = (u: any): string[] => {
    if (Array.isArray(u.roles) && u.roles.length > 0) return u.roles;
    if (u.role) return [u.role];
    return [];
  };

  const toggleRole = async (userId: string, role: Role) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    const current = getUserRoles(user);
    let next: string[];
    if (current.includes(role)) {
      next = current.filter(r => r !== role);
      if (next.length === 0) return;
    } else {
      next = [...current, role];
    }
    setUpdatingId(userId);
    try {
      await api.patch(`/users/${userId}`, { role: next[0], roles: next });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, roles: next, role: next[0] } : u));
    } catch {}
    setUpdatingId(null);
  };

  // Agrupa usuários por role (inclui ADMIN legado como CONTADOR)
  const normalizeRole = (r: string): Role | null => {
    if (r === 'ADMIN') return 'CONTADOR'; // ADMIN legado → exibe como CONTADOR
    return ROLES.includes(r as Role) ? (r as Role) : null;
  };

  const usersByRole = ROLES.map(role => ({
    role,
    users: users.filter(u => {
      const roles = getUserRoles(u);
      if (role === 'CONTADOR') return roles.some(r => r === 'CONTADOR' || r === 'ADMIN');
      return roles.includes(role);
    }),
  }));

  const orphanUsers = users.filter(u => {
    const roles = getUserRoles(u);
    return roles.length === 0 || !roles.some(r => ROLES.includes(r as Role) || r === 'ADMIN');
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      <header className="px-8 pt-8 pb-0 shrink-0">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Permissões</h1>
        <p className="text-[13px] text-muted-foreground mt-1">Controle de acesso por perfil de usuário.</p>

        <div className="flex gap-1 mt-5 border-b border-border">
          {(['matrix', 'users'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${
                activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              {tab === 'matrix' ? 'Matriz de Acesso' : 'Usuários por Perfil'}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6">

        {/* ─── Matriz de Acesso ──────────────────────────────── */}
        {activeTab === 'matrix' && (
          <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-5 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider w-72">
                      Funcionalidade
                    </th>
                    {ROLES.map(role => (
                      <th key={role} className="px-4 py-4 text-center w-32">
                        <div className={`inline-flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg border ${ROLE_COLORS[role]}`}>
                          <span className="text-[11px] font-bold">{ROLE_LABELS[role]}</span>
                          {role === 'CONTADOR' && (
                            <span className="text-[8px] font-medium opacity-70">superadmin</span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MATRIX_SECTIONS.map((section, si) => (
                    <>
                      {/* Cabeçalho de seção */}
                      <tr key={`sec-${si}`} className="bg-muted/20 border-b border-border/50">
                        <td colSpan={ROLES.length + 1} className="px-5 py-2">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            {section.section}
                          </span>
                        </td>
                      </tr>
                      {/* Linhas da seção */}
                      {section.rows.map((row, ri) => (
                        <tr key={row.label}
                          className={`border-b border-border/40 hover:bg-muted/20 transition-colors ${ri % 2 === 1 ? 'bg-muted/5' : ''}`}>
                          <td className="px-5 py-3.5">
                            <div className="font-semibold text-foreground text-[13px]">{row.label}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">{row.description}</div>
                          </td>
                          {ROLES.map(role => (
                            <td key={role} className="px-4 py-3.5 text-center">
                              <div className="flex items-center justify-center h-5">
                                <PermIcon p={row.permissions[role]} />
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legenda */}
            <div className="px-5 py-3.5 border-t border-border bg-muted/10 flex items-center gap-6 flex-wrap">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Legenda:</span>
              <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Check size={13} className="text-emerald-400" /> Acesso total
              </div>
              <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <span className="text-amber-400 text-[10px] font-bold">parcial</span> Acesso limitado
              </div>
              <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <X size={13} className="text-muted-foreground/40" /> Sem acesso
              </div>
              <div className="ml-auto text-[11px] text-violet-400/70 font-medium">
                🛡️ Contador tem acesso total a todas as funcionalidades
              </div>
            </div>
          </div>
        )}

        {/* ─── Usuários por Perfil ───────────────────────────── */}
        {activeTab === 'users' && (
          <div className="space-y-5">
            {loadingUsers ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
              </div>
            ) : loadError ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Shield size={32} className="text-destructive/50" />
                <p className="text-[13px] text-muted-foreground">Erro ao carregar usuários.</p>
                <button onClick={() => { setLoadError(false); setLoadingUsers(true); api.get('/users').then(r => setUsers(Array.isArray(r.data) ? r.data : [])).catch(() => setLoadError(true)).finally(() => setLoadingUsers(false)); }}
                  className="text-xs text-primary underline">Tentar novamente</button>
              </div>
            ) : (
              <>
                {usersByRole.map(({ role, users: roleUsers }) => (
                  <div key={role} className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-border flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${ROLE_COLORS[role]}`}>
                        {ROLE_LABELS[role]}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</span>
                      <span className="ml-auto text-[11px] text-muted-foreground/60">
                        {roleUsers.length} {roleUsers.length === 1 ? 'usuário' : 'usuários'}
                      </span>
                    </div>

                    {roleUsers.length === 0 ? (
                      <div className="px-5 py-4 text-[13px] text-muted-foreground flex items-center gap-2">
                        <Users size={14} /> Nenhum usuário neste perfil
                      </div>
                    ) : (
                      <div className="divide-y divide-border/50">
                        {roleUsers.map(user => (
                          <div key={user.id} className="px-5 py-3 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 text-[13px] font-bold text-muted-foreground">
                                {(user.name || user.email || '?')[0].toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[13px] font-semibold text-foreground truncate">{user.name || '(sem nome)'}</div>
                                <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>
                              </div>
                            </div>
                            <button
                              onClick={(e) => openDropdownAt(user.id, e.currentTarget)}
                              disabled={updatingId === user.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-accent text-[11px] font-semibold text-foreground transition-colors disabled:opacity-50 shrink-0"
                            >
                              {updatingId === user.id
                                ? <Loader2 size={12} className="animate-spin" />
                                : <Shield size={12} className="text-muted-foreground" />}
                              <span>{getUserRoles(user).map(r => ROLE_LABELS[normalizeRole(r) ?? 'CONTADOR'] ?? r).join(', ')}</span>
                              <ChevronDown size={12} className="text-muted-foreground" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {orphanUsers.length > 0 && (
                  <div className="bg-card rounded-2xl border border-destructive/30 shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-border flex items-center gap-3">
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-destructive/10 text-destructive border-destructive/20">Sem perfil</span>
                      <span className="text-[11px] text-muted-foreground">{orphanUsers.length} usuário(s) com perfil inválido</span>
                    </div>
                    <div className="divide-y divide-border/50">
                      {orphanUsers.map(user => (
                        <div key={user.id} className="px-5 py-3 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[13px] font-bold text-muted-foreground">{(user.name || '?')[0].toUpperCase()}</div>
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold text-foreground truncate">{user.name}</div>
                              <div className="text-[10px] text-destructive/70 font-mono">{JSON.stringify(user.roles || user.role)}</div>
                            </div>
                          </div>
                          <button onClick={(e) => openDropdownAt(user.id, e.currentTarget)} disabled={updatingId === user.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-destructive/40 bg-background hover:bg-accent text-[12px] font-semibold text-destructive transition-colors">
                            <Shield size={12} /> Atribuir perfil <ChevronDown size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ─── Dropdown portal ─────────────────────────────────── */}
      {openDropdown && dropdownPos && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => { setOpenDropdown(null); setDropdownPos(null); }} />
          <div style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: 192, zIndex: 9999 }}
            className="bg-card border border-border rounded-xl shadow-xl py-1 overflow-hidden">
            <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border">
              Perfil de acesso
            </div>
            {ROLES.map(r => {
              const u = users.find(u => u.id === openDropdown);
              const userRoles = u ? getUserRoles(u) : [];
              const isActive = userRoles.includes(r) || (r === 'CONTADOR' && userRoles.includes('ADMIN'));
              const isOnly = isActive && userRoles.length === 1;
              return (
                <button key={r} onClick={() => { toggleRole(openDropdown!, r); setOpenDropdown(null); setDropdownPos(null); }}
                  disabled={isOnly}
                  title={isOnly ? 'Ao menos 1 perfil é obrigatório' : ''}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-semibold transition-colors hover:bg-accent
                    ${isActive ? 'text-primary bg-primary/5' : 'text-foreground'}
                    ${isOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${isActive ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`}>
                    {isActive && <Check size={10} className="text-primary-foreground" />}
                  </div>
                  <div>
                    <div>{ROLE_LABELS[r]}</div>
                    <div className="text-[9px] text-muted-foreground font-normal">{ROLE_DESCRIPTIONS[r]}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
