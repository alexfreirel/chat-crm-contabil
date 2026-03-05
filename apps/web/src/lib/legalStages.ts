export const LEGAL_STAGES = [
  { id: 'VIABILIDADE',    label: 'Viabilidade',    color: '#6366f1', emoji: '🔎' },
  { id: 'DOCUMENTACAO',   label: 'Documentação',   color: '#f59e0b', emoji: '📑' },
  { id: 'PETICAO',        label: 'Petição',        color: '#3b82f6', emoji: '📝' },
  { id: 'REVISAO',        label: 'Revisão',        color: '#8b5cf6', emoji: '🔍' },
  { id: 'PROTOCOLO',      label: 'Protocolo',      color: '#ec4899', emoji: '🏛️' },
  { id: 'AJUIZADO',       label: 'Ajuizado',       color: '#10b981', emoji: '⚖️' },
  { id: 'ACOMPANHAMENTO', label: 'Acompanhamento', color: '#06b6d4', emoji: '📋' },
] as const;

export type LegalStageId = typeof LEGAL_STAGES[number]['id'];

/** Retorna o stage pelo ID, ou VIABILIDADE se não encontrado */
export function findLegalStage(id: string | null | undefined) {
  return LEGAL_STAGES.find(s => s.id === id) ?? LEGAL_STAGES[0];
}
