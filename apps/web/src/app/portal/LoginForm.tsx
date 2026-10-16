'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Building2, Lock, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';

function maskCnpj(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export default function LoginForm() {
  const router = useRouter();
  const [cnpj, setCnpj] = useState('');
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (cnpj.replace(/\D/g, '').length !== 14) { setError('Informe o CNPJ completo (14 dígitos).'); return; }
    if (!senha) { setError('Informe a senha.'); return; }
    setLoading(true);
    try {
      const res = await axios.post(`${API}/portal/login`, { login: cnpj, senha });
      router.push(`/portal/${res.data.token}`);
    } catch (err: any) {
      const status = err.response?.status;
      setError(
        status === 429
          ? 'Muitas tentativas. Aguarde um minuto e tente novamente.'
          : err.response?.data?.message || 'Não foi possível entrar. Tente novamente.',
      );
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4 text-left">
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-[#A89048] mb-1.5">CNPJ</label>
        <div className="relative">
          <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={cnpj}
            onChange={e => setCnpj(maskCnpj(e.target.value))}
            inputMode="numeric"
            autoComplete="username"
            placeholder="00.000.000/0000-00"
            className="w-full bg-white/5 border border-white/10 focus:border-[#A89048]/60 rounded-xl pl-10 pr-3 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition-colors"
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-[#A89048] mb-1.5">Senha</label>
        <div className="relative">
          <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type={showSenha ? 'text' : 'password'}
            value={senha}
            onChange={e => setSenha(e.target.value)}
            autoComplete="current-password"
            placeholder="Sua senha"
            className="w-full bg-white/5 border border-white/10 focus:border-[#A89048]/60 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition-colors"
          />
          <button
            type="button"
            onClick={() => setShowSenha(s => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            aria-label={showSenha ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#e3c788] to-[#A89048] text-black font-bold text-xs uppercase tracking-widest py-3.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {loading && <Loader2 size={14} className="animate-spin" />}
        Acessar portal
      </button>
    </form>
  );
}
