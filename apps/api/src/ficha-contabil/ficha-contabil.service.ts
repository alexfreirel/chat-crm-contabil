import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
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
    try {
      // Verificar se o lead existe
      const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) {
        throw new NotFoundException(`Lead ${leadId} não encontrado`);
      }

      // Sanitizar campos numéricos
      const sanitized = { ...fields };

      if (sanitized.faturamento_mensal !== undefined) {
        const val = parseFloat(String(sanitized.faturamento_mensal).replace(/[^\d.,]/g, '').replace(',', '.'));
        sanitized.faturamento_mensal = isNaN(val) ? null : val;
      }
      if (sanitized.faturamento_anual !== undefined) {
        const val = parseFloat(String(sanitized.faturamento_anual).replace(/[^\d.,]/g, '').replace(',', '.'));
        sanitized.faturamento_anual = isNaN(val) ? null : val;
      }
      if (sanitized.qtd_funcionarios !== undefined) {
        const val = parseInt(String(sanitized.qtd_funcionarios), 10);
        sanitized.qtd_funcionarios = isNaN(val) ? null : val;
      }

      // Sanitizar datas — aceita formato ISO e dd/mm/aaaa
      const parseDate = (raw: string): Date | null => {
        if (!raw) return null;
        // converte dd/mm/aaaa → aaaa-mm-dd
        const brFormat = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        const iso = brFormat ? `${brFormat[3]}-${brFormat[2]}-${brFormat[1]}` : raw;
        const d = new Date(iso);
        return isNaN(d.getTime()) ? null : d;
      };

      if (sanitized.data_abertura !== undefined)
        sanitized.data_abertura = parseDate(sanitized.data_abertura);
      if (sanitized.data_transicao !== undefined)
        sanitized.data_transicao = parseDate(sanitized.data_transicao);
      if (sanitized.vencimento_certificado !== undefined)
        sanitized.vencimento_certificado = parseDate(sanitized.vencimento_certificado);

      const existing = await this.prisma.fichaContabil.findUnique({ where: { lead_id: leadId } });
      const merged = existing ? { ...(existing as any), ...sanitized } : sanitized;
      const completion_pct = calcCompletion(merged);

      // Reatribuir tarefas pendentes quando o responsável por setor muda
      const RESP_FIELDS = ['resp_fiscal', 'resp_pessoal', 'resp_contabil'] as const;
      if (existing) {
        const changes = RESP_FIELDS
          .filter(f => sanitized[f] && existing[f] && sanitized[f] !== existing[f])
          .map(f => ({ oldId: existing[f] as string, newId: sanitized[f] as string }));

        if (changes.length > 0) {
          const cliente = await this.prisma.clienteContabil.findFirst({
            where: { lead_id: leadId },
            select: { id: true },
          });
          if (cliente) {
            for (const { oldId, newId } of changes) {
              const updated = await this.prisma.calendarEvent.updateMany({
                where: {
                  cliente_contabil_id: cliente.id,
                  assigned_user_id: oldId,
                  status: { in: ['AGENDADO', 'CONFIRMADO'] },
                },
                data: { assigned_user_id: newId },
              });
              if (updated.count > 0) {
                this.logger.log(
                  `Reatribuídas ${updated.count} tarefas do cliente ${cliente.id}: ${oldId} → ${newId}`,
                );
              }
            }
          }
        }
      }

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
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Erro ao salvar FichaContabil para lead ${leadId}:`, error);
      throw new BadRequestException(error?.message ?? 'Erro ao salvar ficha contábil');
    }
  }

  async markFinalizado(leadId: string) {
    return this.prisma.fichaContabil.update({
      where: { lead_id: leadId },
      data: { finalizado: true, status: 'completo', completion_pct: 100 },
    });
  }
}
