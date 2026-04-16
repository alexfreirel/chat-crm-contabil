import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HonorariosContabilService {
  private readonly logger = new Logger(HonorariosContabilService.name);

  constructor(private prisma: PrismaService) {}

  async findByCliente(clienteId: string, tenantId?: string) {
    await this.markOverdueByCliente(clienteId);
    return this.prisma.honorarioContabil.findMany({
      where: { cliente_id: clienteId },
      include: { parcelas: { orderBy: { due_date: 'asc' } } },
      orderBy: { created_at: 'desc' },
    });
  }

  async create(clienteId: string, data: {
    tipo: string;
    valor: number;
    dia_vencimento?: number;
    notas?: string;
  }, tenantId?: string) {
    return this.prisma.honorarioContabil.create({
      data: {
        cliente_id: clienteId,
        tenant_id: tenantId,
        tipo: data.tipo,
        valor: data.valor,
        dia_vencimento: data.dia_vencimento,
        notas: data.notas,
        ativo: true,
      },
    });
  }

  async update(id: string, data: { valor?: number; dia_vencimento?: number; notas?: string; ativo?: boolean }) {
    return this.prisma.honorarioContabil.update({ where: { id }, data });
  }

  async addParcela(honorarioId: string, data: {
    competencia?: string;
    amount: number;
    due_date: string;
    payment_method?: string;
    notas?: string;
  }) {
    return this.prisma.honorarioParcela.create({
      data: {
        honorario_id: honorarioId,
        competencia: data.competencia ? new Date(data.competencia) : undefined,
        amount: data.amount,
        due_date: new Date(data.due_date),
        payment_method: data.payment_method,
        notas: data.notas,
        status: new Date(data.due_date) < new Date() ? 'ATRASADO' : 'PENDENTE',
      },
    });
  }

  async markPaid(parcelaId: string, payment_method?: string) {
    return this.prisma.honorarioParcela.update({
      where: { id: parcelaId },
      data: { status: 'PAGO', paid_at: new Date(), payment_method },
    });
  }

  async deleteParcela(parcelaId: string) {
    return this.prisma.honorarioParcela.delete({ where: { id: parcelaId } });
  }

  async remove(id: string) {
    return this.prisma.honorarioContabil.delete({ where: { id } });
  }

  private async markOverdueByCliente(clienteId: string) {
    const honorarios = await this.prisma.honorarioContabil.findMany({
      where: { cliente_id: clienteId },
      select: { id: true },
    });
    const ids = honorarios.map(h => h.id);
    if (ids.length > 0) {
      await this.prisma.honorarioParcela.updateMany({
        where: {
          honorario_id: { in: ids },
          status: 'PENDENTE',
          due_date: { lt: new Date() },
        },
        data: { status: 'ATRASADO' },
      });
    }
  }
}
