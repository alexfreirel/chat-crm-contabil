import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Campos da ficha contábil para cálculo do completion_pct
const FICHA_FIELDS = [
  'razao_social', 'cnpj', 'regime_tributario', 'porte',
  'cnae_principal', 'cep', 'logradouro', 'numero', 'cidade', 'estado',
  'email_contabil', 'telefone_empresa',
  'banco', 'agencia', 'conta',
];

function calcCompletion(data: Record<string, any>): number {
  const filled = FICHA_FIELDS.filter(f => data[f] != null && data[f] !== '').length;
  return Math.round((filled / FICHA_FIELDS.length) * 100);
}

@Injectable()
export class FichaContabilService {
  private readonly logger = new Logger(FichaContabilService.name);

  constructor(private prisma: PrismaService) {}

  async findByLeadId(leadId: string) {
    return this.prisma.fichaContabil.findUnique({ where: { lead_id: leadId } });
  }

  async upsert(leadId: string, fields: Record<string, any>, filledBy = 'manual') {
    const existing = await this.prisma.fichaContabil.findUnique({ where: { lead_id: leadId } });
    const merged = existing ? { ...(existing as any), ...fields } : fields;
    const completion_pct = calcCompletion(merged);

    if (existing) {
      return this.prisma.fichaContabil.update({
        where: { lead_id: leadId },
        data: { ...fields, completion_pct, filled_by: filledBy },
      });
    }

    return this.prisma.fichaContabil.create({
      data: {
        lead_id: leadId,
        ...fields,
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
