export const LEGAL_STAGES = [
  { id: 'VIABILIDADE',    label: 'Viabilidade',     order: 1 },
  { id: 'DOCUMENTACAO',   label: 'Documentação',    order: 2 },
  { id: 'PETICAO',        label: 'Petição Inicial', order: 3 },
  { id: 'REVISAO',        label: 'Revisão',         order: 4 },
  { id: 'PROTOCOLO',      label: 'Protocolo',       order: 5 },
  { id: 'AJUIZADO',       label: 'Ajuizado',        order: 6 },
  { id: 'ACOMPANHAMENTO', label: 'Acompanhamento',  order: 7 },
] as const;

export type LegalStageId = typeof LEGAL_STAGES[number]['id'];
