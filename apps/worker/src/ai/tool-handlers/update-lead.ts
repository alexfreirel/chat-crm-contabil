import type { ToolHandler, ToolContext } from '../tool-executor';

/**
 * Atualiza dados do lead (nome, stage, tipo de serviço contábil, etc.).
 * Campos permitidos: name, stage, service_type, notes, lead_summary, next_step.
 */
export class UpdateLeadHandler implements ToolHandler {
  name = 'update_lead';

  async execute(
    params: {
      name?: string;
      stage?: string;
      service_type?: string;   // Tipo de serviço contábil (BPO_FISCAL, BPO_CONTABIL, DP, etc.)
      notes?: string;
      lead_summary?: string;
      next_step?: string;       // "duvidas" | "triagem_concluida" | "formulario" | "reuniao" | "encerrado"
    },
    context: ToolContext,
  ): Promise<any> {
    const leadUpdate: Record<string, any> = {};
    const convUpdate: Record<string, any> = {};

    if (params.name) leadUpdate.name = params.name;
    if (params.stage) {
      leadUpdate.stage = params.stage;
      leadUpdate.stage_entered_at = new Date();
    }

    if (params.service_type) convUpdate.service_type = params.service_type;
    if (params.lead_summary) convUpdate.ai_notes = params.lead_summary;
    if (params.next_step) convUpdate.next_step = params.next_step;

    if (Object.keys(leadUpdate).length) {
      await context.prisma.lead.update({
        where: { id: context.leadId },
        data: leadUpdate,
      });
    }

    if (Object.keys(convUpdate).length) {
      await context.prisma.conversation.update({
        where: { id: context.conversationId },
        data: convUpdate,
      });
    }

    return {
      success: true,
      updated: { ...leadUpdate, ...convUpdate },
    };
  }
}
