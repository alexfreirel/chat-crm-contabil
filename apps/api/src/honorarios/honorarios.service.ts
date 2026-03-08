import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const HONORARIO_TYPES = ['FIXO', 'EXITO', 'MISTO'] as const;
const PAYMENT_STATUSES = ['PENDENTE', 'PAGO', 'ATRASADO'] as const;

@Injectable()
export class HonorariosService {
  private readonly logger = new Logger(HonorariosService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Helpers ────────────────────────────────────────────

  private async verifyCaseAccess(caseId: string, tenantId?: string) {
    const lc = await this.prisma.legalCase.findUnique({
      where: { id: caseId },
      select: { id: true, tenant_id: true },
    });
    if (!lc) throw new NotFoundException('Caso não encontrado');
    if (tenantId && lc.tenant_id && lc.tenant_id !== tenantId) {
      throw new ForbiddenException('Acesso negado a este recurso');
    }
    return lc;
  }

  private async verifyHonorarioAccess(honorarioId: string, tenantId?: string) {
    const h = await this.prisma.caseHonorario.findUnique({
      where: { id: honorarioId },
      select: { id: true, tenant_id: true, legal_case_id: true },
    });
    if (!h) throw new NotFoundException('Honorário não encontrado');
    if (tenantId && h.tenant_id && h.tenant_id !== tenantId) {
      throw new ForbiddenException('Acesso negado a este recurso');
    }
    return h;
  }

  /**
   * Atualiza parcelas vencidas para status ATRASADO em tempo de leitura.
   */
  private async markOverduePayments(honorarioIds: string[]) {
    if (honorarioIds.length === 0) return;
    await this.prisma.honorarioPayment.updateMany({
      where: {
        honorario_id: { in: honorarioIds },
        status: 'PENDENTE',
        due_date: { lt: new Date() },
      },
      data: { status: 'ATRASADO' },
    });
  }

  // ─── CRUD ──────────────────────────────────────────────

  async findByCaseId(caseId: string, tenantId?: string) {
    await this.verifyCaseAccess(caseId, tenantId);

    // Buscar IDs para atualizar status
    const honorarioIds = await this.prisma.caseHonorario.findMany({
      where: { legal_case_id: caseId },
      select: { id: true },
    });

    // Atualizar parcelas vencidas
    await this.markOverduePayments(honorarioIds.map(h => h.id));

    return this.prisma.caseHonorario.findMany({
      where: { legal_case_id: caseId },
      include: {
        payments: {
          orderBy: { due_date: 'asc' },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async create(
    caseId: string,
    data: {
      type: string;
      total_value: number;
      installment_count?: number;
      contract_date?: string;
      notes?: string;
    },
    tenantId?: string,
  ) {
    const lc = await this.verifyCaseAccess(caseId, tenantId);

    const installmentCount = data.installment_count || 1;
    const baseAmount = Math.floor((data.total_value * 100) / installmentCount) / 100;
    const lastAmount =
      Math.round((data.total_value - baseAmount * (installmentCount - 1)) * 100) / 100;

    const startDate = data.contract_date ? new Date(data.contract_date) : new Date();

    // Gerar parcelas automaticamente
    const payments: Array<{
      amount: number;
      due_date: Date;
      status: string;
    }> = [];

    for (let i = 0; i < installmentCount; i++) {
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + i);

      payments.push({
        amount: i === installmentCount - 1 ? lastAmount : baseAmount,
        due_date: dueDate,
        status: dueDate < new Date() ? 'ATRASADO' : 'PENDENTE',
      });
    }

    const honorario = await this.prisma.caseHonorario.create({
      data: {
        legal_case_id: caseId,
        tenant_id: lc.tenant_id,
        type: data.type,
        total_value: data.total_value,
        installment_count: installmentCount,
        contract_date: data.contract_date ? new Date(data.contract_date) : null,
        notes: data.notes,
        payments: {
          create: payments,
        },
      },
      include: {
        payments: {
          orderBy: { due_date: 'asc' },
        },
      },
    });

    this.logger.log(
      `Honorário criado: ${honorario.id} (${data.type}, R$ ${data.total_value}, ${installmentCount} parcelas)`,
    );

    return honorario;
  }

  async update(
    id: string,
    data: {
      type?: string;
      total_value?: number;
      notes?: string;
      contract_date?: string;
    },
    tenantId?: string,
  ) {
    await this.verifyHonorarioAccess(id, tenantId);

    return this.prisma.caseHonorario.update({
      where: { id },
      data: {
        ...(data.type && { type: data.type }),
        ...(data.total_value !== undefined && { total_value: data.total_value }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.contract_date !== undefined && {
          contract_date: data.contract_date ? new Date(data.contract_date) : null,
        }),
      },
      include: {
        payments: {
          orderBy: { due_date: 'asc' },
        },
      },
    });
  }

  async remove(id: string, tenantId?: string) {
    await this.verifyHonorarioAccess(id, tenantId);
    return this.prisma.caseHonorario.delete({ where: { id } });
  }

  // ─── Payments ──────────────────────────────────────────

  async addPayment(
    honorarioId: string,
    data: {
      amount: number;
      due_date: string;
      payment_method?: string;
      notes?: string;
    },
    tenantId?: string,
  ) {
    await this.verifyHonorarioAccess(honorarioId, tenantId);

    const dueDate = new Date(data.due_date);

    return this.prisma.honorarioPayment.create({
      data: {
        honorario_id: honorarioId,
        amount: data.amount,
        due_date: dueDate,
        payment_method: data.payment_method,
        notes: data.notes,
        status: dueDate < new Date() ? 'ATRASADO' : 'PENDENTE',
      },
    });
  }

  async markPaid(
    paymentId: string,
    data: { payment_method?: string },
    tenantId?: string,
  ) {
    const payment = await this.prisma.honorarioPayment.findUnique({
      where: { id: paymentId },
      include: { honorario: { select: { tenant_id: true } } },
    });
    if (!payment) throw new NotFoundException('Parcela não encontrada');
    if (tenantId && payment.honorario.tenant_id && payment.honorario.tenant_id !== tenantId) {
      throw new ForbiddenException('Acesso negado');
    }

    return this.prisma.honorarioPayment.update({
      where: { id: paymentId },
      data: {
        status: 'PAGO',
        paid_at: new Date(),
        ...(data.payment_method && { payment_method: data.payment_method }),
      },
    });
  }

  async deletePayment(paymentId: string, tenantId?: string) {
    const payment = await this.prisma.honorarioPayment.findUnique({
      where: { id: paymentId },
      include: { honorario: { select: { tenant_id: true } } },
    });
    if (!payment) throw new NotFoundException('Parcela não encontrada');
    if (tenantId && payment.honorario.tenant_id && payment.honorario.tenant_id !== tenantId) {
      throw new ForbiddenException('Acesso negado');
    }

    return this.prisma.honorarioPayment.delete({ where: { id: paymentId } });
  }
}
