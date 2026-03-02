'use client';

import { useState, useEffect } from 'react';
import { Bot, KeyRound, CheckCircle2, RefreshCw, Eye, EyeOff } from 'lucide-react';
import api from '@/lib/api';

interface Skill {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
}

export default function AiSettingsPage() {
  const [apiKey, setApiKey] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const [configRes, skillsRes] = await Promise.all([
          api.get('/settings/ai-config'),
          api.get('/settings/skills')
        ]);
        setIsConfigured(configRes.data.isConfigured);
        setSkills(skillsRes.data);
      } catch (e) {
        console.error('Erro ao carregar dados:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const toggleSkill = async (id: string, currentStatus: boolean) => {
    try {
      await api.patch(`/settings/skills/${id}/toggle`, { isActive: !currentStatus });
      setSkills((prev: Skill[]) => prev.map((s: Skill) => s.id === id ? { ...s, isActive: !currentStatus } : s));
    } catch (e) {
      console.error('Erro ao alternar skill:', e);
      alert('Erro ao alterar status da skill.');
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await api.post('/settings/ai-config', { apiKey: apiKey.trim() });
      setIsConfigured(true);
      setIsEditing(false);
      setApiKey('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error('Erro ao salvar chave OpenAI:', e);
      alert('Erro ao salvar. Verifique se você é administrador.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col pt-8 overflow-hidden bg-background">
      <header className="px-8 mb-6 shrink-0">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Ajustes IA</h1>
        <p className="text-[13px] text-muted-foreground mt-1">Configure o comportamento da inteligência artificial no atendimento.</p>
      </header>

      <div className="flex-1 overflow-y-auto px-8 pb-8 flex flex-col gap-6">

        {/* OpenAI API Key Card */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between bg-primary/5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <KeyRound size={16} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">Chave de API — OpenAI</h4>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Provedor de IA</p>
              </div>
            </div>
            {!loading && (
              <button
                onClick={() => { setIsEditing(!isEditing); setApiKey(''); setShowKey(false); }}
                className="text-xs font-bold text-primary hover:underline"
              >
                {isEditing ? 'Cancelar' : isConfigured ? 'Atualizar Chave' : 'Configurar'}
              </button>
            )}
          </div>

          {loading ? (
            <div className="p-6 flex items-center justify-center">
              <RefreshCw className="animate-spin text-muted-foreground" size={20} />
            </div>
          ) : isEditing ? (
            <div className="p-6 space-y-4 animate-in slide-in-from-top-2 duration-200">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase ml-1">
                  OpenAI API Key
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-proj-..."
                    className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 pr-10 text-sm outline-none focus:border-primary/50 transition-all font-mono"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground ml-1">
                  Encontre sua chave em <span className="font-mono text-primary">platform.openai.com/api-keys</span>
                </p>
              </div>
              <div className="flex justify-end">
                <button
                  disabled={saving || !apiKey.trim()}
                  onClick={handleSave}
                  className="bg-primary text-primary-foreground px-8 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-50 shadow-lg shadow-primary/20"
                >
                  {saving ? <RefreshCw className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                  Salvar Chave
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <span className="text-muted-foreground font-semibold uppercase tracking-tighter text-[9px]">Chave API</span>
                  <span className="text-foreground font-mono">{isConfigured ? '••••••••••••••••••••' : 'Não configurada'}</span>
                </div>
              </div>
              {saved ? (
                <div className="flex items-center gap-2 text-emerald-500 font-bold bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                  <CheckCircle2 size={12} />
                  SALVO
                </div>
              ) : isConfigured ? (
                <div className="flex items-center gap-2 text-emerald-500 font-bold bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  CONFIGURADO
                </div>
              ) : (
                <div className="flex items-center gap-2 text-amber-500 font-bold bg-amber-500/10 px-3 py-1.5 rounded-full border border-amber-500/20">
                  <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                  NÃO CONFIGURADO
                </div>
              )}
            </div>
          )}
        </div>

        {/* Info Card - Como funciona */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden mb-6">
          <div className="p-4 border-b border-border flex items-center gap-3 bg-primary/5">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Bot size={16} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground">Como funciona o Agente IA</h4>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Modo automático</p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">1</div>
              <div>
                <p className="text-sm font-semibold text-foreground">Ative o Modo IA na conversa</p>
                <p className="text-xs text-muted-foreground mt-0.5">Dentro de qualquer conversa, clique no botão &quot;Modo IA&quot; para que o agente assuma o atendimento automaticamente.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">2</div>
              <div>
                <p className="text-sm font-semibold text-foreground">O agente pré-qualifica o lead</p>
                <p className="text-xs text-muted-foreground mt-0.5">A IA responde no WhatsApp com empatia, coleta informações do caso e classifica a área do direito (civil, criminal, trabalhista, etc.).</p>
              </div>
            </div>
          </div>
        </div>

        {/* Skills da IA */}
        <div className="space-y-4 mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Bot size={18} className="text-primary" />
            <h3 className="text-sm font-bold text-foreground uppercase tracking-tight">Skills da IA</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">Ative ou desative habilidades do assistente virtual. Skills controlam quais ações a IA pode executar automaticamente.</p>

          <div className="grid grid-cols-1 gap-3">
            {skills.map((skill: Skill) => (
              <div key={skill.id} className="bg-card/50 backdrop-blur-md border border-border rounded-xl p-4 flex items-center justify-between hover:bg-card/80 transition-all">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">{skill.name}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${skill.isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
                      {skill.isActive ? 'ATIVO' : 'INATIVO'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground max-w-md">{skill.description}</p>
                </div>
                <button
                  onClick={() => toggleSkill(skill.id, skill.isActive)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                    skill.isActive
                      ? 'bg-muted text-foreground hover:bg-muted/80'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20'
                  }`}
                >
                  {skill.isActive ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Sobre o Sistema */}
        <div className="space-y-4 mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 bg-blue-500 text-white rounded flex items-center justify-center text-[10px] font-bold">i</div>
            <h3 className="text-sm font-bold text-foreground uppercase tracking-tight">Sobre o Sistema</h3>
          </div>
          <div className="bg-card/30 backdrop-blur-xl border border-border rounded-2xl p-6 shadow-xl">
            <div className="grid grid-cols-2 gap-y-6 gap-x-12">
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Versão</p>
                <p className="text-sm font-bold text-foreground">1.0.0</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Modelo IA</p>
                <p className="text-sm font-bold text-foreground">GPT-4.1</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Escritório</p>
                <p className="text-sm font-bold text-foreground">André Lustosa Advogados</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Localização</p>
                <p className="text-sm font-bold text-foreground">Arapiraca - AL</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
