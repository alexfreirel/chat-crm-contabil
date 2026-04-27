'use client';

import React, { useState, useRef, useEffect } from 'react';
import { RouteGuard } from '@/components/RouteGuard';
import {
  BookOpen, Search, ChevronDown, ChevronRight, Users, MessageSquare,
  BarChart3, Calendar, FileText, DollarSign, Settings, Bot,
  ArrowRight, CheckCircle2, Send, Filter, Sparkles, Building2, Briefcase,
} from 'lucide-react';

// ─── Dados do Manual ─────────────────────────────────────────────────────────

interface Section {
  id: string;
  title: string;
  icon: any;
  content: SubSection[];
}

interface SubSection {
  id: string;
  title: string;
  body: string;
}

const MANUAL_SECTIONS: Section[] = [
  {
    id: 'visao-geral',
    title: '1. Visão Geral do Sistema',
    icon: BookOpen,
    content: [
      {
        id: 'o-que-e',
        title: 'O que é o sistema',
        body: `O sistema é um CRM contábil completo com atendimento automatizado por IA via WhatsApp. A Sophia (assistente virtual) faz o primeiro contato, qualifica leads, coleta informações e agenda reuniões — tudo de forma natural, como se fosse uma pessoa real.

Módulos principais:
• Atendimento — Chat ao vivo com leads e clientes (IA ou humano)
• CRM — Pipeline visual de leads do primeiro contato até a contratação
• Clientes Contábeis — Workspace completo de cada cliente do escritório
• Agenda — Reuniões, prazos e tarefas com lembretes automáticos
• Obrigações Fiscais — Controle de vencimentos e obrigações acessórias
• Financeiro — Honorários, parcelas e notas fiscais
• Follow-up — Sequências automáticas de mensagens para leads inativos`,
      },
      {
        id: 'papeis',
        title: 'Papéis de usuário',
        body: `O sistema possui 4 papéis com permissões diferentes:

• Contador — Controle total do sistema. Configura IA, gerencia equipe, vê todas as conversas, métricas e clientes.
• Operador — Atende leads na aba de chat. Vê conversas atribuídas a ele e pode acessar o CRM.
• Assistente — Acesso a tarefas, agenda e clientes contábeis (sem financeiro).
• Financeiro — Acesso ao módulo financeiro, honorários e notas fiscais.`,
      },
    ],
  },
  {
    id: 'jornada-lead',
    title: '2. Jornada do Lead',
    icon: ArrowRight,
    content: [
      {
        id: 'fluxo-completo',
        title: 'Fluxo completo do lead',
        body: `O lead passa por estágios desde o primeiro contato até virar cliente:

NOVO → INICIAL → QUALIFICANDO → REUNIÃO_AGENDADA → AGUARDANDO_DOCS → AGUARDANDO_PROC → FINALIZADO

Ao finalizar, o lead vira CLIENTE CONTÁBIL:
• Sai da aba "Leads" no atendimento
• Aparece na aba "Clientes"
• Um registro de Cliente Contábil é criado automaticamente
• A IA é desligada (atendimento passa a ser humano)

Leads que não avançam vão para PERDIDO (com motivo obrigatório).`,
      },
      {
        id: 'entrada',
        title: '2.1 Entrada do lead',
        body: `O lead pode entrar de 3 formas:

1. WhatsApp (principal) — Quando alguém manda mensagem para o número do escritório, o sistema cria o lead automaticamente com stage=NOVO e inicia a conversa com a Sophia.

2. Manual — O operador pode cadastrar um lead manualmente pelo menu Contatos, informando nome e telefone.

3. CRM — O contador pode converter um lead em cliente diretamente pelo pipeline, criando o registro de Cliente Contábil.`,
      },
      {
        id: 'sdr',
        title: '2.2 SDR Sophia — Primeiro contato',
        body: `A Sophia SDR é o primeiro agente que atende. Ela:
• Pede o nome do lead
• Entende qual é a necessidade contábil
• Identifica a área (BPO Fiscal, Contabilidade, Departamento Pessoal, IRPF, etc.)
• Gera um resumo da demanda

Ela NÃO dá orientação tributária, NÃO analisa viabilidade fiscal e NÃO agenda reuniões.

Quando identifica nome + área, o lead avança para QUALIFICANDO e a conversa é transferida silenciosamente para o Especialista daquela área.`,
      },
      {
        id: 'especialista',
        title: '2.3 Especialista — Triagem e qualificação',
        body: `O Especialista (Fiscal, Contábil, Depto Pessoal, etc.) assume a conversa e:

1. PRIMEIRO responde as dúvidas do lead — não começa coletando dados
2. Avalia o perfil fiscal — porte da empresa, regime tributário, número de funcionários
3. Investiga necessidades específicas — faturamento, obrigações acessórias, situação atual
4. Coleta dados da empresa — CNPJ, razão social, contato do responsável

Cada especialista tem documentos de referência:
• Persona e Regras — Como se comunicar
• Funil e Fases — Quando avançar cada etapa
• Investigação por Área — Perguntas específicas por tipo de serviço`,
      },
      {
        id: 'agendamento',
        title: '2.4 Agendamento de reunião',
        body: `Quando o lead quer prosseguir, o Especialista agenda uma reunião:

Etapa 1: Pergunta o dia ("Quer conversar amanhã ou prefere outro dia?")
Etapa 2: Mostra horários disponíveis via lista clicável do WhatsApp

Os horários vêm da agenda do contador (configurada no sistema). A IA nunca inventa horários.

Ao confirmar, o lead vai para REUNIÃO_AGENDADA e um evento é criado na agenda com lembrete automático por WhatsApp.`,
      },
      {
        id: 'documentos',
        title: '2.5 Coleta de documentos',
        body: `Após a reunião, o Especialista solicita documentos:
• Empresariais: Contrato Social, cartão CNPJ, última declaração
• Pessoais (quando aplicável): RG/CNH do responsável
• Fiscais: Extratos, guias pagas, certidões

Os documentos são solicitados um por vez. O lead envia pelo WhatsApp e ficam armazenados no sistema.

O lead vai para AGUARDANDO_DOCS enquanto os documentos são coletados.`,
      },
      {
        id: 'honorarios',
        title: '2.6 Proposta e contrato',
        body: `Modelos de cobrança por serviço:

• Mensalidade fixa — BPO Fiscal, BPO Contábil, Depto Pessoal. Valor mensal recorrente.
• Avulso — IRPF, abertura de empresa, regularizações. Valor único por serviço.
• Misto — Mensalidade + serviços avulsos sob demanda.

Após definir a proposta, o contrato de prestação de serviços é enviado para assinatura. O lead vai para AGUARDANDO_PROC.`,
      },
      {
        id: 'conversao',
        title: '2.7 Conversão: Lead → Cliente',
        body: `Quando o lead assina o contrato, ele é FINALIZADO:

O que acontece automaticamente:
• lead.is_client = true (vira cliente)
• lead.stage = FINALIZADO
• Sai da aba "Leads" no atendimento
• Aparece na aba "Clientes"
• Um registro de Cliente Contábil é criado
• A IA é desligada na conversa
• O contador responsável é atribuído

O cliente continua podendo mandar mensagem pelo WhatsApp — agora aparece na aba Clientes.`,
      },
      {
        id: 'perdido',
        title: '2.8 Leads perdidos',
        body: `Um lead vai para PERDIDO quando:
• Preço acima do esperado
• Já tem contador e não quer trocar
• Empresa em encerramento/inativa
• Não respondeu após follow-ups
• Escolheu outro escritório

É obrigatório informar o motivo (loss_reason). O lead sai da aba Leads mas pode ser reativado se voltar a mandar mensagem.`,
      },
    ],
  },
  {
    id: 'atendimento',
    title: '3. Painel de Atendimento',
    icon: MessageSquare,
    content: [
      {
        id: 'leads-clientes',
        title: 'Aba Leads vs Aba Clientes',
        body: `O painel de atendimento tem duas abas:

Leads — Contatos em prospecção (ainda não contrataram). Mostra leads com stage diferente de FINALIZADO e PERDIDO. É onde o operador trabalha no dia a dia.

Clientes — Contatos que já contrataram (is_client=true). Mostra todos os clientes, mesmo com conversa encerrada. Útil para acompanhamento e relacionamento.

Para aparecer na aba Leads: is_client=false e stage NOT IN (PERDIDO, FINALIZADO)
Para aparecer na aba Clientes: is_client=true`,
      },
      {
        id: 'ia-mode',
        title: 'Como funciona a IA',
        body: `Cada conversa tem um toggle de IA:

IA Ligada (ai_mode=true) — A Sophia responde automaticamente. O operador pode acompanhar mas não precisa intervir.

IA Desligada (ai_mode=false) — O operador responde manualmente. A Sophia para de responder.

A IA é desligada automaticamente quando:
• O operador assume a conversa
• O lead pede atendente humano
• O lead vira cliente (FINALIZADO)

O operador pode religar a IA a qualquer momento pelo toggle no chat.`,
      },
      {
        id: 'transferencia',
        title: 'Como transferir conversa',
        body: `Para transferir uma conversa para outro operador ou contador:

1. Abrir a conversa
2. Clicar no botão de transferência (no header do chat)
3. Selecionar o destinatário
4. Opcionalmente: gravar áudio explicando o contexto
5. Enviar

A transferência fica PENDENTE até o destinatário aceitar. Enquanto isso, a conversa continua com o operador original.`,
      },
      {
        id: 'perguntas-aberto',
        title: 'Perguntas em aberto',
        body: `No topo do chat aparece um banner com "Perguntas em aberto" — são questões que a IA identificou que ainda precisam ser respondidas.

Exemplos: "Qual o regime tributário atual?", "Quantos funcionários tem?", "Tem contador atualmente?"

Essas perguntas são atualizadas a cada mensagem e ajudam o operador a saber o que ainda falta coletar do lead.`,
      },
    ],
  },
  {
    id: 'crm',
    title: '4. CRM (Pipeline)',
    icon: Filter,
    content: [
      {
        id: 'estagios',
        title: 'Estágios do funil',
        body: `O CRM mostra todos os leads em formato de pipeline (kanban):

INICIAL — Primeiro contato, ainda sendo identificado
QUALIFICANDO — IA ou operador investigando a necessidade
AGUARDANDO_FORM — Esperando formulário de intake
REUNIÃO_AGENDADA — Reunião marcada com o contador
AGUARDANDO_DOCS — Esperando documentos da empresa
AGUARDANDO_PROC — Esperando contrato assinado
FINALIZADO — Convertido em cliente (sai do CRM, vai para Clientes)
PERDIDO — Não avançou (com motivo)

Os leads podem ser arrastados entre estágios manualmente.`,
      },
      {
        id: 'score',
        title: 'Score do lead',
        body: `Cada lead tem um score de 0 a 100 que indica a probabilidade de conversão:

Base por estágio: INICIAL=10, QUALIFICANDO=25, REUNIÃO_AGENDADA=50, etc.
Bônus: +8 se área contábil definida, +5 se responsável atribuído, +5 se próximo passo definido
Penalidade: -3 por dia parado no mesmo estágio (máx -25)

Cores: Verde (70+), Amarelo (45-69), Laranja (20-44), Vermelho (<20)`,
      },
    ],
  },
  {
    id: 'clientes-contabeis',
    title: '5. Clientes Contábeis',
    icon: Building2,
    content: [
      {
        id: 'workspace-cliente',
        title: 'Workspace do cliente',
        body: `Cada cliente contábil tem um workspace completo com:

• Dados cadastrais — CNPJ/CPF, regime tributário, endereço, contato
• Obrigações Fiscais — Calendário de vencimentos e status de entrega
• Documentos — Arquivo de documentos enviados e gerados
• Honorários — Mensalidade, parcelas e histórico de pagamentos
• Tarefas — Atividades pendentes vinculadas ao cliente
• Timeline — Histórico de interações e alterações`,
      },
      {
        id: 'tipos-cliente',
        title: 'Tipos de cliente',
        body: `O sistema suporta dois tipos de pessoa:

Pessoa Jurídica (PJ):
• CNPJ, Razão Social, Nome Fantasia
• Regime: Simples Nacional, Lucro Presumido, Lucro Real, MEI
• Responsável legal + contato financeiro

Pessoa Física (PF):
• CPF, nome completo
• Serviços: IRPF, carnê-leão, ganho de capital

Cada tipo tem seus campos e obrigações específicas configuráveis.`,
      },
      {
        id: 'servicos',
        title: 'Tipos de serviço',
        body: `Os serviços contábeis são categorizados por área:

• BPO Fiscal — Escrituração fiscal, apuração de impostos, obrigações acessórias (SPED, DCTF, EFD)
• BPO Contábil — Escrituração contábil, balanços, DRE, SPED Contábil
• Departamento Pessoal — Folha de pagamento, eSocial, FGTS, admissões/demissões
• IRPF — Declaração anual do Imposto de Renda Pessoa Física
• Abertura de Empresa — Registro na Junta, CNPJ, Alvará, enquadramento tributário
• Regularização — MEI para ME, troca de regime, CNPJ inapto`,
      },
      {
        id: 'google-drive',
        title: 'Integração com Google Drive',
        body: `Cada cliente pode ter uma pasta vinculada no Google Drive:

• O ID da pasta é configurado no cadastro do cliente
• Documentos podem ser acessados diretamente pelo workspace
• Útil para manter todos os arquivos do cliente organizados e acessíveis pela equipe

Para configurar: no cadastro do cliente, cole o ID da pasta do Google Drive (o código longo na URL da pasta).`,
      },
    ],
  },
  {
    id: 'agenda',
    title: '6. Agenda e Tarefas',
    icon: Calendar,
    content: [
      {
        id: 'tipos-evento',
        title: 'Tipos de evento',
        body: `A agenda suporta 6 tipos de evento:

• CONSULTA — Reunião com lead/cliente (presencial, vídeo ou telefone)
• PRAZO — Prazo fiscal ou contábil (DCTF, SPED, DASN, PGDAS, etc.)
• REUNIÃO — Reunião interna da equipe
• TAREFA — Atividade interna (preparar declaração, revisar balancete)
• VISITA — Visita ao cliente
• OUTRO — Qualquer outro compromisso

Cada evento pode ter lembretes automáticos por WhatsApp (ex: 1 dia antes, 2 horas antes).`,
      },
      {
        id: 'lembretes',
        title: 'Lembretes automáticos',
        body: `O sistema envia lembretes por WhatsApp automaticamente:

• Para o cliente: lembrete da reunião com data, hora e local
• Para o responsável interno: lembrete com detalhes do compromisso

Os lembretes são configuráveis por evento:
- minutes_before: 1440 (1 dia), 60 (1 hora), 120 (2 horas)
- channel: WHATSAPP

Prazos fiscais podem ser configurados com lembretes múltiplos (7 dias antes, 1 dia antes).`,
      },
    ],
  },
  {
    id: 'followup',
    title: '7. Follow-up Automático',
    icon: Send,
    content: [
      {
        id: 'sequencias',
        title: 'O que são sequências',
        body: `Sequências são séries de mensagens automáticas enviadas a leads que pararam de responder ou que chegaram a um determinado estágio.

Exemplo: Lead ficou 3 dias sem responder após a triagem → sequência de reengajamento envia mensagem personalizada.

Cada sequência tem:
• Nome e descrição
• Estágios de auto-enrollment (quando ativar automaticamente)
• Passos com delay, tom, objetivo e prompt customizado
• Opção de envio automático ou com aprovação manual`,
      },
      {
        id: 'como-funciona-followup',
        title: 'Como funciona',
        body: `1. Lead entra no estágio configurado (ex: QUALIFICANDO)
2. Sistema verifica se há sequência com auto_enroll para esse estágio
3. Se sim, lead é inscrito automaticamente
4. Após o delay configurado (ex: 72 horas), a IA gera uma mensagem personalizada
5. Se auto_send=true, envia direto. Se false, vai para fila de aprovação
6. Se o lead responder, a sequência para automaticamente

As mensagens são geradas pela IA com contexto do lead (nome, empresa, necessidade).`,
      },
    ],
  },
  {
    id: 'financeiro',
    title: '8. Financeiro',
    icon: DollarSign,
    content: [
      {
        id: 'honorarios',
        title: 'Honorários e mensalidades',
        body: `Cada cliente tem seus honorários configurados:

• Tipo: Mensalidade (recorrente) ou Avulso (único)
• Valor: fixo mensal ou por serviço prestado
• Parcelas: divisão em pagamentos mensais (para serviços avulsos)
• Status: Pendente, Pago, Atrasado, Cancelado

O sistema rastreia parcelas, pagamentos recebidos e gera relatórios financeiros por cliente e por período.`,
      },
      {
        id: 'notas-fiscais',
        title: 'Notas fiscais',
        body: `O módulo de notas fiscais permite:
• Emissão de NFS-e (Nota de Serviço Eletrônica) vinculada ao cliente
• Controle de notas emitidas vs pendentes
• Histórico de faturamento por cliente e por período
• Integração com gateway de pagamento para cobranças automáticas`,
      },
      {
        id: 'relatorios',
        title: 'Relatórios financeiros',
        body: `Em Financeiro > Relatórios você encontra:

• Receita por período — Honorários recebidos vs a receber
• Inadimplência — Clientes com parcelas em atraso
• Crescimento — Novos clientes e cancelamentos por mês
• Faturamento por serviço — Quais serviços geram mais receita

Os relatórios podem ser exportados em CSV ou PDF.`,
      },
    ],
  },
  {
    id: 'configuracoes',
    title: '9. Configurações (Contador)',
    icon: Settings,
    content: [
      {
        id: 'config-ia',
        title: 'Inteligência Artificial',
        body: `Em Configurações > IA você gerencia:

• Modelo — Qual LLM usar (Claude, GPT-4, etc.)
• Skills — Os "especialistas" da Sophia (SDR, Fiscal, Contábil, Depto Pessoal, etc.)
• Referências — Documentos que a IA consulta para responder (persona, funil, investigação)
• Temperatura — Criatividade das respostas (0.0 = preciso, 1.0 = criativo)
• Voz TTS — Se ativado, Sophia responde por áudio quando o lead envia áudio

Cada skill tem um prompt editável e até 3 referências. Alterar o prompt muda o comportamento da Sophia naquela área.`,
      },
      {
        id: 'config-whatsapp',
        title: 'WhatsApp e Inboxes',
        body: `O sistema suporta múltiplos números de WhatsApp:

• Instâncias — Cada número do WhatsApp é uma instância da Evolution API
• Inboxes — Agrupam instâncias e atribuem operadores
• Round-robin — Distribui automaticamente conversas novas entre operadores do inbox

Em Configurações > WhatsApp: URL da API, chave de autenticação
Em Configurações > Inboxes: criar/editar inboxes, atribuir operadores`,
      },
      {
        id: 'config-equipe',
        title: 'Equipe e permissões',
        body: `Em Configurações > Usuários:
• Criar/editar usuários
• Atribuir papel (Contador, Operador, Assistente, Financeiro)
• Definir áreas de especialidade (para auto-atribuição de leads)
• Vincular a inboxes

Em Configurações > Permissões:
• Controle granular por papel
• Quem pode ver/editar cada módulo do sistema`,
      },
      {
        id: 'config-automacoes',
        title: 'Automações',
        body: `Em Configurações > Automações:
• Regras que disparam ações automáticas
• Exemplos: "Quando lead ficar 3 dias parado → enviar follow-up", "Quando lead for FINALIZADO → criar tarefa para contador"
• Configuração de sequências de follow-up por estágio do funil`,
      },
    ],
  },
];

// ─── Componente ──────────────────────────────────────────────────────────────

function ManualContent() {
  const [search, setSearch] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['visao-geral', 'jornada-lead']));
  const [activeSection, setActiveSection] = useState('visao-geral');
  const contentRef = useRef<HTMLDivElement>(null);

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const scrollToSection = (sectionId: string, subId?: string) => {
    setExpandedSections(prev => new Set([...prev, sectionId]));
    setActiveSection(sectionId);
    setTimeout(() => {
      const el = document.getElementById(subId || sectionId);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // Filtrar seções por busca
  const filteredSections = search.trim()
    ? MANUAL_SECTIONS.map(s => ({
        ...s,
        content: s.content.filter(sub =>
          sub.title.toLowerCase().includes(search.toLowerCase()) ||
          sub.body.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter(s => s.content.length > 0)
    : MANUAL_SECTIONS;

  // Expandir tudo ao buscar
  useEffect(() => {
    if (search.trim()) {
      setExpandedSections(new Set(filteredSections.map(s => s.id)));
    }
  }, [search]);

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Sidebar de navegação */}
      <aside className="w-64 shrink-0 border-r border-border bg-card overflow-y-auto custom-scrollbar hidden lg:block">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={18} className="text-primary" />
            <h2 className="text-sm font-bold text-foreground">Manual do Sistema</h2>
          </div>
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border bg-background">
            <Search size={12} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar no manual..."
              className="flex-1 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
        </div>
        <nav className="p-2">
          {MANUAL_SECTIONS.map(section => (
            <button
              key={section.id}
              onClick={() => scrollToSection(section.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-[11px] font-medium transition-colors mb-0.5 ${
                activeSection === section.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`}
            >
              <section.icon size={13} className="shrink-0" />
              <span className="truncate">{section.title}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Conteúdo */}
      <main ref={contentRef} className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Header mobile com busca */}
        <div className="lg:hidden sticky top-0 z-10 bg-card border-b border-border p-4">
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border bg-background">
            <Search size={12} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar no manual..."
              className="flex-1 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          {/* Título */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <BookOpen size={24} className="text-primary" />
              Manual do Sistema
            </h1>
            <p className="text-sm text-muted-foreground">
              Guia completo de uso — do primeiro contato do lead até a gestão completa do cliente contábil.
            </p>
          </div>

          {/* Seções */}
          {filteredSections.map(section => (
            <div key={section.id} id={section.id} className="border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center gap-3 px-5 py-4 bg-card hover:bg-accent/30 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <section.icon size={16} className="text-primary" />
                </div>
                <span className="flex-1 text-[14px] font-bold text-foreground">{section.title}</span>
                {expandedSections.has(section.id)
                  ? <ChevronDown size={16} className="text-muted-foreground" />
                  : <ChevronRight size={16} className="text-muted-foreground" />
                }
              </button>
              {expandedSections.has(section.id) && (
                <div className="border-t border-border bg-background">
                  {section.content.map((sub, i) => (
                    <div
                      key={sub.id}
                      id={sub.id}
                      className={`px-5 py-4 ${i > 0 ? 'border-t border-border/50' : ''}`}
                    >
                      <h3 className="text-[13px] font-bold text-foreground mb-2">{sub.title}</h3>
                      <div className="text-[12px] text-muted-foreground leading-relaxed whitespace-pre-line">
                        {search.trim()
                          ? highlightSearch(sub.body, search)
                          : sub.body
                        }
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {filteredSections.length === 0 && (
            <div className="text-center py-12">
              <Search size={32} className="mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum resultado para &quot;{search}&quot;</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function highlightSearch(text: string, query: string): React.ReactElement {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="bg-yellow-500/30 text-foreground rounded px-0.5">{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

export default function ManualPage() {
  return (
    <RouteGuard allowedRoles={['ADMIN', 'CONTADOR', 'ASSISTENTE', 'FINANCEIRO']}>
      <ManualContent />
    </RouteGuard>
  );
}
