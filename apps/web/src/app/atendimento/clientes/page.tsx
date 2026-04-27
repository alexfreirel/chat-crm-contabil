'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Building2 } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:44001/api';

const STAGES = [
  { value: '', label: 'Todos' },
  { value: 'ONBOARDING', label: 'Onboarding' },
  { value: 'ATIVO', label: 'Ativos' },
  { value: 'SUSPENSO', label: 'Suspensos' },
  { value: 'ENCERRADO', label: 'Encerrados' },
];

const STAGE_COLORS: Record<string, string> = {
  ONBOARDING: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  ATIVO: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  SUSPENSO: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  ENCERRADO: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

const PRIORITY_COLORS: Record<string, string> = {
  URGENTE: 'text-red-500',
  NORMAL: 'text-muted-foreground',
  BAIXA: 'text-muted-foreground/50',
};

const SERVICE_LABELS: Record<string, string> = {
  CLIENTE_EFETIVO: 'Cliente Efetivo',
  BPO_FISCAL: 'BPO Fiscal', BPO_CONTABIL: 'BPO Contábil', DP: 'Dep. Pessoal',
  ABERTURA: 'Abertura/Alteração', ENCERRAMENTO: 'Encerramento',
  IR_PF: 'IRPF', IR_PJ: 'IRPJ', CONSULTORIA: 'Consultoria', OUTRO: 'Outro',
};

const SERVICE_ICONS: Record<string, string> = {
  CLIENTE_EFETIVO: '⭐',
  BPO_FISCAL: '🧾', BPO_CONTABIL: '📊', DP: '👥', ABERTURA: '🏢',
  ENCERRAMENTO: '🔒', IR_PF: '📋', IR_PJ: '📋', CONSULTORIA: '💡', OUTRO: '📁',
};

const SERVICE_TYPES = [
  'CLIENTE_EFETIVO',
  'BPO_FISCAL', 'BPO_CONTABIL', 'DP', 'ABERTURA',
  'ENCERRAMENTO', 'IR_PF', 'IR_PJ', 'CONSULTORIA', 'OUTRO',
];

const REGIMES = [
  { value: '', label: 'Sem regime' },
  { value: 'SIMPLES_NACIONAL', label: 'Simples Nacional' },
  { value: 'LUCRO_PRESUMIDO', label: 'Lucro Presumido' },
  { value: 'LUCRO_REAL', label: 'Lucro Real' },
  { value: 'MEI', label: 'MEI' },
  { value: 'ISENTO', label: 'Isento' },
];

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

/* ─── Modal criar cliente ─── */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

function CreateClienteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [leadSearch, setLeadSearch] = useState('');
  const [leads, setLeads] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [serviceType, setServiceType] = useState('CLIENTE_EFETIVO');
  const [regime, setRegime] = useState('');
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Novo contato inline
  const [showNewContact, setShowNewContact] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const noResults = leadSearch.length >= 2 && leads.length === 0 && !selectedLead;

  useEffect(() => {
    clearTimeout(debounceRef.current);
    setShowNewContact(false);
    if (leadSearch.length < 2) { setLeads([]); return; }
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`${API}/leads?search=${encodeURIComponent(leadSearch)}&limit=10`, {
        headers: authHeaders(),
      });
      const d = await res.json();
      setLeads(Array.isArray(d) ? d : (d.data || []));
    }, 300);
  }, [leadSearch]);

  async function handleCreate() {
    if (!selectedLead && !showNewContact) return;
    setSaving(true);
    setCreateError('');
    try {
      let leadId = selectedLead?.id;

      // Criar novo lead se não existe
      if (!leadId) {
        if (!newPhone) { setCreateError('Informe o telefone do contato'); setSaving(false); return; }
        const normalizedPhone = normalizePhone(newPhone);
        const r = await fetch(`${API}/leads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ name: newName || leadSearch || 'Sem nome', phone: normalizedPhone }),
        });
        if (!r.ok) {
          const errData = await r.json().catch(() => ({}));
          // Telefone já existe → buscar o lead e usar ele
          if (r.status === 409 || (errData?.message && String(errData.message).toLowerCase().includes('unique'))) {
            const searchRes = await fetch(`${API}/leads?search=${encodeURIComponent(normalizedPhone)}&limit=1`, { headers: authHeaders() });
            const searchData = await searchRes.json();
            const found = Array.isArray(searchData) ? searchData[0] : searchData?.data?.[0];
            if (found?.id) { leadId = found.id; }
            else { setCreateError('Contato com este telefone já existe. Busque-o pelo nome ou telefone.'); setSaving(false); return; }
          } else {
            setCreateError(errData?.message || 'Erro ao criar contato');
            setSaving(false);
            return;
          }
        } else {
          const newLead = await r.json();
          leadId = newLead.id;
        }
      }

      const res = await fetch(`${API}/clientes-contabil/from-lead/${leadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          service_type: serviceType,
          regime_tributario: regime || undefined,
          nome_empresa: nomeEmpresa.trim() || undefined,
          cpf_cnpj: cnpj.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = Array.isArray(err?.message) ? err.message.join(', ') : (err?.message || 'Erro ao criar cliente');
        setCreateError(msg);
        return;
      }
      onCreated();
      onClose();
    } catch (e) {
      setCreateError('Erro de comunicação com o servidor');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-bold text-foreground">Novo cliente contábil</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Busca de lead */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Lead / Contato <span className="text-red-500">*</span>
            </label>
            {selectedLead ? (
              <div className="flex items-center gap-2 p-2.5 bg-primary/10 border border-primary/30 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{selectedLead.name || selectedLead.phone}</p>
                  <p className="text-xs text-muted-foreground">{selectedLead.phone}</p>
                </div>
                <button onClick={() => setSelectedLead(null)} className="text-xs text-muted-foreground hover:text-red-500 shrink-0">
                  trocar
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar por nome ou telefone..."
                  value={leadSearch}
                  onChange={e => setLeadSearch(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  autoFocus
                />
                {leads.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {leads.map(l => (
                      <button
                        key={l.id}
                        onClick={() => { setSelectedLead(l); setLeads([]); setLeadSearch(''); }}
                        className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0"
                      >
                        <p className="text-sm font-medium text-foreground">{l.name || '(sem nome)'}</p>
                        <p className="text-xs text-muted-foreground">{l.phone}</p>
                      </button>
                    ))}
                  </div>
                )}
                {noResults && !showNewContact && (
                  <div className="mt-2 p-3 rounded-lg border border-dashed border-border bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-2">Nenhum contato encontrado para "{leadSearch}"</p>
                    <button
                      onClick={() => { setShowNewContact(true); setNewName(leadSearch); }}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      + Criar novo contato com este nome
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Formulário inline: novo contato */}
          {showNewContact && (
            <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
              <p className="text-xs font-semibold text-primary">Novo contato</p>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Nome</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Nome completo"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Telefone / WhatsApp <span className="text-red-500">*</span></label>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="(00) 00000-0000"
                  autoFocus
                />
              </div>
              <button
                onClick={() => { setShowNewContact(false); setNewName(''); setNewPhone(''); }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ← Buscar lead existente
              </button>
            </div>
          )}

          {/* Nome da empresa e CNPJ — obrigatório quando já existe registro para este contato */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Nome da empresa</label>
              <input
                type="text"
                value={nomeEmpresa}
                onChange={e => setNomeEmpresa(e.target.value)}
                placeholder="Razão social ou fantasia"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">CNPJ / CPF</label>
              <input
                type="text"
                value={cnpj}
                onChange={e => setCnpj(e.target.value)}
                placeholder="00.000.000/0001-00"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Preencha o CNPJ (ou nome) para diferenciar empresas do mesmo contato.
          </p>

          {/* Tipo de serviço */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Tipo de serviço <span className="text-red-500">*</span>
            </label>
            <select
              value={serviceType}
              onChange={e => setServiceType(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <optgroup label="Pacote completo">
                <option value="CLIENTE_EFETIVO">⭐ Cliente Efetivo — BPO Fiscal + Contábil + DP + IRPJ</option>
              </optgroup>
              <optgroup label="Serviços individuais">
                {SERVICE_TYPES.filter(s => !['CLIENTE_EFETIVO','BPO_FISCAL','BPO_CONTABIL','DP','IR_PJ'].includes(s)).map(s => (
                  <option key={s} value={s}>{SERVICE_ICONS[s]} {SERVICE_LABELS[s]}</option>
                ))}
              </optgroup>
            </select>
            {serviceType === 'CLIENTE_EFETIVO' && (
              <p className="text-xs text-primary mt-1">
                ✅ Inclui: BPO Fiscal · BPO Contábil · Departamento Pessoal · IRPJ
              </p>
            )}
          </div>

          {/* Regime tributário */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Regime tributário</label>
            <select
              value={regime}
              onChange={e => setRegime(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {REGIMES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        </div>

        {createError && (
          <div className="mx-5 mb-0 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
            ⚠️ {createError}
          </div>
        )}
        <div className="flex gap-2 px-5 py-4 border-t border-border bg-muted/20">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm text-foreground bg-background border border-border rounded-lg hover:bg-muted/50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={(!selectedLead && !showNewContact) || (showNewContact && !newPhone) || saving}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Criando...' : showNewContact ? 'Criar contato e cliente' : 'Criar cliente'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Página principal ─── */
export default function ClientesPage() {
  const router = useRouter();
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { fetchClientes(); }, [stage]);

  async function fetchClientes() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (stage) params.set('stage', stage);
      const res = await fetch(`${API}/clientes-contabil?${params}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      setClientes(Array.isArray(data) ? data : (data.data || []));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  const filtered = clientes.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      c.lead?.name?.toLowerCase().includes(s) ||
      c.lead?.phone?.includes(s) ||
      c.lead?.cpf_cnpj?.includes(s) ||
      c.cpf_cnpj?.includes(s)
    );
  });

  const counts: Record<string, number> = {
    ONBOARDING: clientes.filter(c => c.stage === 'ONBOARDING').length,
    ATIVO: clientes.filter(c => c.stage === 'ATIVO').length,
    SUSPENSO: clientes.filter(c => c.stage === 'SUSPENSO').length,
    ENCERRADO: clientes.filter(c => c.stage === 'ENCERRADO').length,
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h1 className="text-xl font-bold text-foreground">Clientes Contábeis</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? '...' : `${filtered.length} cliente${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
        >
          <span className="text-base leading-none">+</span>
          Novo cliente
        </button>
      </div>

      {/* Stage counters */}
      {!loading && (
        <div className="grid grid-cols-4 border-b border-border">
          {Object.entries(counts).map(([s, n]) => (
            <button
              key={s}
              onClick={() => setStage(stage === s ? '' : s)}
              className={`flex flex-col items-center py-3 border-r border-border last:border-r-0 transition-colors ${
                stage === s ? 'bg-primary/10' : 'hover:bg-muted/50'
              }`}
            >
              <span className="text-xl font-bold text-foreground">{n}</span>
              <span className="text-xs text-muted-foreground">{STAGES.find(x => x.value === s)?.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3 px-6 py-3 border-b border-border bg-muted/20">
        <input
          type="text"
          placeholder="Buscar por nome, telefone ou CPF/CNPJ..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <select
          value={stage}
          onChange={e => setStage(e.target.value)}
          className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse h-32" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="text-6xl mb-4">🏢</span>
            <p className="font-semibold text-lg text-foreground">Nenhum cliente encontrado</p>
            <p className="text-sm text-muted-foreground mt-1 mb-6">
              {search ? `Sem resultados para "${search}"` : 'Clientes aparecem aqui após conversão de leads'}
            </p>
            {!search && (
              <button
                onClick={() => setShowCreate(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
              >
                + Criar primeiro cliente
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(c => (
              <div
                key={c.id}
                onClick={() => router.push(`/atendimento/workspace/${c.id}`)}
                className="bg-card border border-border rounded-xl p-4 hover:border-primary/60 hover:shadow-md cursor-pointer transition-all group"
              >
                {/* Topo: ícone + nome + badge stage */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <span className="text-2xl shrink-0">{SERVICE_ICONS[c.service_type] || '📁'}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                        {c.lead?.name || 'Sem nome'}
                      </p>
                      <p className="text-xs text-muted-foreground">{c.lead?.phone}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STAGE_COLORS[c.stage] || 'bg-muted text-muted-foreground'}`}>
                    {c.stage}
                  </span>
                </div>

                {/* Badges de serviço + regime */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    {SERVICE_LABELS[c.service_type] || c.service_type}
                  </span>
                  {c.regime_tributario && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {c.regime_tributario.replace(/_/g, ' ')}
                    </span>
                  )}
                  {(c.cpf_cnpj || c.lead?.cpf_cnpj) && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
                      {c.cpf_cnpj || c.lead?.cpf_cnpj}
                    </span>
                  )}
                </div>

                {/* Rodapé: contador + contagens */}
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/60">
                  <span className="truncate flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 shrink-0" />
                    {c.nome_empresa || c.lead?.ficha_contabil?.razao_social || c.lead?.name || 'Sem razão social'}
                  </span>
                  <span className="shrink-0 ml-2">
                    📅 {c._count?.obrigacoes ?? 0}
                    {' · '}📄 {c._count?.documentos ?? 0}
                    {c._count?.tasks > 0 && ` · ✅ ${c._count.tasks}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal criar */}
      {showCreate && (
        <CreateClienteModal
          onClose={() => setShowCreate(false)}
          onCreated={fetchClientes}
        />
      )}
    </div>
  );
}
