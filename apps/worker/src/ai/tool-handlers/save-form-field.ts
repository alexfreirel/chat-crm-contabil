import type { ToolHandler, ToolContext } from '../tool-executor';

/**
 * Salva campo(s) da ficha contábil do cliente.
 * Usada pela IA durante a triagem para capturar dados da empresa.
 */
export class SaveFormFieldHandler implements ToolHandler {
  name = 'save_form_field';

  async execute(
    params: { fields: Record<string, string> },
    context: ToolContext,
  ): Promise<any> {
    const fields = params.fields || {};
    if (!Object.keys(fields).length) {
      return { success: false, message: 'Nenhum campo fornecido' };
    }

    // Campos principais da ficha contábil para cálculo do completion_pct
    const FICHA_FIELDS = [
      'razao_social', 'cnpj', 'regime_tributario', 'porte',
      'cnae_principal', 'cep', 'logradouro', 'numero', 'cidade', 'estado',
      'email_contabil', 'telefone_empresa',
      'banco', 'agencia', 'conta',
    ];

    // Busca ou cria a ficha contábil do lead
    const existing = await context.prisma.fichaContabil.findUnique({
      where: { lead_id: context.leadId },
    });

    // Mescla com dados existentes
    const oldData: Record<string, any> = existing ? { ...existing } : {};
    const merged = { ...oldData, ...fields };

    // Calcula completion_pct com base nos campos principais
    const filled = FICHA_FIELDS.filter(
      f => merged[f] != null && merged[f] !== '',
    ).length;
    const pct = Math.min(100, Math.round((filled / FICHA_FIELDS.length) * 100));

    if (existing) {
      await context.prisma.fichaContabil.update({
        where: { lead_id: context.leadId },
        data: {
          ...fields,
          completion_pct: pct,
          filled_by: 'ai',
          status: pct >= 80 ? 'em_andamento' : 'pendente',
        },
      });
    } else {
      await context.prisma.fichaContabil.create({
        data: {
          lead_id: context.leadId,
          ...fields,
          completion_pct: pct,
          filled_by: 'ai',
          status: 'pendente',
        },
      });
    }

    return {
      success: true,
      fields_saved: Object.keys(fields),
      completion_pct: pct,
    };
  }
}
