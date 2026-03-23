import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { SettingsService } from '../settings/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6':    { input: 15.00, output: 75.00 },
  'claude-sonnet-4-6':  { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5':   { input: 0.80,  output: 4.00  },
};

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class PetitionChatService {
  private readonly logger = new Logger(PetitionChatService.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Stream a Claude response for the petition chat interface via SSE.
   */
  async streamChat(
    params: {
      messages: ChatMessage[];
      skillId?: string;
      model?: string;
    },
    res: Response,
  ): Promise<void> {
    // 1. Get Anthropic API key
    const storedKey = await this.settings.get('ANTHROPIC_API_KEY');
    const apiKey = storedKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(400).json({
        message: 'Chave API da Anthropic não configurada. Configure em Ajustes > IA.',
      });
      return;
    }

    // 2. Build system prompt (load skill if provided)
    const systemPrompt = await this.buildSystemPrompt(params.skillId);

    // 3. Model selection (default: sonnet for cost/quality balance)
    const model = params.model || 'claude-sonnet-4-6';

    // 4. Set SSE headers for streaming
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // 5. Stream from Anthropic Claude
    const anthropic = new Anthropic({ apiKey });
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const stream = anthropic.messages.stream({
        model,
        max_tokens: 8096,
        system: systemPrompt,
        messages: params.messages,
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          const data = JSON.stringify({ type: 'text', text: event.delta.text });
          res.write(`data: ${data}\n\n`);
        }

        if (event.type === 'message_start' && event.message?.usage) {
          inputTokens = event.message.usage.input_tokens || 0;
        }

        if (event.type === 'message_delta' && (event as any).usage) {
          outputTokens = (event as any).usage.output_tokens || 0;
        }
      }

      // Signal completion
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);

      // Save usage asynchronously
      this.saveUsage(model, inputTokens, outputTokens).catch((e) =>
        this.logger.error('Erro ao salvar usage:', e),
      );
    } catch (err: any) {
      this.logger.error('Anthropic stream error:', err?.message);
      res.write(
        `data: ${JSON.stringify({ type: 'error', message: err?.message || 'Erro ao conectar com a IA' })}\n\n`,
      );
    } finally {
      res.end();
    }
  }

  /**
   * List all active skills available for petition chat.
   * Returns skills that can be used as system prompts.
   */
  async getAvailableSkills() {
    const skills = await this.prisma.promptSkill.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        description: true,
        skill_type: true,
        provider: true,
        trigger_keywords: true,
        assets: { select: { id: true } },
      },
      orderBy: { name: 'asc' },
    });

    return skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      skillType: s.skill_type,
      provider: s.provider,
      triggerKeywords: s.trigger_keywords,
      assetCount: s.assets?.length ?? 0,
    }));
  }

  // ─── Private Helpers ──────────────────────────────────────

  private async buildSystemPrompt(skillId?: string): Promise<string> {
    if (!skillId || skillId === 'default') {
      return this.getDefaultSystemPrompt();
    }

    const skill = await this.prisma.promptSkill.findUnique({
      where: { id: skillId },
      include: {
        assets: {
          where: {
            asset_type: 'reference',
            inject_mode: { not: 'none' },
          },
          select: {
            name: true,
            content_text: true,
            inject_mode: true,
          },
        },
      },
    });

    if (!skill) {
      return this.getDefaultSystemPrompt();
    }

    let prompt = skill.system_prompt;

    // Inject references
    const refs = skill.assets.filter((a) => a.content_text);
    if (refs.length > 0) {
      prompt +=
        '\n\n## Materiais de Referência:\n' +
        refs.map((a) => `\n### ${a.name}\n${a.content_text}`).join('\n');
    }

    return prompt;
  }

  private getDefaultSystemPrompt(): string {
    return `Você é um assistente jurídico especializado em direito brasileiro, auxiliando advogados na redação de petições, análise de casos e pesquisa jurídica.

## Suas capacidades:
- Redigir petições iniciais, recursos, contestações, réplicas, embargos e demais documentos processuais
- Analisar casos e identificar teses jurídicas aplicáveis
- Citar jurisprudência, legislação e doutrina relevante
- Calcular prazos processuais (CPC, CLT, etc.)
- Revisar documentos e sugerir melhorias
- Responder dúvidas sobre direito material e processual brasileiro

## Regras de formatação:
- Use linguagem jurídica formal e técnica
- Cite artigos de lei (CLT, CPC, CF/88, CC, CDC, etc.) quando aplicável
- Estruture petições com: Endereçamento, Qualificação das Partes, Dos Fatos, Do Direito, Dos Pedidos
- Use marcadores [ ] para indicar informações que precisam ser completadas pelo advogado
- Responda sempre em português brasileiro

## Sobre você:
Você tem acesso às skills configuradas no sistema e pode usar seus materiais de referência para fundamentar melhor as peças processuais.`;
  }

  private async saveUsage(
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    if (!inputTokens && !outputTokens) return;

    const priceEntry = Object.entries(ANTHROPIC_PRICING).find(([key]) =>
      model.startsWith(key),
    );
    const price = priceEntry ? priceEntry[1] : { input: 3.0, output: 15.0 };

    const costUsd =
      (inputTokens * price.input) / 1_000_000 +
      (outputTokens * price.output) / 1_000_000;

    await this.prisma.aiUsage.create({
      data: {
        conversation_id: null,
        skill_id: null,
        model,
        call_type: 'petition_chat',
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        cost_usd: costUsd,
      },
    });
  }
}
