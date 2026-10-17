'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  HardDrive,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderOpen,
  Save,
  Info,
  Unlink,
  LogIn,
  User,
  ExternalLink,
} from 'lucide-react';
import api from '@/lib/api';

interface DriveConfig {
  oauthConfigured: boolean;
  oauthConnected: boolean;
  oauthUserEmail: string | null;
  hasServiceAccount: boolean;
}

interface CertidoesConfig {
  driveReady: boolean;
  configured: boolean;
  folderId: string | null;
  folderName: string | null;
  folderUrl: string | null;
}

interface PastaConfig {
  driveReady: boolean;
  configured: boolean;
  folderId: string | null;
  folderName: string | null;
  folderUrl: string | null;
}

/** Cartão de configuração de uma pasta do Drive (link ou ID) — usado para certidões e contratos. */
function PastaCard({
  titulo, descricao, endpoint, config, onChange, enabled,
}: {
  titulo: string;
  descricao: string;
  endpoint: string;
  config: PastaConfig | null;
  onChange: (c: PastaConfig) => void;
  enabled: boolean;
}) {
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const salvar = async () => {
    if (!input.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await api.post(endpoint, { folder: input.trim() });
      onChange(res.data);
      setInput('');
      setMsg({ ok: true, text: `Pasta configurada: ${res.data.folderName || 'OK'}` });
    } catch (err: any) {
      setMsg({ ok: false, text: err.response?.data?.message || 'Erro ao salvar a pasta' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <FolderOpen className="w-4 h-4 text-primary" />
        {titulo}
      </h3>
      <p className="text-xs text-muted-foreground -mt-2">{descricao}</p>

      {config?.configured && (
        <div className="flex items-center gap-3 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
          <FolderOpen className="w-4 h-4 text-emerald-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400 truncate">
              {config.folderName || 'Pasta configurada'}
            </p>
            <p className="text-[11px] text-muted-foreground">Os arquivos são salvos aqui, em uma subpasta por empresa</p>
          </div>
          {config.folderUrl && (
            <a
              href={config.folderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Abrir
            </a>
          )}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          {config?.configured ? 'Trocar a pasta (link ou ID)' : 'Link ou ID da pasta no Google Drive'}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && salvar()}
            disabled={!enabled}
            placeholder="https://drive.google.com/drive/folders/..."
            className="flex-1 text-sm bg-background border border-border rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50 disabled:opacity-50"
          />
          <button
            onClick={salvar}
            disabled={saving || !input.trim() || !enabled}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </div>
        {!enabled && (
          <p className="text-[11px] text-amber-600 mt-1">Conecte a conta Google primeiro (passo 1).</p>
        )}
      </div>

      {msg && (
        <div className={`flex items-start gap-2 p-3 rounded-lg border ${
          msg.ok ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
        }`}>
          {msg.ok ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          )}
          <p className={`text-xs ${msg.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
            {msg.text}
          </p>
        </div>
      )}
    </div>
  );
}

export default function GoogleDriveSettingsPage() {
  const searchParams = useSearchParams();
  const [config, setConfig] = useState<DriveConfig | null>(null);
  const [certidoes, setCertidoes] = useState<CertidoesConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // OAuth2
  const [oauthClientId, setOauthClientId] = useState('');
  const [oauthClientSecret, setOauthClientSecret] = useState('');
  const [savingOAuth, setSavingOAuth] = useState(false);
  const [connectingOAuth, setConnectingOAuth] = useState(false);
  const [disconnectingOAuth, setDisconnectingOAuth] = useState(false);
  const [oauthMessage, setOauthMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const [cfg, cert] = await Promise.all([
        api.get('/google-drive/config'),
        api.get('/google-drive/empresas/config'),
      ]);
      setConfig(cfg.data);
      setCertidoes(cert.data);
    } catch {
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  // Processar resultado do callback OAuth2
  useEffect(() => {
    const oauthResult = searchParams.get('oauth');
    if (oauthResult === 'success') {
      const email = searchParams.get('email') || '';
      setOauthMessage({ ok: true, text: `Google conectado com sucesso! Conta: ${email}` });
      fetchConfig();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (oauthResult === 'error') {
      const message = searchParams.get('message') || 'Erro desconhecido';
      setOauthMessage({ ok: false, text: `Falha ao conectar: ${message}` });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [searchParams, fetchConfig]);

  const handleSaveOAuth = async () => {
    setSavingOAuth(true);
    setOauthMessage(null);
    try {
      await api.post('/google-drive/oauth/config', {
        clientId: oauthClientId.trim(),
        clientSecret: oauthClientSecret.trim(),
        // Mesma URL exibida no passo 2 — evita redirect_uri_mismatch quando a API não tem NEXT_PUBLIC_API_URL
        redirectUri: `${process.env.NEXT_PUBLIC_API_URL || `${window.location.origin}/api`}/google-drive/oauth/callback`,
      });
      setOauthMessage({ ok: true, text: 'Credenciais OAuth2 salvas! Agora clique em "Conectar com Google".' });
      setOauthClientId('');
      setOauthClientSecret('');
      fetchConfig();
    } catch (err: any) {
      setOauthMessage({ ok: false, text: err.response?.data?.message || 'Erro ao salvar credenciais OAuth2' });
    } finally {
      setSavingOAuth(false);
    }
  };

  const handleConnectOAuth = async () => {
    setConnectingOAuth(true);
    setOauthMessage(null);
    try {
      const res = await api.get('/google-drive/oauth/url');
      window.location.href = res.data.url;
    } catch (err: any) {
      setOauthMessage({ ok: false, text: err.response?.data?.message || 'Erro ao gerar URL de autorização. Configure Client ID e Secret primeiro.' });
      setConnectingOAuth(false);
    }
  };

  const handleDisconnectOAuth = async () => {
    if (!confirm('Tem certeza que deseja desconectar a conta Google? Os anexos de certidões deixarão de ser salvos no Drive.')) return;
    setDisconnectingOAuth(true);
    setOauthMessage(null);
    try {
      await api.post('/google-drive/oauth/disconnect');
      setOauthMessage({ ok: true, text: 'Conta Google desconectada.' });
      fetchConfig();
    } catch (err: any) {
      setOauthMessage({ ok: false, text: err.response?.data?.message || 'Erro ao desconectar' });
    } finally {
      setDisconnectingOAuth(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const ready = !!(config?.oauthConnected && certidoes?.configured);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-blue-500/10 rounded-xl">
          <HardDrive className="w-6 h-6 text-blue-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Google Drive</h1>
          <p className="text-sm text-muted-foreground">
            Armazenamento dos documentos das empresas (certidões, alvará, contratos e impostos)
          </p>
        </div>
      </div>

      {/* Status Geral */}
      <div className={`flex items-center gap-3 p-4 rounded-xl border ${
        ready ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/20'
      }`}>
        {ready ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
        ) : (
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
        )}
        <div>
          <p className={`text-sm font-medium ${ready ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
            {ready ? 'Google Drive configurado e ativo' : 'Google Drive não configurado'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {config?.oauthConnected ? `Conta Google: Conectada (${config.oauthUserEmail})` : 'Conta Google: Pendente'}
            {' · '}
            {certidoes?.configured ? `Documentos Empresas: ${certidoes.folderName || 'OK'}` : 'Documentos Empresas: Pendente'}
          </p>
        </div>
      </div>

      {/* ═══════════════════ OAuth2 ═══════════════════ */}
      <div className="bg-card border-2 border-blue-500/30 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-500/10 rounded-lg">
            <LogIn className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">1. Conta Google</h3>
            <p className="text-[11px] text-muted-foreground">A conta dona do Drive onde as certidões serão guardadas</p>
          </div>
        </div>

        {config?.oauthConnected && (
          <div className="flex items-center gap-3 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
            <User className="w-4 h-4 text-emerald-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                Conectado: {config.oauthUserEmail}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Os arquivos são salvos no Drive desta conta
              </p>
            </div>
            <button
              onClick={handleDisconnectOAuth}
              disabled={disconnectingOAuth}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors"
            >
              {disconnectingOAuth ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
              Desconectar
            </button>
          </div>
        )}

        {!config?.oauthConnected && (
          <div className="bg-background rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-foreground">Passo a passo:</p>
            <ol className="text-[11px] text-muted-foreground space-y-1.5 ml-4 list-decimal">
              <li>
                No <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Google Cloud Console</a>,
                ative a <strong>Google Drive API</strong> e crie uma credencial <strong>OAuth 2.0 Client ID</strong> (tipo: Web Application)
              </li>
              <li>
                Em <strong>URIs de redirecionamento autorizados</strong>, adicione:<br />
                <code className="bg-foreground/5 px-1.5 py-0.5 rounded text-[10px] select-all">
                  {process.env.NEXT_PUBLIC_API_URL
                    ? `${process.env.NEXT_PUBLIC_API_URL}/google-drive/oauth/callback`
                    : 'https://lexconassessoriacontabil.com.br/api/google-drive/oauth/callback'}
                </code>
              </li>
              <li>Copie o <strong>Client ID</strong> e <strong>Client Secret</strong> e cole abaixo</li>
              <li>Clique em <strong>Conectar com Google</strong> e autorize o acesso</li>
            </ol>
          </div>
        )}

        {!config?.oauthConnected && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Client ID</label>
                <input
                  type="text"
                  value={oauthClientId}
                  onChange={(e) => setOauthClientId(e.target.value)}
                  placeholder={config?.oauthConfigured ? '(configurado — cole novo para substituir)' : 'Cole o Client ID aqui...'}
                  className="w-full text-xs font-mono bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-muted-foreground/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Client Secret</label>
                <input
                  type="password"
                  value={oauthClientSecret}
                  onChange={(e) => setOauthClientSecret(e.target.value)}
                  placeholder={config?.oauthConfigured ? '(configurado — cole novo para substituir)' : 'Cole o Client Secret aqui...'}
                  className="w-full text-xs font-mono bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-muted-foreground/50"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              {(oauthClientId.trim() || oauthClientSecret.trim()) && (
                <button
                  onClick={handleSaveOAuth}
                  disabled={savingOAuth || !oauthClientId.trim() || !oauthClientSecret.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  {savingOAuth ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Salvar Credenciais
                </button>
              )}

              {config?.oauthConfigured && (
                <button
                  onClick={handleConnectOAuth}
                  disabled={connectingOAuth}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-md shadow-blue-500/20 disabled:opacity-50"
                >
                  {connectingOAuth && <Loader2 className="w-4 h-4 animate-spin" />}
                  Conectar com Google
                </button>
              )}
            </div>
          </div>
        )}

        {oauthMessage && (
          <div className={`flex items-start gap-2 p-3 rounded-lg border ${
            oauthMessage.ok ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
          }`}>
            {oauthMessage.ok ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            )}
            <p className={`text-xs ${oauthMessage.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
              {oauthMessage.text}
            </p>
          </div>
        )}
      </div>

      {/* ═══════════════════ Pastas do Drive ═══════════════════ */}
      <PastaCard
        titulo="2. Pasta Documentos Empresas"
        descricao="Pasta única onde ficam todos os arquivos das empresas: certidões, alvará, contratos sociais e impostos. Cada empresa ganha uma subpasta própria."
        endpoint="/google-drive/empresas/config"
        config={certidoes}
        onChange={setCertidoes}
        enabled={!!config?.oauthConnected}
      />

      {/* Como funciona */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-foreground">Como funciona</h3>
        </div>
        <div className="text-xs text-muted-foreground space-y-2">
          <p>
            Em <strong>Certidões e Contratos</strong> e em <strong>Impostos</strong>, o botão <strong>Anexar</strong> de cada
            empresa envia o arquivo para a pasta Documentos Empresas, organizado assim:
          </p>
          <div className="bg-background rounded-lg p-3 font-mono text-[11px] space-y-1">
            <p>Documentos Empresas</p>
            <p className="ml-4">EMPRESA LTDA - 12.345.678/0001-90</p>
            <p className="ml-8">CND Federal - 12345678000190 - 2026-10-16.pdf</p>
            <p className="ml-8">ALVARA - 12345678000190 - 2026-10-16.pdf</p>
            <p className="ml-8">Contrato Social - 12345678000190 - 2026-10-16.pdf</p>
            <p className="ml-8">2026-10 (impostos do mês)</p>
          </div>
          <p>
            Para compartilhar com outras pessoas (cliente, sócio, equipe), use o compartilhamento do próprio Google Drive
            na pasta — ela e tudo o que está dentro herdam o acesso.
          </p>
        </div>
      </div>
    </div>
  );
}
