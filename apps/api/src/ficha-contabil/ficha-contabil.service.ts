import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Campos ponderados para cálculo do completion_pct
// Cada campo vale 1 ponto; sócios preenchidos valem 1 ponto extra
const FICHA_FIELDS = [
  'razao_social', 'cnpj', 'regime_tributario', 'porte',
  'cnae_principal', 'cep', 'logradouro', 'numero', 'cidade', 'estado',
  'email_contabil', 'telefone_empresa',
  'banco', 'agencia', 'conta',
  'faturamento_mensal',
];

function calcCompletion(data: Record<string, any>): number {
  let filled = FICHA_FIELDS.filter(f => {
    const v = data[f];
    return v != null && v !== '' && v !== 0;
  }).length;
  // Bônus: sócios preenchidos
  if (Array.isArray(data.socios) && data.socios.length > 0) filled += 1;
  const total = FICHA_FIELDS.length + 1; // +1 por sócios
  return Math.round((filled / total) * 100);
}

@Injectable()
export class FichaContabilService {
  private readonly logger = new Logger(FichaContabilService.name);

  constructor(private prisma: PrismaService) {}

  async findByLeadId(leadId: string) {
    return this.prisma.fichaContabil.findUnique({ where: { lead_id: leadId } });
  }

  async upsert(leadId: string, fields: Record<string, any>, filledBy = 'manual') {
    // Sanitizar campos numéricos
    const sanitized = { ...fields };
    if (sanitized.faturamento_mensal !== undefined) {
      sanitized.faturamento_mensal = sanitized.faturamento_mensal
        ? parseFloat(String(sanitized.faturamento_mensal).replace(/[^\d.,]/g, '').replace(',', '.'))
        : null;
    }
    if (sanitized.faturamento_anual !== undefined) {
      sanitized.faturamento_anual = sanitized.faturamento_anual
        ? parseFloat(String(sanitized.faturamento_anual).replace(/[^\d.,]/g, '').replace(',', '.'))
        : null;
    }
    if (sanitized.qtd_funcionarios !== undefined) {
      sanitized.qtd_funcionarios = sanitized.qtd_funcionarios
        ? parseInt(String(sanitized.qtd_funcionarios), 10)
        : null;
    }
    if (sanitized.data_abertura !== undefined && sanitized.data_abertura) {
      sanitized.data_abertura = new Date(sanitized.data_abertura);
    }
    if (sanitized.data_transicao !== undefined && sanitized.data_transicao) {
      sanitized.data_transicao = new Date(sanitized.data_transicao);
    }
    if (sanitized.vencimento_certificado !== undefined && sanitized.vencimento_certificado) {
      sanitized.vencimento_certificado = new Date(sanitized.vencimento_certificado);
    }

    const existing = await this.prisma.fichaContabil.findUnique({ where: { lead_id: leadId } });
    const merged = existing ? { ...(existing as any), ...sanitized } : sanitized;
    const completion_pct = calcCompletion(merged);

    if (existing) {
      return this.prisma.fichaContabil.update({
        where: { lead_id: leadId },
        data: { ...sanitized, completion_pct, filled_by: filledBy },
      });
    }

    return this.prisma.fichaContabil.create({
      data: {
        lead_id: leadId,
        ...sanitized,
        completion_pct,
        filled_by: filledBy,
        status: 'em_andamento',
      },
    });
  }

  async markFinalizado(leadId: string) {
    return this.prisma.fichaContabil.update({
      where: { lead_id: leadId },
      data: { finalizado: true, status: 'completo', completion_pct: 100 },
    });
  }
}
