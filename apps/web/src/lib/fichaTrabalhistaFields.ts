export interface FichaField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'textarea' | 'cpf' | 'cep' | 'phone' | 'money';
  options?: string[];
  required?: boolean;
  placeholder?: string;
  colSpan?: 1 | 2;
}

export interface FichaSection {
  id: string;
  label: string;
  icon: string;
  fields: FichaField[];
}

export const FICHA_SECTIONS: FichaSection[] = [
  {
    id: 'pessoal',
    label: 'Dados Pessoais',
    icon: 'User',
    fields: [
      { key: 'nome_completo', label: 'Nome Completo', type: 'text', required: true, colSpan: 2 },
      { key: 'cpf', label: 'CPF', type: 'cpf', placeholder: '000.000.000-00' },
      { key: 'rg', label: 'RG', type: 'text' },
      { key: 'orgao_emissor', label: 'Órgão Emissor', type: 'text', placeholder: 'SSP/AL' },
      { key: 'data_nascimento', label: 'Data de Nascimento', type: 'date' },
      { key: 'nome_mae', label: 'Nome da Mãe', type: 'text', colSpan: 2 },
      { key: 'estado_civil', label: 'Estado Civil', type: 'select', options: ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável'] },
      { key: 'nacionalidade', label: 'Nacionalidade', type: 'text', placeholder: 'Brasileira' },
      { key: 'profissao', label: 'Profissão', type: 'text' },
      { key: 'telefone', label: 'Telefone', type: 'phone', placeholder: '(00) 00000-0000' },
      { key: 'email', label: 'E-mail', type: 'text', placeholder: 'email@exemplo.com', colSpan: 2 },
    ],
  },
  {
    id: 'endereco',
    label: 'Endereço',
    icon: 'MapPin',
    fields: [
      { key: 'cep', label: 'CEP', type: 'cep', placeholder: '00000-000' },
      { key: 'logradouro', label: 'Logradouro', type: 'text', colSpan: 2 },
      { key: 'numero', label: 'Número', type: 'text' },
      { key: 'bairro', label: 'Bairro', type: 'text' },
      { key: 'cidade', label: 'Cidade', type: 'text' },
      { key: 'estado_uf', label: 'UF', type: 'select', options: ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'] },
    ],
  },
  {
    id: 'contrato',
    label: 'Dados do Contrato',
    icon: 'Briefcase',
    fields: [
      { key: 'nome_empregador', label: 'Nome do Empregador', type: 'text', required: true, colSpan: 2 },
      { key: 'cnpjcpf_empregador', label: 'CNPJ/CPF do Empregador', type: 'text' },
      { key: 'funcao', label: 'Função/Cargo', type: 'text' },
      { key: 'data_admissao', label: 'Data de Admissão', type: 'date' },
      { key: 'data_saida', label: 'Data de Saída', type: 'date' },
      { key: 'situacao_atual', label: 'Situação Atual', type: 'select', options: ['Empregado(a)', 'Demitido(a) sem justa causa', 'Demitido(a) por justa causa', 'Pediu demissão', 'Acordo', 'Contrato encerrado'] },
      { key: 'motivo_saida', label: 'Motivo da Saída', type: 'text', colSpan: 2 },
      { key: 'salario', label: 'Último Salário', type: 'money', placeholder: 'R$ 0,00' },
      { key: 'periodicidade_pagamento', label: 'Periodicidade', type: 'select', options: ['Mensal', 'Quinzenal', 'Semanal', 'Diário', 'Por hora'] },
      { key: 'ctps_numero', label: 'Nº CTPS', type: 'text' },
      { key: 'pis_pasep', label: 'PIS/PASEP', type: 'text' },
      { key: 'ctps_assinada_corretamente', label: 'CTPS assinada corretamente?', type: 'select', options: ['Sim', 'Não', 'Parcialmente'] },
      { key: 'periodo_sem_carteira', label: 'Período sem carteira assinada', type: 'text', placeholder: 'Ex: jan/2020 a mar/2020' },
      { key: 'atividades_realizadas', label: 'Atividades Realizadas', type: 'textarea', colSpan: 2 },
    ],
  },
  {
    id: 'jornada',
    label: 'Jornada de Trabalho',
    icon: 'Clock',
    fields: [
      { key: 'horario_entrada', label: 'Horário de Entrada', type: 'text', placeholder: '08:00' },
      { key: 'horario_saida', label: 'Horário de Saída', type: 'text', placeholder: '17:00' },
      { key: 'tempo_intervalo', label: 'Tempo de Intervalo', type: 'text', placeholder: '1 hora' },
      { key: 'dias_trabalhados', label: 'Dias Trabalhados', type: 'text', placeholder: 'Seg a Sex' },
      { key: 'fazia_horas_extras', label: 'Fazia horas extras?', type: 'select', options: ['Sim', 'Não', 'Às vezes'] },
      { key: 'qtd_horas_extras_dia', label: 'Qtd horas extras/dia', type: 'text', placeholder: 'Ex: 2 horas' },
      { key: 'tipo_controle_ponto', label: 'Tipo de Controle de Ponto', type: 'select', options: ['Eletrônico', 'Manual/Folha', 'Não havia', 'Aplicativo'] },
      { key: 'horas_extras_pagas_corretamente', label: 'Horas extras pagas corretamente?', type: 'select', options: ['Sim', 'Não', 'Parcialmente'] },
      { key: 'possui_copia_ponto', label: 'Possui cópia do ponto?', type: 'select', options: ['Sim', 'Não'] },
      { key: 'ponto_refletia_realidade', label: 'O ponto refletia a realidade?', type: 'select', options: ['Sim', 'Não'] },
      { key: 'horario_real_trabalhado', label: 'Horário real trabalhado', type: 'text', placeholder: 'Ex: 07:00 às 19:00', colSpan: 2 },
    ],
  },
  {
    id: 'pagamentos',
    label: 'Pagamentos e Benefícios',
    icon: 'DollarSign',
    fields: [
      { key: 'recebia_por_fora', label: 'Recebia "por fora"?', type: 'select', options: ['Sim', 'Não'] },
      { key: 'outro_valor_por_fora', label: 'Valor recebido por fora', type: 'text', placeholder: 'R$ e motivo' },
      { key: 'recebia_vale_transporte', label: 'Recebia Vale Transporte?', type: 'select', options: ['Sim', 'Não'] },
      { key: 'precisava_vt', label: 'Precisava de VT?', type: 'select', options: ['Sim', 'Não'] },
      { key: 'valor_gasto_vt', label: 'Valor gasto com transporte', type: 'text', placeholder: 'R$ por mês' },
      { key: 'premio_comissao', label: 'Recebia prêmio/comissão?', type: 'select', options: ['Sim - Prêmio', 'Sim - Comissão', 'Sim - Ambos', 'Não'] },
      { key: 'natureza_premio', label: 'Natureza do Prêmio', type: 'text' },
      { key: 'valor_premio', label: 'Valor do Prêmio', type: 'text' },
      { key: 'periodicidade_premio', label: 'Periodicidade do Prêmio', type: 'select', options: ['Mensal', 'Trimestral', 'Semestral', 'Anual', 'Eventual'] },
      { key: 'tem_prova_premio', label: 'Tem prova do prêmio?', type: 'select', options: ['Sim', 'Não'] },
      { key: 'natureza_comissao', label: 'Natureza da Comissão', type: 'text' },
      { key: 'valor_comissao', label: 'Valor da Comissão', type: 'text' },
      { key: 'periodicidade_comissao', label: 'Periodicidade da Comissão', type: 'select', options: ['Mensal', 'Trimestral', 'Semestral', 'Anual', 'Por venda'] },
      { key: 'tem_prova_comissao', label: 'Tem prova da comissão?', type: 'select', options: ['Sim', 'Não'] },
    ],
  },
  {
    id: 'seguranca',
    label: 'Saúde e Segurança',
    icon: 'Shield',
    fields: [
      { key: 'ambiente_insalubre_perigoso', label: 'Ambiente insalubre ou perigoso?', type: 'select', options: ['Sim - Insalubre', 'Sim - Perigoso', 'Sim - Ambos', 'Não'] },
      { key: 'ambiente_insalubre', label: 'Descreva a insalubridade/periculosidade', type: 'text', colSpan: 2 },
      { key: 'forneciam_epis', label: 'Forneciam EPIs?', type: 'select', options: ['Sim', 'Não', 'Parcialmente'] },
      { key: 'sofreu_acidente', label: 'Sofreu acidente de trabalho?', type: 'select', options: ['Sim', 'Não'] },
      { key: 'detalhes_acidente', label: 'Detalhes do acidente', type: 'textarea', colSpan: 2 },
      { key: 'recebeu_auxilio_b91', label: 'Recebeu auxílio acidentário (B91)?', type: 'select', options: ['Sim', 'Não', 'Não se aplica'] },
      { key: 'tempo_cessacao_beneficio', label: 'Tempo de cessação do benefício', type: 'text' },
      { key: 'sofreu_assedio_moral', label: 'Sofreu assédio moral?', type: 'select', options: ['Sim', 'Não'] },
      { key: 'detalhes_assedio_moral', label: 'Detalhes do assédio', type: 'textarea', colSpan: 2 },
    ],
  },
  {
    id: 'verbas',
    label: 'FGTS e Verbas Rescisórias',
    icon: 'Wallet',
    fields: [
      { key: 'fgts_depositado', label: 'FGTS depositado corretamente?', type: 'select', options: ['Sim', 'Não', 'Parcialmente', 'Não sei'] },
      { key: 'fgts_sacado', label: 'Conseguiu sacar o FGTS?', type: 'select', options: ['Sim', 'Não', 'Parcialmente', 'Não se aplica'] },
      { key: 'tem_ferias_pendentes', label: 'Tem férias pendentes?', type: 'select', options: ['Sim', 'Não', 'Não sei'] },
      { key: 'tem_decimo_terceiro_pendente', label: 'Tem 13º pendente?', type: 'select', options: ['Sim', 'Não', 'Não sei'] },
      { key: 'detalhes_verbas_pendentes', label: 'Detalhes de verbas pendentes', type: 'textarea', colSpan: 2 },
    ],
  },
  {
    id: 'provas',
    label: 'Testemunhas e Provas',
    icon: 'FileCheck',
    fields: [
      { key: 'possui_testemunhas', label: 'Possui testemunhas?', type: 'select', options: ['Sim', 'Não'] },
      { key: 'detalhes_testemunhas', label: 'Nomes e contatos das testemunhas', type: 'textarea', colSpan: 2 },
      { key: 'possui_provas_documentais', label: 'Possui provas documentais?', type: 'select', options: ['Sim', 'Não'] },
      { key: 'detalhes_provas_documentais', label: 'Descrição das provas', type: 'textarea', colSpan: 2 },
    ],
  },
  {
    id: 'resumo',
    label: 'Motivos da Reclamação',
    icon: 'FileText',
    fields: [
      { key: 'motivos_reclamacao', label: 'Descreva os motivos da reclamação trabalhista', type: 'textarea', colSpan: 2 },
    ],
  },
];

// Default empty form data
export function getEmptyFormData(): Record<string, string> {
  const data: Record<string, string> = {};
  for (const section of FICHA_SECTIONS) {
    for (const field of section.fields) {
      data[field.key] = field.key === 'nacionalidade' ? 'Brasileira' : '';
    }
  }
  return data;
}
