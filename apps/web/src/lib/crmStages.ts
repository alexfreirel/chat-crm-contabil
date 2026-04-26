export const CRM_STAGES = [
  { id: 'INICIAL',        label: 'Inicial',        color: '#6b7280', emoji: '👋' },
  { id: 'QUALIFICANDO',   label: 'Qualificando',   color: '#3b82f6', emoji: '🔍' },
  { id: 'DOCUMENTOS',     label: 'Documentos',     color: '#f97316', emoji: '📄' },
  { id: 'EM_ATENDIMENTO', label: 'Em Atendimento', color: '#10b981', emoji: '💬' },
  { id: 'FINALIZADO',     label: 'Finalizado',     color: '#10b981', emoji: '✅' },
  { id: 'PERDIDO',        label: 'Perdido',        color: '#ef4444', emoji: '❌' },
] as const;

export type CrmStageId = typeof CRM_STAGES[number]['id'];

/** Retorna o stage pelo ID, ou "INICIAL" se não encontrado */
export function findStage(id: string | null | undefined) {
  return CRM_STAGES.find(s => s.id === id) ?? CRM_STAGES[0];
}

/** Normaliza stages legados para os novos IDs */
export function normalizeStage(stage: string | null | undefined): string {
  if (!stage) return 'INICIAL';
  const known = CRM_STAGES.find(s => s.id === stage);
  if (known) return known.id;
  const legacyMap: Record<string, string> = {
    NOVO: 'INICIAL', NEW: 'INICIAL',
    CONTATADO: 'QUALIFICANDO', CONTACTED: 'QUALIFICANDO',
    QUALIFICADO: 'QUALIFICANDO', QUALIFIED: 'QUALIFICANDO',
    PROPOSTA: 'QUALIFICANDO', PROPOSAL: 'QUALIFICANDO',
    AGUARDANDO_FORM: 'QUALIFICANDO',
    REUNIAO_AGENDADA: 'EM_ATENDIMENTO',
    AGUARDANDO_DOCS: 'DOCUMENTOS',
    AGUARDANDO_PROC: 'EM_ATENDIMENTO',
    GANHO: 'FINALIZADO', WON: 'FINALIZADO',
  };
  return legacyMap[stage.toUpperCase()] ?? 'INICIAL';
}
