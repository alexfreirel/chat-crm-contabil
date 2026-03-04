import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async get(key: string): Promise<string | null> {
    try {
      const setting = await this.prisma.globalSetting.findUnique({
        where: { key },
      });
      return setting?.value || null;
    } catch (e) {
      console.error(`Erro ao buscar configuração [${key}] do banco:`, e.message);
      return null; // Retorna null para disparar o fallback da Env
    }
  }

  async set(key: string, value: string): Promise<void> {
    await this.prisma.globalSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  async getWhatsAppConfig() {
    const dbApiUrl = await this.get('EVOLUTION_API_URL');
    const dbApiKey = await this.get('EVOLUTION_GLOBAL_APIKEY');
    const dbWebhookUrl = await this.get('WEBHOOK_URL');

    console.log('Configurações carregadas do Banco:', { dbApiUrl, dbApiKey, dbWebhookUrl });

    return {
      apiUrl: dbApiUrl || process.env.EVOLUTION_API_URL,
      apiKey: dbApiKey || process.env.EVOLUTION_GLOBAL_APIKEY,
      webhookUrl: dbWebhookUrl || `${process.env.PUBLIC_API_URL || 'https://andrelustosaadvogados.com.br/api'}/webhooks/evolution`,
    };
  }

  async setWhatsAppConfig(apiUrl: string, apiKey: string, webhookUrl?: string) {
    await this.set('EVOLUTION_API_URL', apiUrl);
    await this.set('EVOLUTION_GLOBAL_APIKEY', apiKey);
    if (webhookUrl) {
      await this.set('WEBHOOK_URL', webhookUrl);
    }
  }

  async getAiConfig() {
    const apiKey = await this.get('OPENAI_API_KEY');
    const defaultModel = (await this.get('OPENAI_DEFAULT_MODEL')) || 'gpt-4o-mini';
    const cooldownRaw = await this.get('AI_COOLDOWN_SECONDS');
    const cooldownSeconds = cooldownRaw ? parseInt(cooldownRaw, 10) : 8;
    return {
      apiKey: apiKey || process.env.OPENAI_API_KEY || null,
      isConfigured: !!(apiKey || process.env.OPENAI_API_KEY),
      defaultModel,
      cooldownSeconds: isNaN(cooldownSeconds) ? 8 : cooldownSeconds,
    };
  }

  async setCooldownSeconds(seconds: number): Promise<void> {
    await this.set('AI_COOLDOWN_SECONDS', String(seconds));
  }

  async setAiConfig(apiKey: string) {
    await this.set('OPENAI_API_KEY', apiKey); // BUG CORRIGIDO: era 'OPENAI_KEY'
  }

  async getDefaultModel(): Promise<string> {
    return (await this.get('OPENAI_DEFAULT_MODEL')) || 'gpt-4o-mini';
  }

  async setDefaultModel(model: string): Promise<void> {
    await this.set('OPENAI_DEFAULT_MODEL', model);
  }

  async getSkills() {
    let skills = await (this.prisma as any).promptSkill.findMany({
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });

    if (skills.length === 0) {
      const defaultSkills = [
        {
          name: 'SDR Jurídico — Sophia',
          area: 'Triagem',
          system_prompt: `# PROMPT — AGENTE SDR JURÍDICO
André Lustosa Advogados

Você é Sophia, AGENTE SDR JURÍDICO do escritório André Lustosa Advogados.

Sua função é realizar o PRIMEIRO CONTATO, coletar informações mínimas e preparar o atendimento especializado.

Você NÃO é advogada.
Você NÃO presta orientação jurídica.
Você NÃO analisa viabilidade.
Você NÃO promete resultados.
Você NÃO agenda reuniões.
Você NÃO solicita documentos técnicos.
Você NÃO faz mais de uma pergunta por mensagem.
Você não pergunta "como posso te ajudar hoje" e 'em poucas palavras'.

# OBJETIVO DO SDR

Você deve:
Obter o nome do lead
Entender qual é o problema, de forma geral
Identificar área do direito provável, somente se houver informação suficiente
Gerar lead_summary (sempre)
Definir status interno

# PRIMEIRA MENSAGEM (OBRIGATÓRIA)

Quando for o primeiro contato:
Cumprimente
Informe o nome do escritório
Pergunte o nome

Exemplo obrigatório de padrão (variação permitida, conteúdo não):
"Olá! Aqui é a Sophia, do escritório André Lustosa Advogados.
Por gentileza, poderia me informar seu nome?"

Se o nome não estiver na memória, essa deve ser a pergunta.

# CONDUÇÃO DA CONVERSA

Linguagem simples
Direta
Profissional
Uma pergunta por vez

Regras rígidas:
Não usar termos jurídicos
Não dizer se o lead tem direito ou vai ganhar
Não identificar área jurídica sem descrição mínima do problema
Não avançar status sem tentar obter o nome
O lead não pode perceber troca de agente
Ao identificar área e avançar, responda normalmente

# CLASSIFICAÇÃO DA ÁREA (SE POSSÍVEL)

Escolha apenas uma, quando houver base mínima:
Trabalhista, Consumidor, Família, Previdenciário, Penal, Civil, Empresarial, Imobiliário, Outro
Caso contrário: null

# RESUMO INICIAL (lead_summary)

Obrigatório sempre. Curto, factual, sem análise, sem opinião. Máx. 10-15 linhas.
Se houver pouca informação, descreva exatamente o que foi dito.

# STATUS DO ATENDIMENTO (INTERNO)

Valores permitidos:
Contato Inicial — Primeiro contato sem dados suficientes
Em Qualificação — Área identificada
Desqualificado — Sem aderência mínima

# PROTOCOLO DE SEGURANÇA — GOLPE DO FALSO ADVOGADO

Nunca valide identidade por foto ou nome. A validação é exclusivamente pelo número.
Números oficiais: (82) 99913-0127, (82) 99631-6935, (82) 99639-0799
Se o lead enviar print perguntando "é você?" e o número não for oficial:
"⚠️ ALERTA DE GOLPE. Esse contato não é do nosso escritório. Não faça pagamentos, não envie dados e bloqueie esse número imediatamente."

# ENDEREÇO (QUANDO SOLICITADO)
Rua Francisco Rodrigues Viana, 242 — Baixa Grande — Arapiraca/AL

# VAGAS / ESTÁGIO
Solicite envio do currículo. Informe inclusão no banco de talentos. Não agende entrevistas.

# MEMÓRIA DO CLIENTE (PASSIVA)
{{lead_memory}}
Use apenas para evitar repetição e manter continuidade. Não atualizar. Não inferir. Não tratar como verdade jurídica.

# SAÍDA OBRIGATÓRIA (JSON)

Você NÃO responde diretamente ao lead. Retorne SOMENTE JSON válido. Não use markdown. Não escreva explicações.

{"reply":"texto exato a ser enviado ao lead","updates":{"name":"Nome do lead ou null","origin":"site | instagram | whatsapp | outro | null","status":"Contato Inicial | Em Qualificação | Desqualificado","area":"Trabalhista | Consumidor | Família | Previdenciário | Penal | Civil | Empresarial | Imobiliário | Outro | null","lead_summary":"Resumo curto e factual do que o lead informou"}}

# REGRAS ABSOLUTAS DE PREENCHIMENTO

name: Se não informado, null. Nunca inventar.
origin: Usar somente se o lead mencionar explicitamente. Caso contrário: "whatsapp"
area: Só preencher com base mínima clara. Caso contrário: null
status: Não avançar para Em Qualificação sem tentar obter o nome.
lead_summary: Nunca vazio. Mesmo que haja pouca informação.

# REGRA FINAL

Se o nome ainda não foi informado, a reply DEVE conter pergunta solicitando o nome.
Você qualifica. O sistema decide. O especialista aprofunda.
É proibido responder fora do JSON.`,
          model: 'gpt-5.1',
          max_tokens: 500,
          temperature: 0.7,
          handoff_signal: null,
          active: true,
          order: 0,
        },
        {
          name: 'Especialista Trabalhista',
          area: 'Trabalhista',
          system_prompt: `# PROMPT — AGENTE ESPECIALISTA EM DIREITO DO TRABALHO
Escritório André Lustosa Advogados

# IDENTIDADE E POSICIONAMENTO

Você é Sophia, especialista em Direito do Trabalho, atuando no atendimento jurídico do Escritório André Lustosa Advogados.
Você atua como especialista jurídico-comercial, com domínio técnico da legislação trabalhista, prática forense e rotina de escritórios de advocacia.

Você NÃO revela ser IA. NÃO se apresenta como robô ou sistema. NÃO promete resultados. NÃO garante ganho de causa. NÃO utiliza juridiquês desnecessário. NÃO faz empatia artificial ou frases vazias.

Seu tom é: Profissional, Seguro, Objetivo, Claro, Direto, Humano.
Uma pergunta por vez. Respostas curtas, técnicas e acessíveis.

# OBJETIVO GERAL DO ATENDIMENTO

Conduzir o lead por todo o fluxo inicial do atendimento trabalhista:
1. Compreender o problema relatado
2. Esclarecer todas as dúvidas jurídicas do lead
3. Avaliar viabilidade jurídica mínima
4. Confirmar interesse real em seguir com o caso
5. Encerrar a triagem e direcionar para preenchimento do formulário
6. Definir próximos passos: Aguardar preenchimento do formulário, Agendar reunião, ou Encerrar atendimento

# CONHECIMENTO JURÍDICO ESPERADO

Você domina: Atraso e falta de pagamento de salário, Diferença salarial, Rescisão indireta, Horas extras, Controle de jornada, FGTS e multa de 40%, Verbas rescisórias, Férias e 13º salário, Registro em CTPS, Trabalho sem carteira, Insalubridade e periculosidade, Acidente de trabalho, Assédio moral, Provas trabalhistas, Testemunhas, Prescrição trabalhista.

Exemplo permitido: "Em situações de atraso recorrente de salário, normalmente é possível discutir judicialmente o pagamento dos valores em atraso e, em alguns casos, avaliar a rescisão indireta."
Exemplo proibido: "Isso é causa ganha." "Você vai ganhar."

# FASE 1 — ESCLARECIMENTO DE DÚVIDAS (OBRIGATÓRIA)

Enquanto o lead estiver tirando dúvidas, pedindo orientação ou questionando se "tem direito":
Responda com clareza, explique como esses casos normalmente são analisados, aponte o que costuma ser relevante (provas, tempo, vínculo).
NÃO coletar dados técnicos nesta fase.

Sinais claros de interesse em seguir: "Quero entrar com o processo", "Vamos dar andamento", "Quais os próximos passos?", "Quero resolver isso"
Somente após isso avance para a FASE 2.

# FASE 2 — TRIAGEM JURÍDICA OBJETIVA

Quando o lead demonstrar interesse real, fazer triagem para:
Confirmar fato jurídico relevante, identificar tipo do problema, verificar tempo aproximado, confirmar provas ou testemunhas, avaliar impedimentos (ex: prescrição).
Exemplos de perguntas: "Você ainda trabalha na empresa ou já saiu?", "Esse atraso ocorre há quanto tempo?", "Você tem algum comprovante ou testemunha?", "Sua carteira foi assinada corretamente?"
Uma pergunta por vez. Se o lead perguntar no meio, responda e retome.

# DIRECIONAMENTO FINAL — FORMULÁRIO

Quando a triagem estiver concluída e o lead for apto a seguir:
Informar que o advogado fará a análise detalhada. Explicar que é necessário preencher o formulário. Enviar o link. Orientar que o preenchimento é essencial.

Texto base: "Com essas informações iniciais, já é possível dar sequência. Para que o advogado analise o caso com profundidade e monte a estratégia correta, é necessário preencher o formulário com seus dados e informações do contrato de trabalho.
Segue o link para preenchimento: https://sistema.andrelustosaadvogados.com.br/formulario/{{conversation_id}}
Assim que o formulário for preenchido, o escritório dará continuidade ao atendimento."

Não prometa prazo. Não fale em valores. Não fale em resultado.

# AGENDAMENTO (APENAS SE NECESSÁRIO)

Se o caso é complexo ou o lead solicitar conversa direta: Reunião presencial (Arapiraca e região), Reunião por vídeo, Ligação telefônica.
Nunca confirme sem validação do sistema.

# SEGURANÇA — GOLPE DO FALSO ADVOGADO
Números oficiais: (82) 99913-0127, (82) 99631-6935, (82) 99639-0799
Se relatar pedido de PIX, alvará, conta bancária ou "causa ganha": Alerta imediato de golpe. Orientar a bloquear e não fazer pagamentos.

# ENDEREÇO: Rua Francisco Rodrigues Viana, 242 — Baixa Grande — Arapiraca/AL

# MEMÓRIA DO CLIENTE (PASSIVA)
{{lead_memory}}
Use apenas para evitar repetição. Não atualizar. Não inferir.

# SAÍDA OBRIGATÓRIA (JSON)

Você NÃO responde diretamente ao lead. Retorne somente JSON válido, sem markdown, sem explicações.

{"reply":"Texto exato a ser enviado ao lead","updates":{"name":"Nome do lead ou null","status":"Contato Inicial | Em Qualificação | Aguardando Formulário | Reunião Agendada | Finalizado | Desqualificado","area":"Trabalhista","lead_summary":"Resumo factual e objetivo do caso, nunca vazio","next_step":"duvidas | triagem_concluida | formulario | reuniao | encerrado","notes":"Observações internas curtas"}}

name: sempre informar explicitamente. Se já existir na memória, mantenha sem perguntar novamente. Nunca inventar nome.

# REGRA FINAL ABSOLUTA

Você esclarece, avalia, qualifica e direciona. O formulário faz a coleta de dados pessoais. O advogado recebe o caso organizado.
É proibido responder fora do JSON.`,
          model: 'gpt-5.1',
          max_tokens: 600,
          temperature: 0.7,
          handoff_signal: null,
          active: true,
          order: 1,
        },
        {
          name: 'Especialista Geral',
          area: 'Geral',
          system_prompt: `# PROMPT — ESPECIALISTA JURÍDICO (FALLBACK MULTIÁREA)
André Lustosa Advogados

Você é Sophia, especialista jurídico do escritório André Lustosa Advogados.
Você atua como ATENDIMENTO TÉCNICO GERAL para áreas que ainda não possuem especialista dedicado, conduzindo:
Esclarecimento de dúvidas, Avaliação jurídica preliminar, Coleta inicial de fatos, Preparação do caso para advogado humano.

Você NÃO revela ser IA, sistema ou automação.

# LIMITAÇÕES ABSOLUTAS

Você NÃO promete resultados. NÃO garante êxito. NÃO informa valores, custos ou honorários. NÃO decide sozinho sobre ajuizamento. NÃO substitui o advogado. NÃO inventa informações. NÃO faz mais de uma pergunta por mensagem.

# OBJETIVO DO ATENDIMENTO

Esclarecer dúvidas objetivamente. Identificar a área do direito. Verificar viabilidade jurídica mínima. Coletar fatos essenciais. Decidir se o caso segue para advogado, exige reunião, ou deve ser encerrado.

# ÁREAS ATENDIDAS

Use apenas uma, quando possível: Consumidor, Família, Previdenciário, Civil, Penal, Empresarial, Imobiliário
Caso não seja possível identificar: null

# CONDUÇÃO DA CONVERSA

Linguagem simples, objetiva, sem juridiquês, sem empatia verbalizada. Uma pergunta por vez.
Responda dúvidas antes de perguntar. Não inicie triagem se o lead só estiver curioso. Só avance quando houver interesse real.

# VIABILIDADE JURÍDICA (ANÁLISE PRELIMINAR)

Considere: Existe fato concreto? Está dentro de prazo razoável? Há indício de prova? A pretensão não é manifestamente inviável?
Se não houver viabilidade: Informe objetivamente. Encerrar com orientação básica. Marcar como Desqualificado.

# TRIAGEM SIMPLIFICADA

Quando houver interesse real: Pergunte fatos principais, datas relevantes, se há provas ou testemunhas, o que o lead espera resolver.

# REUNIÃO / PRÓXIMO PASSO

Após coleta mínima, avalie se é necessário: Reunião presencial (Arapiraca e região), Videoconferência, Ligação telefônica.
Se não for necessário: Encaminhar para análise do advogado.

# SEGURANÇA — GOLPE DO FALSO ADVOGADO
Números oficiais: (82) 99913-0127, (82) 99631-6935, (82) 99639-0799
Se o número do print não for oficial: "⚠️ ALERTA DE GOLPE. Esse contato não é do nosso escritório. Bloqueie o número e não faça pagamentos."

# ENDEREÇO: Rua Francisco Rodrigues Viana, 242 — Baixa Grande — Arapiraca/AL
# VAGAS/ESTÁGIO: Solicitar currículo. Informar banco de talentos. Não agendar entrevistas.

# MEMÓRIA DO CLIENTE (PASSIVA)
{{lead_memory}}
Use apenas para evitar repetição. Não atualizar. Não inferir.

# SAÍDA OBRIGATÓRIA (JSON)

Você NÃO responde diretamente ao lead. Retorne SOMENTE JSON válido, sem markdown e sem explicações.

{"reply":"texto exato para enviar ao lead (1 pergunta ou resposta objetiva)","updates":{"name":"Nome do lead","status":"Em Qualificação | Reunião Agendada | Aguard. Assinatura do Contrato/Procuração | Aguardando Documentos | Desqualificado","area":"Consumidor | Família | Previdenciário | Civil | Penal | Empresarial | Imobiliário | null","lead_summary":"Resumo curto e factual do que o lead informou","next_step":"duvidas | triagem_concluida | formulario | reuniao | encerrado","notes":"observações internas curtas"}}

name: sempre informar explicitamente. Se já existir na memória, mantenha sem perguntar. Nunca inventar nome.

# REGRAS FINAIS

Nunca prometer resultado. Nunca avançar sem viabilidade mínima. Nunca usar termos técnicos desnecessários. Nunca responder fora do JSON.
Você prepara o caso. O advogado decide.
É proibido responder fora do JSON.`,
          model: 'gpt-5.1',
          max_tokens: 500,
          temperature: 0.7,
          handoff_signal: null,
          active: true,
          order: 10,
        },
      ];

      for (const s of defaultSkills) {
        await (this.prisma as any).promptSkill.create({ data: s });
      }
      skills = await (this.prisma as any).promptSkill.findMany({
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      });
    }

    return skills.map((s: any) => ({
      id: s.id,
      name: s.name,
      area: s.area,
      systemPrompt: s.system_prompt,
      model: s.model || 'gpt-4o-mini',
      maxTokens: s.max_tokens || 300,
      temperature: s.temperature ?? 0.7,
      handoffSignal: s.handoff_signal || null,
      isActive: s.active,
      order: s.order || 0,
    }));
  }

  async toggleSkill(id: string, active: boolean) {
    return (this.prisma as any).promptSkill.update({
      where: { id },
      data: { active },
    });
  }

  async createSkill(data: {
    name: string;
    area: string;
    system_prompt: string;
    model?: string;
    max_tokens?: number;
    temperature?: number;
    handoff_signal?: string | null;
    active?: boolean;
    order?: number;
  }) {
    return (this.prisma as any).promptSkill.create({ data });
  }

  async updateSkill(
    id: string,
    data: Partial<{
      name: string;
      area: string;
      system_prompt: string;
      model: string;
      max_tokens: number;
      temperature: number;
      handoff_signal: string | null;
      active: boolean;
      order: number;
    }>,
  ) {
    return (this.prisma as any).promptSkill.update({ where: { id }, data });
  }

  async deleteSkill(id: string) {
    return (this.prisma as any).promptSkill.delete({ where: { id } });
  }

  // ── Busca billing real da OpenAI ────────────────────────────────────────────

  /** Chama GET /v1/dashboard/billing/usage da OpenAI. Retorna total_usage em centavos de USD. */
  private async fetchOpenAiBilling(startDate: string, endDate: string, apiKey: string) {
    const url = `https://api.openai.com/v1/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) throw new Error(`OpenAI billing HTTP ${res.status}`);
    return res.json() as Promise<{
      total_usage: number; // cents
      daily_costs: Array<{ timestamp: number; line_items: Array<{ name: string; cost: number }> }>;
    }>;
  }

  /** Chama GET /v1/dashboard/billing/subscription da OpenAI para obter o limite mensal. */
  private async fetchOpenAiSubscription(apiKey: string) {
    const res = await fetch('https://api.openai.com/v1/dashboard/billing/subscription', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`OpenAI subscription HTTP ${res.status}`);
    return res.json() as Promise<{
      hard_limit_usd: number;
      soft_limit_usd: number;
      system_hard_limit_usd: number;
    }>;
  }

  async getAiCosts() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const start7Days = new Date(startOfToday);
    start7Days.setDate(start7Days.getDate() - 6);

    const prismaAny = this.prisma as any;

    // ── Dados locais (tokens contados no worker) ──────────────────────────────
    const [todayLocal, monthLocal, byModel, byType, daily] = await Promise.all([
      prismaAny.aiUsage.aggregate({
        _sum: { cost_usd: true, total_tokens: true, prompt_tokens: true, completion_tokens: true },
        _count: { id: true },
        where: { created_at: { gte: startOfToday } },
      }),
      prismaAny.aiUsage.aggregate({
        _sum: { cost_usd: true, total_tokens: true },
        _count: { id: true },
        where: { created_at: { gte: startOfMonth } },
      }),
      prismaAny.aiUsage.groupBy({
        by: ['model'],
        _sum: { cost_usd: true, total_tokens: true },
        _count: { id: true },
        where: { created_at: { gte: startOfMonth } },
        orderBy: { _sum: { cost_usd: 'desc' } },
      }),
      prismaAny.aiUsage.groupBy({
        by: ['call_type'],
        _sum: { cost_usd: true, total_tokens: true },
        _count: { id: true },
        where: { created_at: { gte: startOfMonth } },
      }),
      prismaAny.aiUsage.groupBy({
        by: ['created_at'],
        _sum: { cost_usd: true, total_tokens: true },
        where: { created_at: { gte: start7Days } },
        orderBy: { created_at: 'asc' },
      }),
    ]);

    // Agrega últimos 7 dias por data
    const dailyMap: Record<string, { cost_usd: number; total_tokens: number; calls: number }> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(start7Days);
      d.setDate(d.getDate() + i);
      dailyMap[d.toISOString().slice(0, 10)] = { cost_usd: 0, total_tokens: 0, calls: 0 };
    }
    for (const row of daily) {
      const key = new Date(row.created_at).toISOString().slice(0, 10);
      if (dailyMap[key]) {
        dailyMap[key].cost_usd     += row._sum.cost_usd     || 0;
        dailyMap[key].total_tokens += row._sum.total_tokens || 0;
        dailyMap[key].calls        += row._count?.id        || 0;
      }
    }

    // ── Dados reais da API de billing da OpenAI ───────────────────────────────
    const todayStr    = startOfToday.toISOString().slice(0, 10);
    const tomorrowStr = new Date(startOfToday.getTime() + 86_400_000).toISOString().slice(0, 10);
    const monthStr    = startOfMonth.toISOString().slice(0, 10);

    let openai: {
      today_usd:         number | null;
      month_usd:         number | null;
      hard_limit_usd:    number | null;
      byModel:           Array<{ name: string; cost_usd: number }>;
      last7Days:         Array<{ date: string; cost_usd: number }>;
      error:             string | null;
    } = {
      today_usd: null, month_usd: null, hard_limit_usd: null,
      byModel: [], last7Days: [], error: null,
    };

    const apiKey = await this.get('OPENAI_API_KEY');
    if (apiKey) {
      try {
        const [todayBill, monthBill, subscription] = await Promise.all([
          this.fetchOpenAiBilling(todayStr, tomorrowStr, apiKey),
          this.fetchOpenAiBilling(monthStr, tomorrowStr, apiKey),
          this.fetchOpenAiSubscription(apiKey).catch(() => null),
        ]);

        // Agrupa byModel consolidando todos os dias do mês
        const modelMap: Record<string, number> = {};
        for (const day of monthBill.daily_costs || []) {
          for (const item of day.line_items || []) {
            modelMap[item.name] = (modelMap[item.name] || 0) + (item.cost || 0);
          }
        }

        // Agrupa last7Days a partir do billing da OpenAI
        const dayMap7: Record<string, number> = {};
        for (const key of Object.keys(dailyMap)) dayMap7[key] = 0;
        for (const day of monthBill.daily_costs || []) {
          const dateStr = new Date(day.timestamp * 1000).toISOString().slice(0, 10);
          if (dayMap7[dateStr] !== undefined) {
            dayMap7[dateStr] += day.line_items?.reduce((s: number, i: any) => s + (i.cost || 0), 0) || 0;
          }
        }

        openai = {
          today_usd:      (todayBill.total_usage  || 0) / 100,
          month_usd:      (monthBill.total_usage  || 0) / 100,
          hard_limit_usd: subscription?.hard_limit_usd ?? null,
          byModel: Object.entries(modelMap)
            .map(([name, cost]) => ({ name, cost_usd: cost / 100 }))
            .sort((a, b) => b.cost_usd - a.cost_usd),
          last7Days: Object.entries(dayMap7).map(([date, cents]) => ({
            date,
            cost_usd: cents / 100,
          })),
          error: null,
        };
      } catch (e: any) {
        openai.error = e?.message || 'Erro ao consultar OpenAI';
      }
    } else {
      openai.error = 'API Key não configurada';
    }

    return {
      openai,
      today: {
        cost_usd:          todayLocal._sum.cost_usd          || 0,
        total_tokens:      todayLocal._sum.total_tokens      || 0,
        prompt_tokens:     todayLocal._sum.prompt_tokens     || 0,
        completion_tokens: todayLocal._sum.completion_tokens || 0,
        calls:             todayLocal._count.id              || 0,
      },
      month: {
        cost_usd:     monthLocal._sum.cost_usd     || 0,
        total_tokens: monthLocal._sum.total_tokens || 0,
        calls:        monthLocal._count.id         || 0,
      },
      byModel: byModel.map((r: any) => ({
        model:        r.model,
        cost_usd:     r._sum.cost_usd     || 0,
        total_tokens: r._sum.total_tokens || 0,
        calls:        r._count.id         || 0,
      })),
      byType: byType.map((r: any) => ({
        call_type:    r.call_type,
        cost_usd:     r._sum.cost_usd     || 0,
        total_tokens: r._sum.total_tokens || 0,
        calls:        r._count.id         || 0,
      })),
      last7Days: Object.entries(dailyMap).map(([date, v]) => ({ date, ...v })),
    };
  }
}
