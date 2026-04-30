'use client';

import { useState } from 'react';
import { Loader2, X, Pencil, AlertCircle, CheckCircle2 } from 'lucide-react';
import api from '@/lib/api';
import { showSuccess } from '@/lib/toast';

interface EditContactData {
  id: string;
  name: string;
  phone: string;
  email?: string;
  cpf_cnpj?: string;
}

interface Props {
  contact: EditContactData;
  onClose: () => void;
  onUpdated: (updated: EditContactData) => void;
}

function formatPhoneDisplay(phone: string): string {
  // Remove 55 prefix para exibição
  const digits = phone.replace(/\D/g, '');
  const local = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return phone;
}

export default function EditContactModal({ contact, onClose, onUpdated }: Props) {
  const [name, setName]         = useState(contact.name === 'Sem Nome' ? '' : contact.name);
  const [phone, setPhone]       = useState(formatPhoneDisplay(contact.phone));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError('Nome é obrigatório.'); return; }

    // Normaliza telefone
    const digits = phone.replace(/\D/g, '');
    const normalized = digits.startsWith('55') ? digits : `55${digits}`;
    if (normalized.length < 12) { setError('Telefone inválido. Use DDD + número (ex: 82 99913-0127).'); return; }

    setSubmitting(true);
    try {
      const body: Record<string, string> = {
        name: name.trim(),
        phone: normalized,
      };

      await api.patch(`/leads/${contact.id}`, body);

      showSuccess('Contato atualizado com sucesso.');
      onUpdated({
        id: contact.id,
        name: body.name,
        phone: body.phone,
      });
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Erro ao atualizar contato. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-[3px]" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] z-[100] bg-card border border-border rounded-2xl shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Pencil size={16} className="text-primary" />
            <h2 className="text-[15px] font-bold text-foreground">Editar Contato</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">
          {/* Nome */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Nome *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nome completo"
              className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-[13px] text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/40"
            />
          </div>

          {/* Telefone */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Telefone (DDD + número) *</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(82) 99913-0127"
              className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-[13px] text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/40"
            />
          </div>

          {/* Erro */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-[12px] text-red-500">
              <AlertCircle size={13} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Ações */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-[13px] font-semibold text-muted-foreground hover:bg-accent transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {submitting ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
