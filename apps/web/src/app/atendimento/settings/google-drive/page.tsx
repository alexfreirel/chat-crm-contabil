'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  HardDrive,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderOpen,
  Key,
  TestTube,
  Save,
  Info,
  Link2,
  Unlink,
  LogIn,
  Shield,
  User,
} from 'lucide-react';
import api from '@/lib/api';

interface DriveConfig {
  configured: boolean;
  hasServiceAccount: boolean;
  hasRootFolder: boolean;
  rootFolderId: string | null;
  hasOAuth: boolean;
  oauthConfigured: boolean;
  oauthConnected: boolean;
  oauthUserEmail: string | null;
}

export default function GoogleDriveSettingsPage() {
  const searchParams = useSearchParams();
  const [config, setConfig] = useState<DriveConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; folderName?: string; details?: string[] } | null>(null);

  // Service Account
  const [serviceAccountJson, setServiceAccountJson] = useState('');
  const [rootFolderId, setRootFolderId] = useState('');

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
      const res = await api.get('/google-drive/config');
      setConfig(res.data);
      if (res.data.rootFolderId) setRootFolderId(res.data.rootFolderId);
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
      // Limpar query params
      window.history.replaceState({}, '', window.location.pathname);
    } else if (oauthResult === 'error') {
      const message = searchParams.get('message') || 'Erro desconhecido';
      setOauthMessage({ ok: false, text: `Falha ao conectar: ${message}` });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [searchParams, fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      const payload: any = {};
      if (serviceAccountJson.trim()) payload.serviceAccountJson = serviceAccountJson.trim();
      if (rootFolderId.trim()) payload.rootFolderId = rootFolderId.trim();

      const res = await api.post('/google-drive/config', payload);
      setConfig(res.data);
      setServiceAccountJson('');
    } catch (err: any) {
      setTestResult({ ok: false, message: err.response?.data?.message || 'Erro ao salvar configuração' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post('/google-drive/test');
      setTestResult(res.data);
    } catch (err: any) {
      setTestResult({ ok: false, message: err.response?.data?.message || 'Erro ao testar conexão' });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveOAuth = async () => {
    setSavingOAuth(true);
    setOauthMessage(null);
    try {
      await api.post('/google-drive/oauth/config', {
        clientId: oauthClientId.trim(),
        clientSecret: oauthClientSecret.trim(),
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
      // Redirecionar para tela de consentimento do Google
      window.location.href = res.data.url;
    } catch (err: any) {
      setOauthMessage({ ok: false, text: err.response?.data?.message || 'Erro ao gerar URL de autorização. Configure Client ID e Secret primeiro.' });
      setConnectingOAuth(false);
    }
  };

  const handleDisconnectOAuth = async () => {
    if (!confirm('Tem certeza que deseja desconectar sua conta Google? A criação automática de documentos será desativada.')) return;
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

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-blue-500/10 rounded-xl">
          <HardDrive className="w-6 h-6 text-blue-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Google Drive & Docs</h1>
          <p className="text-sm text-muted-foreground">
            Integração para criar petições diretamente no Google Docs
          </p>
        </div>
      </div>

      {/* Status Geral */}
      <div className={`flex items-center gap-3 p-4 rounded-xl border ${
        config?.configured
          ? 'bg-emerald-500/5 border-emerald-500/20'
          : 'bg-amber-500/5 border-amber-500/20'
      }`}>
        {config?.configured ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
        ) : (
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
        )}
        <div>
          <p className={`text-sm font-medium ${config?.configured ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
            {config?.configured ? 'Google Drive configurado e ativo' : 'Google Drive não configurado'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {config?.oauthConnected
              ? `OAuth2: Conectado (${config.oauthUserEmail})`
              : config?.hasServiceAccount
                ? 'Service Account: OK (limitado — configure OAuth2 para criação de docs)'
                : 'Autenticação: Pendente'
            }
            {' · '}
            {config?.hasRootFolder ? 'Pasta raiz: OK' : 'Pasta raiz: Pendente'}
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* OAuth2 — Método principal (como o n8n faz)             */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="bg-card border-2 border-blue-500/30 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-500/10 rounded-lg">
            <LogIn className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Autenticação OAuth2</h3>
            <p className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">RECOMENDADO — mesmo método que o n8n usa</p>
          </div>
        </div>

        {/* Status OAuth */}
        {config?.oauthConnected && (
          <div className="flex items-center gap-3 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
            <User className="w-4 h-4 text-emerald-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                Conectado: {config.oauthUserEmail}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Documentos são criados na conta Google deste usuário
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

        {/* Instruções OAuth */}
        {!config?.oauthConnected && (
          <div className="bg-background rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-foreground">Passo a passo:</p>
            <ol className="text-[11px] text-muted-foreground space-y-1.5 ml-4 list-decimal">
              <li>
                No <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Google Cloud Console</a>,
                crie uma credencial <strong>OAuth 2.0 Client ID</strong> (tipo: Web Application)
              </li>
              <li>
                Em <strong>URIs de redirecionamento autorizados</strong>, adicione:<br />
                <code className="bg-foreground/5 px-1.5 py-0.5 rounded text-[10px] select-all">
                  {process.env.NEXT_PUBLIC_API_URL
                    ? `${process.env.NEXT_PUBLIC_API_URL}/google-drive/oauth/callback`
                    : 'https://andrelustosaadvogados.com.br/api/google-drive/oauth/callback'}
                </code>
              </li>
              <li>Copie o <strong>Client ID</strong> e <strong>Client Secret</strong> e cole abaixo</li>
              <li>Clique em <strong>Conectar com Google</strong> e autorize o acesso</li>
            </ol>
          </div>
        )}

        {/* Formulário OAuth */}
        {!config?.oauthConnected && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Client ID
                </label>
                <input
                  type="text"
                  value={oauthClientId}
                  onChange={(e) => setOauthClientId(e.target.value)}
                  placeholder={config?.oauthConfigured ? '(configurado — cole novo para substituir)' : 'Cole o Client ID aqui...'}
                  className="w-full text-xs font-mono bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-muted-foreground/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Client Secret
                </label>
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
              {/* Salvar credenciais */}
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

              {/* Botão Conectar */}
              {config?.oauthConfigured && (
                <button
                  onClick={handleConnectOAuth}
                  disabled={connectingOAuth}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-md shadow-blue-500/20 disabled:opacity-50"
                >
                  {connectingOAuth ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                      <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  )}
                  Conectar com Google
                </button>
              )}
            </div>
          </div>
        )}

        {/* Mensagem OAuth */}
        {oauthMessage && (
          <div className={`flex items-start gap-2 p-3 rounded-lg border ${
            oauthMessage.ok
              ? 'bg-emerald-500/5 border-emerald-500/20'
              : 'bg-red-500/5 border-red-500/20'
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

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Pasta Raiz + Service Account (configuração base)      */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-5">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Key className="w-4 h-4 text-primary" />
          Configuração Base
        </h3>

        {/* Root Folder ID */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <FolderOpen className="w-3.5 h-3.5" />
            ID da Pasta Raiz no Google Drive
          </label>
          <input
            type="text"
            value={rootFolderId}
            onChange={(e) => setRootFolderId(e.target.value)}
            placeholder="Ex: 1aBcDeFgHiJkLmNoPqRsTuVwXyZ"
            className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            O ID da pasta está na URL do Google Drive: drive.google.com/drive/folders/<strong>ID_AQUI</strong>
          </p>
        </div>

        {/* Service Account JSON (opcional — para pastas) */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            JSON da Service Account
            <span className="text-[10px] text-muted-foreground/70 font-normal">(opcional — usado para organização de pastas)</span>
          </label>
          <textarea
            value={serviceAccountJson}
            onChange={(e) => setServiceAccountJson(e.target.value)}
            placeholder={config?.hasServiceAccount
              ? '(Service Account configurada — cole novo JSON para substituir)'
              : 'Cole aqui o conteúdo do arquivo JSON da Service Account...'}
            rows={4}
            className="w-full text-xs font-mono bg-background border border-border rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
          />
        </div>

        {/* Botões */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving || (!serviceAccountJson.trim() && !rootFolderId.trim())}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Configuração
          </button>

          <button
            onClick={handleTest}
            disabled={testing || !config?.configured}
            className="flex items-center gap-2 px-4 py-2.5 bg-background border border-border text-sm font-medium rounded-lg hover:bg-foreground/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
            Testar Conexão
          </button>
        </div>

        {/* Resultado do teste */}
        {testResult && (
          <div className={`p-3 rounded-lg border space-y-2 ${
            testResult.ok
              ? 'bg-emerald-500/5 border-emerald-500/20'
              : 'bg-red-500/5 border-red-500/20'
          }`}>
            <div className="flex items-start gap-2.5">
              {testResult.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              )}
              <div>
                <p className={`text-sm font-medium ${testResult.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                  {testResult.message}
                </p>
                {testResult.folderName && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Pasta: {testResult.folderName}
                  </p>
                )}
              </div>
            </div>
            {testResult.details && testResult.details.length > 0 && (
              <div className="bg-background rounded-lg p-3 space-y-1 text-[11px] font-mono text-muted-foreground border border-border">
                {testResult.details.map((detail, i) => (
                  <p key={i} className={
                    detail.startsWith('✓') ? 'text-emerald-600 dark:text-emerald-400' :
                    detail.startsWith('✗') ? 'text-red-600 dark:text-red-400' :
                    detail.startsWith('⚠') ? 'text-amber-600 dark:text-amber-400' :
                    ''
                  }>
                    {detail}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Instruções */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-foreground">Como configurar</h3>
        </div>
        <ol className="text-xs text-muted-foreground space-y-2 ml-6 list-decimal">
          <li>
            No{' '}
            <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
              Google Cloud Console
            </a>,
            certifique-se que as APIs <strong>Google Drive API</strong> e <strong>Google Docs API</strong> estejam ativadas.
          </li>
          <li>
            Crie uma credencial <strong>OAuth 2.0</strong> (tipo Web Application) e copie Client ID + Secret.
          </li>
          <li>
            Na credencial OAuth, adicione a <strong>URI de redirecionamento</strong> conforme mostrado acima.
          </li>
          <li>
            Crie uma <strong>pasta no Google Drive</strong> para ser a raiz dos documentos e copie o ID da URL.
          </li>
          <li>
            Cole as informações acima e clique em <strong>Conectar com Google</strong>.
          </li>
          <li>
            <em className="text-foreground/70">(Opcional)</em> Configure uma Service Account para organização avançada de pastas
            e compartilhe a pasta raiz com o email da SA.
          </li>
        </ol>
      </div>

      {/* Funcionamento */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Como funciona</h3>
        <div className="text-xs text-muted-foreground space-y-2">
          <p>
            Ao criar uma petição, o sistema automaticamente cria um <strong>Google Doc</strong> dentro
            de uma estrutura organizada no Drive:
          </p>
          <div className="bg-background rounded-lg p-3 font-mono text-[11px] space-y-1">
            <p>Pasta Raiz</p>
            <p className="ml-4">Maria Fabiana (0435)</p>
            <p className="ml-8">Trabalhista - 0000091.2026.5.19.0000</p>
            <p className="ml-12">Peticao Inicial</p>
            <p className="ml-12">Contestacao</p>
          </div>
          <p>
            Os estagiários podem editar diretamente no Google Docs, e o advogado pode revisar
            e comentar no mesmo documento. O conteúdo é sincronizado de volta ao sistema.
          </p>
        </div>
      </div>
    </div>
  );
}
