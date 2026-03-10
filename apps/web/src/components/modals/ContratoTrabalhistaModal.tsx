'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, X, Send, AlertCircle, CheckCircle2,
  Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';
import api from '@/lib/api';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ContratoVariaveis {
  NOME_CONTRATANTE: string;
  NACIONALIDADE: string;
  ESTADO_CIVIL: string;
  DATA_NASCIMENTO: string;
  NOME_MAE: string;
  NOME_PAI: string;
  CPF: string;
  ENDERECO: string;
  BAIRRO: string;
  CEP: string;
  CIDADE_UF: string;
  PERCENTUAL: number;
  PERCENTUAL_EXTENSO: string;
  DESCRICAO_CAUSA: string;
  DATA_CONTRATO: string;
  CIDADE_CONTRATO: string;
}

interface Props {
  open: boolean;
  conversationId: string | null;
  onClose: () => void;
}

// ─── Campos exibidos no formulário ───────────────────────────────────────────

const CAMPOS: Array<{
  key: keyof ContratoVariaveis;
  label: string;
  required?: boolean;
  type?: 'text' | 'number' | 'textarea';
}> = [
  { key: 'NOME_CONTRATANTE',  label: 'Nome completo do cliente',       required: true },
  { key: 'CPF',               label: 'CPF',                            required: true },
  { key: 'NACIONALIDADE',     label: 'Nacionalidade',                  required: true },
  { key: 'ESTADO_CIVIL',      label: 'Estado civil',                   required: true },
  { key: 'DATA_NASCIMENTO',   label: 'Data de nascimento (extenso)',   required: true },
  { key: 'NOME_MAE',          label: 'Nome da mãe',                    required: true },
  { key: 'NOME_PAI',          label: 'Nome do pai',                    required: true },
  { key: 'ENDERECO',          label: 'Endereço (rua e número)',        required: true },
  { key: 'BAIRRO',            label: 'Bairro',                         required: true },
  { key: 'CEP',               label: 'CEP',                            required: true },
  { key: 'CIDADE_UF',         label: 'Cidade – UF',                    required: true },
  { key: 'PERCENTUAL',        label: 'Honorários (%)',                 required: true, type: 'number' },
  { key: 'DESCRICAO_CAUSA',   label: 'Descrição da causa',             required: true, type: 'textarea' },
  { key: 'DATA_CONTRATO',     label: 'Data do contrato',               required: true },
  { key: 'CIDADE_CONTRATO',   label: 'Cidade do contrato',             required: true },
];

const PCT_EXTENSO: Record<number, string> = {
  5: 'cinco', 10: 'dez', 15: 'quinze', 20: 'vinte',
  25: 'vinte e cinco', 30: 'trinta', 35: 'trinta e cinco', 40: 'quarenta',
};

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ContratoTrabalhistaModal({ open, conversationId, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variaveis, setVariaveis] = useState<ContratoVariaveis | null>(null);
  const [camposFaltando, setCamposFaltando] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  // Carregar preview ao abrir
  useEffect(() => {
    if (!open || !conversationId) return;
    setSent(false);
    setError(null);
    setLoading(true);
    api
      .get(`/contracts/trabalhista/preview?conversationId=${conversationId}`)
      .then((res) => {
        setVariaveis(res.data.variaveis);
        setCamposFaltando(res.data.camposFaltando || []);
      })
      .catch(() => setError('Não foi possível carregar os dados do contrato.'))
      .finally(() => setLoading(false));
  }, [open, conversationId]);

  const handleChange = (key: keyof ContratoVariaveis, value: string | number) => {
    setVariaveis((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, [key]: value };
      // Atualizar extenso automaticamente
      if (key === 'PERCENTUAL') {
        updated.PERCENTUAL_EXTENSO = PCT_EXTENSO[Number(value)] || String(value);
      }
      return updated;
    });
  };

  const handleSend = async () => {
    if (!conversationId || !variaveis) return;
    setSending(true);
    setError(null);
    try {
      await api.post('/contracts/trabalhista/send', {
        conversationId,
        variaveis,
      });
      setSent(true);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Erro ao enviar contrato.');
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-white/10 bg-[#111] shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <FileText className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Contrato Trabalhista</h2>
                  <p className="text-xs text-slate-400">
                    Preencha os campos e envie por WhatsApp
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-slate-500 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {/* Loading */}
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 text-amber-400 animate-spin" />
                </div>
              )}

              {/* Enviado com sucesso */}
              {sent && (
                <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle2 className="h-9 w-9 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-white">Contrato enviado!</p>
                    <p className="text-sm text-slate-400 mt-1">
                      O arquivo .docx foi enviado via WhatsApp.
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="mt-2 px-6 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/20 transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              )}

              {/* Campos */}
              {!loading && !sent && variaveis && (
                <>
                  {/* Aviso de campos faltando */}
                  {camposFaltando.length > 0 && (
                    <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-400">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>
                        <strong>Campos não encontrados na ficha:</strong>{' '}
                        {camposFaltando.join(', ')}. Preencha manualmente abaixo.
                      </span>
                    </div>
                  )}

                  {/* Grid de campos */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {CAMPOS.map(({ key, label, required, type }) => (
                      <div key={key} className={type === 'textarea' ? 'sm:col-span-2' : ''}>
                        <label className="block text-[11px] font-bold uppercase tracking-widest text-amber-500/80 mb-1">
                          {label}
                          {required && <span className="text-red-400 ml-0.5">*</span>}
                        </label>
                        {type === 'textarea' ? (
                          <textarea
                            rows={2}
                            value={String(variaveis[key])}
                            onChange={(e) => handleChange(key, e.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-white/5 text-white text-sm px-3 py-2 focus:outline-none focus:border-amber-500 transition-colors resize-none"
                          />
                        ) : (
                          <input
                            type={type || 'text'}
                            value={String(variaveis[key])}
                            onChange={(e) =>
                              handleChange(
                                key,
                                type === 'number' ? Number(e.target.value) : e.target.value,
                              )
                            }
                            className="w-full rounded-lg border border-white/10 bg-white/5 text-white text-sm px-3 py-2 focus:outline-none focus:border-amber-500 transition-colors"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Preview das partes fixas */}
                  <div className="mt-1">
                    <button
                      type="button"
                      onClick={() => setShowPreview((v) => !v)}
                      className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showPreview ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      Partes fixas do contrato
                    </button>
                    {showPreview && (
                      <div className="mt-2 rounded-xl border border-white/5 bg-white/3 p-3 text-xs text-slate-400 leading-relaxed space-y-1">
                        <p>
                          <strong className="text-slate-300">Contratados:</strong> André Freire Lustosa
                          (OAB/AL 14.209) e Gianny Karla Oliveira Silva (OAB/AL 21.897)
                        </p>
                        <p>
                          <strong className="text-slate-300">Escritório:</strong> Rua Francisco Rodrigues
                          Viana, nº 242, Baixa Grande, Arapiraca/AL, CEP 57307-260
                        </p>
                        <p>
                          <strong className="text-slate-300">Recurso 2ª instância:</strong> Não incluso —
                          necessita novo contrato
                        </p>
                        <p>
                          <strong className="text-slate-300">Foro:</strong> Arapiraca/AL
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Erro */}
              {error && !sent && (
                <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            {!loading && !sent && variaveis && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-400 text-sm font-semibold hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-black text-sm font-bold shadow-lg hover:shadow-amber-500/30 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {sending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Gerando e enviando…
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Enviar contrato por WhatsApp
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
