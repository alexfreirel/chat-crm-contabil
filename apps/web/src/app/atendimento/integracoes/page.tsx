'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Link2, Key, Webhook, Download, Trash2, Plus,
  RefreshCw, Eye, EyeOff, Copy, Check, AlertTriangle,
  ToggleLeft, ToggleRight, Zap, FileDown,
} from 'lucide-react';
import api from '@/lib/api';
import { showSuccess, showError } from '@/lib/toast';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ApiKey {
  key: string;
  name: string;
  created_at: string;
}

interface WebhookConfig {
  id: string;
  url: string;
  name: string;
  events: string[];
  active: boolean;
  created_at: string;
  secret?: string;
}

// ── Eventos disponíveis para webhooks ─────────────────────────────────────────

const WEBHOOK_EVENTS = [
  { value: 'cliente.criado',          label: 'Cliente criado' },
  { value: 'cliente.encerrado',       label: 'Cliente encerrado' },
  { value: 'obrigacao.concluida',     label: 'Obrigação concluída' },
  { value: 'obrigacao.vencida',       label: 'Obrigação vencida' },
  { value: 'parcela.paga',            label: 'Parcela paga' },
  { value: 'parcela.vencida',         label: 'Parcela vencida' },
  { value: 'documento.enviado',       label: 'Documento enviado' },
  { value: 'ping',                    label: 'Teste (ping)' },
];

// ── Sistemas de exportação ─────────────────────────────────────────────────────

const EXPORT_FORMATS = [
  { id: 'clientes-csv',     label: 'Clientes (CSV)',              endpoint: '/integracoes/export/clientes?format=csv',     icon: '👥', desc: 'Todos os clientes contábeis com dados cadastrais' },
  { id: 'clientes-dominio', label: 'Clientes (Domínio)',          endpoint: '/integracoes/export/clientes?format=dominio', icon: '📋', desc: 'Formato compatível com Domínio Sistemas' },
  { id: 'clientes-alterdata',label: 'Clientes (Alterdata)',       endpoint: '/integracoes/export/clientes?format=alterdata',icon: '📋', desc: 'Formato compatível com Alterdata' },
  { id: 'obrigacoes-csv',   label: 'Obrigações do Mês (CSV)',     endpoint: '/integracoes/export/obrigacoes?format=csv',   icon: '📅', desc: 'Obrigações fiscais do mês corrente' },
  { id: 'faturamento-csv',  label: 'Faturamento do Mês (CSV)',    endpoint: '/integracoes/export/faturamento?format=csv',  icon: '💰', desc: 'Honorários e parcelas do mês corrente' },
];

// ── Componente: seção de API Key ───────────────────────────────────────────────

function ApiKeySection() {
  const [apiKey, setApiKey]     = useState<ApiKey | null>(null);
  const [showKey, setShowKey]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied]     = useState(false);

  useEffect(() => {
    api.get('/integracoes/api-key')
      .then(r => setApiKey(r.data))
      .catch(() => showError('Erro ao carregar API key'))
      .finally(() => setLoading(false));
  }, []);

  async function rotate() {
    if (!confirm('Rotacionar a API key irá invalidar a chave atual. Confirmar?')) return;
    setRotating(true);
    try {
      const res = await api.post('/integracoes/api-key/rotate');
      setApiKey(res.data);
      showSuccess('API key rotacionada com sucesso');
    } catch {
      showError('Erro ao rotacionar API key');
    } finally {
      setRotating(false);
    }
  }

  function copyKey() {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey.key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showSuccess('API key copiada');
    });
  }

  if (loading) return <div className="h-20 bg-muted animate-pulse rounded-xl" />;

  const maskedKey = apiKey?.key.replace(/^(lx_live_[a-f0-9]{6}).*/, '$1••••••••••••••••••••••••••••••••••••');

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Key size={16} className="text-primary" />
        <h3 className="text-sm font-semibold text-foreground">API Key</h3>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        Use esta chave no header <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">Authorization: Bearer &lt;key&gt;</code> para acessar a API pública.
      </p>

      {apiKey && (
        <div className="flex items-center gap-2 mb-3">
          <code className="flex-1 text-xs font-mono bg-muted px-3 py-2 rounded-lg border border-border text-foreground truncate">
            {showKey ? apiKey.key : maskedKey}
          </code>
          <button onClick={() => setShowKey(v => !v)} className="p-2 rounded-lg hover:bg-muted border border-border">
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button onClick={copyKey} className="p-2 rounded-lg hover:bg-muted border border-border">
            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Criada em: {apiKey ? new Date(apiKey.created_at).toLocaleDateString('pt-BR') : '—'}
        </p>
        <button
          onClick={rotate}
          disabled={rotating}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-red-600 hover:border-red-300 transition-colors"
        >
          <RefreshCw size={12} className={rotating ? 'animate-spin' : ''} />
          Rotacionar
        </button>
      </div>

      <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border">
        <p className="text-xs font-semibold text-foreground mb-1">Endpoints disponíveis</p>
        <div className="space-y-1">
          {[
            { method: 'GET', path: '/integracoes/v1/clientes', desc: 'Lista clientes' },
            { method: 'GET', path: '/integracoes/v1/obrigacoes', desc: 'Obrigações do mês' },
          ].map(e => (
            <div key={e.path} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono text-emerald-600 font-bold w-8">{e.method}</span>
              <code className="font-mono">{e.path}</code>
              <span>— {e.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Componente: modal de novo webhook ─────────────────────────────────────────

function WebhookModal({ onClose, onCreated }: { onClose: () => void; onCreated: (w: WebhookConfig) => void }) {
  const [url, setUrl]       = useState('');
  const [name, setName]     = useState('');
  const [events, setEvents] = useState<string[]>(['obrigacao.concluida', 'parcela.paga']);
  const [loading, setLoading] = useState(false);

  function toggleEvent(e: string) {
    setEvents(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!url || !name || events.length === 0) return showError('Preencha todos os campos e selecione ao menos um evento');
    try { new URL(url); } catch { return showError('URL inválida'); }

    setLoading(true);
    try {
      const res = await api.post('/integracoes/webhooks', { url, name, events });
      showSuccess('Webhook criado! Guarde o secret — ele não será exibido novamente.');
      onCreated(res.data);
    } catch {
      showError('Erro ao criar webhook');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-xl">
        <div className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Novo Webhook</h3>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nome</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Omie Integration"
                className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">URL de destino</label>
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://app.omie.com.br/webhook/..."
                className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background font-mono" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Eventos</label>
              <div className="grid grid-cols-2 gap-1.5">
                {WEBHOOK_EVENTS.map(e => (
                  <label key={e.value} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer text-xs transition-colors ${
                    events.includes(e.value) ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
                  }`}>
                    <input type="checkbox" className="hidden" checked={events.includes(e.value)} onChange={() => toggleEvent(e.value)} />
                    {e.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted">
                Cancelar
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
                {loading ? 'Criando...' : 'Criar Webhook'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function IntegracoesPage() {
  const [webhooks, setWebhooks]   = useState<WebhookConfig[]>([]);
  const [loadingWH, setLoadingWH] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [tab, setTab]             = useState<'api' | 'webhooks' | 'export'>('api');

  const fetchWebhooks = useCallback(async () => {
    setLoadingWH(true);
    try {
      const res = await api.get('/integracoes/webhooks');
      setWebhooks(res.data ?? []);
    } catch {
      showError('Erro ao carregar webhooks');
    } finally {
      setLoadingWH(false);
    }
  }, []);

  useEffect(() => { fetchWebhooks(); }, [fetchWebhooks]);

  async function deleteWebhook(id: string) {
    if (!confirm('Deletar este webhook?')) return;
    try {
      await api.delete(`/integracoes/webhooks/${id}`);
      setWebhooks(prev => prev.filter(w => w.id !== id));
      showSuccess('Webhook removido');
    } catch {
      showError('Erro ao remover webhook');
    }
  }

  async function toggleWebhook(id: string, active: boolean) {
    try {
      await api.patch(`/integracoes/webhooks/${id}/toggle`, { active });
      setWebhooks(prev => prev.map(w => w.id === id ? { ...w, active } : w));
    } catch {
      showError('Erro ao atualizar webhook');
    }
  }

  async function testWebhook(id: string) {
    try {
      await api.post(`/integracoes/webhooks/${id}/test`);
      showSuccess('Evento de teste enviado!');
    } catch {
      showError('Erro ao enviar teste');
    }
  }

  async function downloadExport(endpoint: string, filename: string) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
      const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
      const res = await fetch(`${baseUrl}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Erro no download');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href  = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      showSuccess('Download iniciado');
    } catch {
      showError('Erro ao exportar');
    }
  }

  function handleWebhookCreated(w: WebhookConfig) {
    if (w.secret) setNewSecret(w.secret);
    setWebhooks(prev => [...prev, w]);
    setShowModal(false);
    fetchWebhooks();
  }

  const TABS = [
    { id: 'api',      label: 'API Key',        icon: <Key size={14} /> },
    { id: 'webhooks', label: 'Webhooks',        icon: <Webhook size={14} /> },
    { id: 'export',   label: 'Exportar Dados',  icon: <FileDown size={14} /> },
  ] as const;

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Link2 size={20} className="text-primary" />
          Integrações
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          API pública, webhooks e exportação para sistemas contábeis
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
              tab === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.icon} <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ─── API Key ─────────────────────────────────────────────────── */}
      {tab === 'api' && <ApiKeySection />}

      {/* ─── Webhooks ────────────────────────────────────────────────── */}
      {tab === 'webhooks' && (
        <>
          {/* Alerta de secret recém-criado */}
          {newSecret && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 rounded-xl p-4 flex gap-3">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  Guarde o secret do webhook — não será exibido novamente!
                </p>
                <code className="text-xs font-mono bg-amber-100 dark:bg-amber-900/40 px-2 py-1 rounded block mt-1 break-all">
                  {newSecret}
                </code>
                <button onClick={() => setNewSecret(null)} className="text-xs text-amber-600 mt-2 underline">
                  Ok, guardei
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Webhooks configurados</h3>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
            >
              <Plus size={14} /> Novo Webhook
            </button>
          </div>

          {loadingWH ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : webhooks.length === 0 ? (
            <div className="bg-card border border-border rounded-xl py-10 text-center text-muted-foreground text-sm">
              Nenhum webhook configurado.
              <br />
              <button onClick={() => setShowModal(true)} className="text-primary underline mt-1 text-xs">
                Criar primeiro webhook
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {webhooks.map(w => (
                <div key={w.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${w.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{w.name}</p>
                      <p className="text-xs font-mono text-muted-foreground truncate">{w.url}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {w.events.map(e => (
                          <span key={e} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-mono">{e}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => testWebhook(w.id)} title="Enviar ping de teste"
                        className="p-1.5 rounded-lg hover:bg-muted border border-border text-muted-foreground hover:text-foreground">
                        <Zap size={13} />
                      </button>
                      <button onClick={() => toggleWebhook(w.id, !w.active)} title={w.active ? 'Desativar' : 'Ativar'}
                        className="p-1.5 rounded-lg hover:bg-muted border border-border">
                        {w.active ? <ToggleRight size={16} className="text-emerald-500" /> : <ToggleLeft size={16} className="text-muted-foreground" />}
                      </button>
                      <button onClick={() => deleteWebhook(w.id)} title="Deletar"
                        className="p-1.5 rounded-lg hover:bg-muted border border-border text-red-500 hover:border-red-300">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2 ml-5">
                    Criado em {new Date(w.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="text-xs font-semibold text-foreground mb-2">Verificação de assinatura</h4>
            <p className="text-xs text-muted-foreground">
              Cada requisição inclui o header{' '}
              <code className="bg-muted px-1 py-0.5 rounded font-mono">X-Lexcon-Signature: sha256=&lt;hmac&gt;</code>{' '}
              calculado com HMAC-SHA256 usando o secret do webhook.
            </p>
          </div>
        </>
      )}

      {/* ─── Exportar Dados ──────────────────────────────────────────── */}
      {tab === 'export' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {EXPORT_FORMATS.map(fmt => (
              <div key={fmt.id} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{fmt.icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{fmt.label}</p>
                    <p className="text-xs text-muted-foreground">{fmt.desc}</p>
                  </div>
                </div>
                <button
                  onClick={() => downloadExport(fmt.endpoint, `${fmt.id}-${new Date().toISOString().slice(0,10)}.csv`)}
                  className="flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors w-full"
                >
                  <Download size={13} /> Baixar CSV
                </button>
              </div>
            ))}
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <Link2 size={13} /> Compatibilidade
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { name: 'Domínio Sistemas', status: 'CSV compatível' },
                { name: 'Alterdata', status: 'CSV compatível' },
                { name: 'Questor', status: 'CSV compatível' },
                { name: 'Omie', status: 'Via webhook' },
                { name: 'ContaAzul', status: 'Via webhook' },
                { name: 'Nibo', status: 'Via webhook' },
              ].map(s => (
                <div key={s.name} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-foreground">{s.name}</p>
                    <p className="text-[10px] text-muted-foreground">{s.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {showModal && (
        <WebhookModal
          onClose={() => setShowModal(false)}
          onCreated={handleWebhookCreated}
        />
      )}
    </div>
  );
}
