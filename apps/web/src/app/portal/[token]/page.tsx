'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  CheckCircle2, AlertTriangle, Clock, FileText,
  CreditCard, Building2, User, RefreshCw, MessageCircle,
  ChevronRight, Calendar, DollarSign,
} from 'lucide-react';
import axios from 'axios';

// ── Cliente do portal (sem auth, usa token na URL) ────────────────────────────
const portalApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005',
});

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface PortalInfo {
  cliente: {
    id: string;
    nome: string;
    email: string | null;
    phone: string | null;
    stage: string;
    service_type: string;
    regime_tributario: string | null;
    contador: string | null;
  };
  resumo: {
    totalObrigacoes: number;
    vencidas: number;
    concluidas: number;
    pendentes: number;
    totalPendente: number;
    totalPago: number;
  };
}

interface Obrigacao {
  id: string;
  tipo: string;
  titulo: string;
  due_at: string;
  completed: boolean;
  status: 'CONCLUIDA' | 'VENCIDA' | 'PENDENTE';
}

interface Documento {
  id: string;
  name: string;
  folder: string;
  mime_type: string | null;
  size: number | null;
  competencia: string | null;
  created_at: string;
}

interface Parcela {
  id: string;
  amount: number;
  due_date: string;
  paid_at: string | null;
  status: string;
  payment_method: string | null;
  competencia: string | null;
  tipo: string | null;
}

// ── Utilitários ────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const STAGE_LABELS: Record<string, string> = {
  ONBOARDING: 'Onboarding',
  ATIVO: 'Ativo',
  SUSPENSO: 'Suspenso',
  ENCERRADO: 'Encerrado',
};

const REGIME_LABELS: Record<string, string> = {
  SIMPLES_NACIONAL: 'Simples Nacional',
  LUCRO_PRESUMIDO: 'Lucro Presumido',
  LUCRO_REAL: 'Lucro Real',
  MEI: 'MEI',
  ISENTO: 'Isento',
};

const FOLDER_LABELS: Record<string, string> = {
  FISCAL: 'Fiscal',
  CONTABIL: 'Contábil',
  PESSOAL: 'Pessoal',
  PAYROLL: 'Folha',
  SOCIETARIO: 'Societário',
  OUTROS: 'Outros',
};

// ── Componentes ────────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: 'CONCLUIDA' | 'VENCIDA' | 'PENDENTE' }) {
  if (status === 'CONCLUIDA') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
      <CheckCircle2 size={11} /> Concluída
    </span>
  );
  if (status === 'VENCIDA') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
      <AlertTriangle size={11} /> Vencida
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
      <Clock size={11} /> Pendente
    </span>
  );
}

function PaymentChip({ status }: { status: string }) {
  if (status === 'PAGO') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
      <CheckCircle2 size={11} /> Pago
    </span>
  );
  if (status === 'ATRASADO') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
      <AlertTriangle size={11} /> Atrasado
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
      <Clock size={11} /> Pendente
    </span>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function PortalClientePage() {
  const params = useParams();
  const token  = params.token as string;

  const [info, setInfo]             = useState<PortalInfo | null>(null);
  const [obrigacoes, setObrigacoes] = useState<Obrigacao[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [parcelas, setParcelas]     = useState<Parcela[]>([]);
  const [tab, setTab]               = useState<'resumo' | 'obrigacoes' | 'documentos' | 'financeiro'>('resumo');
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    async function load() {
      setLoading(true);
      try {
        const [infoRes, obRes, docRes, parRes] = await Promise.all([
          portalApi.get(`/portal/info/${token}`),
          portalApi.get(`/portal/obrigacoes/${token}`),
          portalApi.get(`/portal/documentos/${token}`),
          portalApi.get(`/portal/parcelas/${token}`),
        ]);
        setInfo(infoRes.data);
        setObrigacoes(obRes.data ?? []);
        setDocumentos(docRes.data ?? []);
        setParcelas(parRes.data ?? []);
      } catch (err: any) {
        if (err.response?.status === 401) {
          setError('Link expirado ou inválido. Solicite um novo link ao seu contador.');
        } else {
          setError('Erro ao carregar os dados. Tente novamente mais tarde.');
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <RefreshCw size={24} className="text-emerald-600 animate-spin" />
        <p className="text-sm text-slate-500">Carregando seu portal...</p>
      </div>
    </div>
  );

  if (error || !info) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="max-w-sm text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <AlertTriangle size={28} className="text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">Acesso inválido</h2>
        <p className="text-sm text-slate-500">{error ?? 'Token inválido.'}</p>
        <a
          href="https://wa.me/5582982344993"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-emerald-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl"
        >
          <MessageCircle size={16} /> Contatar o escritório
        </a>
      </div>
    </div>
  );

  const { cliente, resumo } = info;

  const TABS = [
    { id: 'resumo',      label: 'Resumo',      icon: <Building2 size={15} /> },
    { id: 'obrigacoes',  label: 'Obrigações',  icon: <Calendar size={15} /> },
    { id: 'documentos',  label: 'Documentos',  icon: <FileText size={15} /> },
    { id: 'financeiro',  label: 'Financeiro',  icon: <DollarSign size={15} /> },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/lexcon-logo-v2.png" alt="Lexcon" className="h-7 w-auto" />
            <span className="text-xs font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 px-2 py-0.5 rounded-full">
              Portal do Cliente
            </span>
          </div>
          <a
            href="https://wa.me/5582982344993"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
          >
            <MessageCircle size={14} /> Falar com o escritório
          </a>
        </div>
      </header>

      {/* Hero — Info do cliente */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-5">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <User size={22} className="text-emerald-700" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-slate-800 text-lg leading-tight truncate">{cliente.nome}</h1>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {STAGE_LABELS[cliente.stage] ?? cliente.stage}
                </span>
                {cliente.regime_tributario && (
                  <span className="text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                    {REGIME_LABELS[cliente.regime_tributario] ?? cliente.regime_tributario}
                  </span>
                )}
                {cliente.contador && (
                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    Contador: {cliente.contador}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 sticky top-[53px] z-10">
        <div className="max-w-2xl mx-auto px-4 flex gap-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5 space-y-4">

        {/* ─── Resumo ──────────────────────────────────────────────────── */}
        {tab === 'resumo' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Total de Obrigações', value: resumo.totalObrigacoes, color: 'text-slate-700' },
                { label: 'Pendentes', value: resumo.pendentes, color: 'text-amber-600' },
                { label: 'Vencidas', value: resumo.vencidas, color: 'text-red-600' },
                { label: 'Concluídas', value: resumo.concluidas, color: 'text-emerald-600' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <CreditCard size={15} className="text-emerald-600" /> Situação Financeira
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-500">Total em Aberto</p>
                  <p className="text-lg font-bold text-amber-600">{fmtBRL(resumo.totalPendente)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Total Pago</p>
                  <p className="text-lg font-bold text-emerald-600">{fmtBRL(resumo.totalPago)}</p>
                </div>
              </div>
            </div>

            {resumo.vencidas > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800">
                    Atenção: {resumo.vencidas} obrigação{resumo.vencidas > 1 ? 'ões' : ''} vencida{resumo.vencidas > 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-red-600 mt-0.5">
                    Entre em contato com o escritório para regularização.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setTab('obrigacoes')}
                className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <span className="text-sm font-medium text-slate-700">Ver Obrigações</span>
                <ChevronRight size={16} className="text-slate-400" />
              </button>
              <button
                onClick={() => setTab('financeiro')}
                className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <span className="text-sm font-medium text-slate-700">Ver Pagamentos</span>
                <ChevronRight size={16} className="text-slate-400" />
              </button>
            </div>
          </>
        )}

        {/* ─── Obrigações ──────────────────────────────────────────────── */}
        {tab === 'obrigacoes' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">
                Obrigações Fiscais ({obrigacoes.length})
              </h3>
            </div>
            {obrigacoes.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">
                Nenhuma obrigação cadastrada
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {obrigacoes.map(ob => (
                  <div key={ob.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{ob.titulo}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Vencimento: {fmtDate(ob.due_at)} · {ob.tipo}
                      </p>
                    </div>
                    <StatusChip status={ob.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Documentos ──────────────────────────────────────────────── */}
        {tab === 'documentos' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">
                Documentos ({documentos.length})
              </h3>
            </div>
            {documentos.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">
                Nenhum documento disponível
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {documentos.map(doc => (
                  <div key={doc.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <FileText size={16} className="text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{doc.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {FOLDER_LABELS[doc.folder] ?? doc.folder}
                        {doc.competencia ? ` · ${fmtDate(doc.competencia)}` : ''}
                        · Enviado {fmtDate(doc.created_at)}
                      </p>
                    </div>
                    <span className="text-xs text-slate-400">
                      {doc.size ? `${(doc.size / 1024).toFixed(0)} KB` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Financeiro ──────────────────────────────────────────────── */}
        {tab === 'financeiro' && (
          <>
            {/* Resumo financeiro */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Em Aberto</p>
                <p className="text-xl font-bold text-amber-600">{fmtBRL(resumo.totalPendente)}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Total Pago</p>
                <p className="text-xl font-bold text-emerald-600">{fmtBRL(resumo.totalPago)}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">
                  Histórico de Pagamentos ({parcelas.length})
                </h3>
              </div>
              {parcelas.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-sm">
                  Nenhum lançamento encontrado
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {parcelas.map(p => (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700">
                          {fmtBRL(p.amount)}
                          {p.tipo && <span className="text-slate-400 font-normal"> — {p.tipo}</span>}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Venc. {fmtDate(p.due_date)}
                          {p.paid_at ? ` · Pago em ${fmtDate(p.paid_at)}` : ''}
                          {p.competencia ? ` · Ref. ${fmtDate(p.competencia)}` : ''}
                        </p>
                      </div>
                      <PaymentChip status={p.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="py-5 text-center">
        <p className="text-xs text-slate-400">
          © {new Date().getFullYear()} Lexcon Assessoria Contábil · Acesso seguro via link privado
        </p>
      </footer>
    </div>
  );
}
