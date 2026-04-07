'use client';

import { useState, useEffect } from 'react';
import {
  HardDrive,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  FolderOpen,
  Key,
  TestTube,
  Save,
  ExternalLink,
  Info,
} from 'lucide-react';
import api from '@/lib/api';

interface DriveConfig {
  configured: boolean;
  hasServiceAccount: boolean;
  hasRootFolder: boolean;
  rootFolderId: string | null;
}

export default function GoogleDriveSettingsPage() {
  const [config, setConfig] = useState<DriveConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; folderName?: string; details?: string[] } | null>(null);

  const [serviceAccountJson, setServiceAccountJson] = useState('');
  const [rootFolderId, setRootFolderId] = useState('');

  const fetchConfig = async () => {
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
  };

  useEffect(() => { fetchConfig(); }, []);

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

      {/* Status */}
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
            {config?.hasServiceAccount ? 'Service Account: OK' : 'Service Account: Pendente'}
            {' · '}
            {config?.hasRootFolder ? 'Pasta raiz: OK' : 'Pasta raiz: Pendente'}
          </p>
        </div>
      </div>

      {/* Instruções */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-foreground">Como configurar</h3>
        </div>
        <ol className="text-xs text-muted-foreground space-y-2 ml-6 list-decimal">
          <li>
            Acesse o{' '}
            <span className="text-foreground font-medium">Google Cloud Console</span>,
            crie um projeto e ative as APIs <strong>Google Drive API</strong> e <strong>Google Docs API</strong>.
          </li>
          <li>
            Crie uma <strong>Service Account</strong> e baixe o arquivo JSON de credenciais.
          </li>
          <li>
            Crie uma <strong>pasta no Google Drive</strong> para ser a raiz dos documentos do escritório.
          </li>
          <li>
            Compartilhe essa pasta com o email da Service Account (com permissão <strong>Editor</strong>).
          </li>
          <li>
            Cole o JSON da Service Account abaixo e informe o ID da pasta raiz.
          </li>
        </ol>
      </div>

      {/* Formulário */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-5">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Key className="w-4 h-4 text-primary" />
          Credenciais
        </h3>

        {/* Service Account JSON */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            JSON da Service Account
          </label>
          <textarea
            value={serviceAccountJson}
            onChange={(e) => setServiceAccountJson(e.target.value)}
            placeholder={config?.hasServiceAccount
              ? '(Service Account já configurada — cole novo JSON para substituir)'
              : 'Cole aqui o conteúdo do arquivo JSON da Service Account...'}
            rows={6}
            className="w-full text-xs font-mono bg-background border border-border rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
          />
        </div>

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
            {/* Log detalhado dos passos do teste */}
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

      {/* Funcionamento */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Como funciona</h3>
        <div className="text-xs text-muted-foreground space-y-2">
          <p>
            Ao criar uma petição, o sistema automaticamente cria um <strong>Google Doc</strong> dentro
            de uma estrutura organizada no Drive:
          </p>
          <div className="bg-background rounded-lg p-3 font-mono text-[11px] space-y-1">
            <p>📁 Pasta Raiz</p>
            <p className="ml-4">📁 Maria Fabiana (0435)</p>
            <p className="ml-8">📁 Trabalhista - 0000091.2026.5.19.0000</p>
            <p className="ml-12">📄 Petição Inicial</p>
            <p className="ml-12">📄 Contestação</p>
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
