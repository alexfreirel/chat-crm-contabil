/** Templates de mensagem sugeridos por etapa do CRM. */
export const STAGE_TEMPLATES: Partial<Record<string, { label: string; text: string }>> = {
  QUALIFICANDO:   { label: 'Iniciar triagem', text: 'Olá! Sou da Lexcon Assessoria Contábil. Estamos analisando seu contato. Poderia me contar um pouco mais sobre o que você precisa para que possamos direcioná-lo ao setor correto?' },
  DOCUMENTOS:     { label: 'Solicitar documentos', text: 'Olá! Para avançarmos com o seu atendimento, precisamos de alguns documentos. Pode nos enviar por aqui mesmo!' },
  EM_ATENDIMENTO: { label: 'Confirmar atendimento', text: 'Olá! Seu atendimento foi iniciado pela nossa equipe. Em breve entraremos em contato com as próximas informações. Qualquer dúvida, estou à disposição!' },
  FINALIZADO:     { label: 'Encerrar atendimento', text: 'Olá! Seu atendimento foi concluído com sucesso. Obrigado por confiar na Lexcon Assessoria Contábil. Qualquer dúvida futura, estamos à disposição!' },
};
