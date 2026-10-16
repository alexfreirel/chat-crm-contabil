'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, Search, Loader2, Save, KeyRound, CheckCircle2, AlertCircle, Eye, EyeOff, Info,
} from 'lucide-react';
import api from '@/lib/api';

interface Acesso {
  id: string;
  nome: string;
  cnpj: string | null;
  ativo: boolean;
  temSenha: boolean;
  login: string | null;
  ultimoAcesso: string | null;
}

function fmtCnpj(c: string) {
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export default function PortalClientesSettingsPage() {
  const [acessos, setAcessos] = useState<Acesso[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/portal/acessos');
      setAcessos(res.data);
    } catch (err: any) {
      setMsg({ ok: false, text: err.response?.data?.message || 'Erro ao carregar clientes' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    if (!q) return acessos;
    return acessos.filter(a =>
      a.nome.toLowerCase().includes(q) || (digits && a.cnpj?.includes(digits)),
    );
  }, [acessos, busca]);

  const salvar = async (a: Acesso, dados: { ativo?: boolean; senha?: string }, okText: string) => {
    setSavingId(a.id);
    setMsg(null);
    try {
      await api.patch(`/portal/acesso/${a.id}`, dados);
      setMsg({ ok: true, text: `${a.nome}: ${okText}` });
      setEditId(null);
      setSenha('');
      setShowSenha(false);
      await carregar();
    } catch (err: any) {
      setMsg({ ok: false, text: err.response?.data?.message || 'Erro ao salvar' });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-primary/10 rounded-xl">
          <Users className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Acesso dos Clientes</h1>
          <p className="text-sm text-muted-foreground">Portal do Cliente — login pelo CNPJ da empresa, senha definida por você</p>
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-xl border border-border bg-card text-xs text-muted-foreground">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p>
          O <strong>login</strong> é o CNPJ cadastrado no cliente (somente números). Defina a senha, ative o acesso e
          passe os dados ao cliente. Ele entra em <strong>/portal</strong> pelo botão &quot;Portal do Cliente&quot; do site.
          Clientes sem CNPJ válido (PF ou pendente) não têm acesso ao portal.
        </p>
      </div>

      {msg && (
        <div className={`flex items-start gap-2 p-3 rounded-lg border ${msg.ok ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
          {msg.ok
            ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
            : <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />}
          <p className={`text-xs ${msg.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>{msg.text}</p>
        </div>
      )}

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome ou CNPJ…"
          className="w-full text-sm bg-card border border-border rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : lista.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">Nenhum cliente encontrado.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {lista.map(a => {
              const editando = editId === a.id;
              const saving = savingId === a.id;
              return (
                <div key={a.id} className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.nome}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {a.cnpj ? fmtCnpj(a.cnpj) : 'Sem CNPJ válido'}
                        {a.ultimoAcesso && (
                          <span className="font-sans"> · último acesso {new Date(a.ultimoAcesso).toLocaleDateString('pt-BR')}</span>
                        )}
                      </p>
                    </div>

                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      a.ativo ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
                    }`}>
                      {a.ativo ? 'Ativo' : a.temSenha ? 'Desativado' : 'Sem acesso'}
                    </span>

                    {a.cnpj && (
                      <>
                        <button
                          onClick={() => { setEditId(editando ? null : a.id); setSenha(''); setShowSenha(false); setMsg(null); }}
                          className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          {a.temSenha ? 'Trocar senha' : 'Definir senha'}
                        </button>
                        {a.temSenha && (
                          <button
                            onClick={() => salvar(a, { ativo: !a.ativo }, a.ativo ? 'acesso desativado' : 'acesso ativado')}
                            disabled={saving}
                            className="text-[12px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
                          >
                            {a.ativo ? 'Desativar' : 'Ativar'}
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {editando && a.cnpj && (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showSenha ? 'text' : 'password'}
                          value={senha}
                          onChange={e => setSenha(e.target.value)}
                          autoComplete="new-password"
                          placeholder="Nova senha (mínimo 6 caracteres)"
                          className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 pr-9 focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSenha(s => !s)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                          aria-label={showSenha ? 'Ocultar senha' : 'Mostrar senha'}
                        >
                          {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <button
                        onClick={() => salvar(a, { senha, ativo: true }, 'senha salva e acesso ativado')}
                        disabled={saving || senha.length < 6}
                        className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Salvar e ativar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
