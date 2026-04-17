import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto, UpdateTransactionDto, CreateCategoryDto, UpdateCategoryDto } from './financeiro.dto';

const DEFAULT_CATEGORIES = [
  { type: 'RECEITA', name: 'Honorarios', icon: 'scale' },
  { type: 'RECEITA', name: 'Consultas', icon: 'stethoscope' },
  { type: 'RECEITA', name: 'Acordos Extrajudiciais', icon: 'handshake' },
  { type: 'DESPESA', name: 'Custas Judiciais', icon: 'gavel' },
  { type: 'DESPESA', name: 'Pericias', icon: 'clipboard-check' },
  { type: 'DESPESA', name: 'Deslocamento', icon: 'car' },
  { type: 'DESPESA', name: 'Material de Escritorio', icon: 'pencil' },
  { type: 'DESPESA', name: 'Cartorio', icon: 'stamp' },
  { type: 'DESPESA', name: 'Correios', icon: 'mail' },
  { type: 'DESPESA', name: 'Outros', icon: 'ellipsis' },
];

@Injectable()
export class FinanceiroService {
  private readonly logger = new Logger(FinanceiroService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Audit Log ──────────────────────────────────────────

  async logAction(userId: string | null, action: string, entityId: string, meta: Record<string, any>) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actor_user_id: userId,
          action,
          entity: 'FINANCEIRO',
          entity_id: entityId,
          meta_json: meta,
        },
      });
    } catch (e: any) {
      this.logger.warn(`[AUDIT] Falha ao registrar log: ${e.message}`);
    }
  }

  // ─── Helpers ────────────────────────────────────────────

  private async verifyTransactionAccess(id: string, tenantId?: string) {
    const record = await this.prisma.financialTransaction.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException('Transacao nao encontrada');
    if (tenantId && record.tenant_id && record.tenant_id !== tenantId) {
      throw new ForbiddenException('Acesso negado a este recurso');
    }
    return record;
  }

  private async verifyCategoryAccess(id: string, tenantId?: string) {
    const record = await this.prisma.financialCategory.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException('Categoria nao encontrada');
    if (tenantId && record.tenant_id && record.tenant_id !== tenantId) {
      throw new ForbiddenException('Acesso negado a este recurso');
    }
    return record;
  }

  // ─── Transactions CRUD ─────────────────────────────────

  async findAllTransactions(query: {
    tenantId?: string;
    type?: string;
    category?: string;
    status?: string;
    legalCaseId?: string;
    leadId?: string;
    lawyerId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {};

    if (query.tenantId) where.tenant_id = query.tenantId;
    if (query.type) where.type = query.type;
    if (query.category) where.category = query.category;
    if (query.status) {
      where.status = query.status;
    } else {
      // Por padrão, não mostrar CANCELADO
      where.status = { not: 'CANCELADO' };
    }
    if (query.legalCaseId) where.legal_case_id = query.legalCaseId;
    if (query.leadId) where.lead_id = query.leadId;
    if (query.lawyerId) {
      // Advogado vê: suas transações + despesas gerais visíveis (receitas só dele)
      if (query.type === 'RECEITA') {
        where.lawyer_id = query.lawyerId;
      } else {
        where.OR = [
          { lawyer_id: query.lawyerId },
          { lawyer_id: null, visible_to_lawyer: true },
        ];
      }
    }

    if (query.startDate || query.endDate) {
      const dateFilter: any = {};
      if (query.startDate) dateFilter.gte = new Date(query.startDate);
      if (query.endDate) dateFilter.lte = new Date(query.endDate);

      // Transações do período + vencidas de meses ANTERIORES (não do mesmo mês)
      const existingOr = where.OR || [];
      delete where.OR;
      where.AND = [
        ...(where.AND || []),
        ...(existingOr.length > 0 ? [{ OR: existingOr }] : []),
        { OR: [
          { date: dateFilter },
          // Dívidas de meses anteriores: date ANTES do período + still PENDENTE
          ...(query.startDate ? [{
            status: 'PENDENTE',
            date: { lt: new Date(query.startDate) },
          }] : []),
        ]},
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.financialTransaction.findMany({
        where,
        include: {
          lead: {
            select: { id: true, name: true, phone: true },
          },
          lawyer: {
            select: { id: true, name: true, email: true },
          },
        } as any,
        orderBy: { date: 'desc' },
        take: query.limit || 50,
        skip: query.offset || 0,
      }),
      this.prisma.financialTransaction.count({ where }),
    ]);

    // Enriquecer transações PENDENTE/ATRASADO de honorários com juros legais
    const enriched = await this.enrichWithInterest(data);

    return { data: enriched, total };
  }

  /**
   * Calcula juros legais (1% a.m. padrão) para transações de honorários vencidas.
   * Cálculo em tempo de leitura — não altera dados no banco.
   */
  private async enrichWithInterest(transactions: any[]) {
    const now = new Date();

    return Promise.all(
      transactions.map(async (tx) => {
        // Só calcular juros para receitas de honorário pendentes/vencidas com due_date
        if (
          tx.type !== 'RECEITA' ||
          tx.category !== 'HONORARIO' ||
          tx.status === 'PAGO' ||
          tx.status === 'CANCELADO' ||
          !tx.due_date ||
          !tx.honorario_payment_id
        ) {
          return { ...tx, interest_amount: 0, total_with_interest: Number(tx.amount) };
        }

        const dueDate = new Date(tx.due_date);
        if (dueDate >= now) {
          return { ...tx, interest_amount: 0, total_with_interest: Number(tx.amount) };
        }

        // Taxa de juros padrão: 1% ao mês (juros legais art. 406 CC)
        const monthlyRate = 1.0;

        // Calcular meses de atraso
        const msPerMonth = 30.44 * 24 * 60 * 60 * 1000;
        const monthsOverdue = Math.max(0, (now.getTime() - dueDate.getTime()) / msPerMonth);
        const amount = Number(tx.amount);
        const interestAmount = Math.round(amount * (monthlyRate / 100) * monthsOverdue * 100) / 100;

        return {
          ...tx,
          interest_amount: interestAmount,
          total_with_interest: Math.round((amount + interestAmount) * 100) / 100,
        };
      }),
    );
  }

  async createTransaction(data: CreateTransactionDto & { tenant_id?: string; actor_id?: string }) {
    const tx = await this.prisma.financialTransaction.create({
      data: {
        tenant_id: data.tenant_id,
        type: data.type,
        category: data.category,
        description: data.description,
        amount: data.amount,
        date: data.date ? new Date(data.date) : new Date(),
        due_date: data.due_date ? new Date(data.due_date) : null,
        paid_at: data.paid_at ? new Date(data.paid_at) : null,
        payment_method: data.payment_method,
        status: data.status || 'PENDENTE',
        lead_id: data.lead_id,
        lawyer_id: data.lawyer_id,
        reference_id: data.reference_id,
        notes: data.notes,
        visible_to_lawyer: data.visible_to_lawyer ?? true,
        is_recurring: data.is_recurring ?? false,
        recurrence_pattern: data.is_recurring ? data.recurrence_pattern : null,
        recurrence_day: data.is_recurring ? data.recurrence_day : null,
        recurrence_end_date: data.is_recurring && data.recurrence_end_date ? new Date(data.recurrence_end_date) : null,
      } as any,
      include: {
        lead: { select: { id: true, name: true } },
        lawyer: { select: { id: true, name: true } },
      },
    });

    const txAny = tx as any;
    const actionType = data.type === 'DESPESA' ? 'DESPESA_CRIADA' : 'RECEITA_CRIADA';
    await this.logAction(data.actor_id || null, actionType, tx.id, {
      tipo: data.type, categoria: data.category, descricao: data.description,
      valor: data.amount, status: data.status || 'PENDENTE',
      processo: txAny.legal_case?.case_number, cliente: txAny.lead?.name,
      lawyer_id: data.lawyer_id,
    });

    return tx;
  }

  async updateTransaction(id: string, data: UpdateTransactionDto, tenantId?: string, actorId?: string) {
    await this.verifyTransactionAccess(id, tenantId);

    const updateData: any = {};

    if (data.type !== undefined) updateData.type = data.type;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.date !== undefined) updateData.date = data.date ? new Date(data.date) : new Date();
    if (data.due_date !== undefined) updateData.due_date = data.due_date ? new Date(data.due_date) : null;
    if (data.paid_at !== undefined) updateData.paid_at = data.paid_at ? new Date(data.paid_at) : null;
    if (data.payment_method !== undefined) updateData.payment_method = data.payment_method;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.legal_case_id !== undefined) updateData.legal_case_id = data.legal_case_id;
    if (data.lead_id !== undefined) updateData.lead_id = data.lead_id;
    if (data.lawyer_id !== undefined) updateData.lawyer_id = data.lawyer_id;
    if (data.honorario_payment_id !== undefined) updateData.honorario_payment_id = data.honorario_payment_id;
    if (data.reference_id !== undefined) updateData.reference_id = data.reference_id;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const updated = await this.prisma.financialTransaction.update({
      where: { id },
      data: updateData,
      include: {
        lead: { select: { id: true, name: true } },
        lawyer: { select: { id: true, name: true } },
      },
    });

    // Determinar tipo de ação para log
    const isPago = data.status === 'PAGO';
    const isDespesa = updated.type === 'DESPESA';
    let actionType = isDespesa ? 'DESPESA_EDITADA' : 'RECEITA_EDITADA';
    if (isPago) actionType = isDespesa ? 'DESPESA_PAGA' : 'PAGAMENTO_RECEBIDO';
    await this.logAction(actorId || null, actionType, id, {
      campos: Object.keys(updateData), valor: updated.amount ? Number(updated.amount) : undefined,
      descricao: updated.description, status: updated.status,
      metodo: updated.payment_method, lawyer_id: updated.lawyer_id,
    });

    return updated;
  }

  /**
   * Recebimento parcial: cria transação PAGO com o valor recebido e reduz o original.
   */
  async partialPayment(id: string, amount: number, paymentMethod?: string, tenantId?: string, actorId?: string) {
    const original = await this.verifyTransactionAccess(id, tenantId);

    if (original.status === 'PAGO') {
      throw new ConflictException('Transação já está paga');
    }
    if (original.status === 'CANCELADO') {
      throw new ConflictException('Transação está cancelada');
    }

    const originalAmount = Number(original.amount);
    if (amount <= 0 || amount > originalAmount) {
      throw new ConflictException(`Valor deve ser entre R$ 0,01 e R$ ${originalAmount.toFixed(2)}`);
    }

    const remaining = Math.round((originalAmount - amount) * 100) / 100;

    // Criar transação do pagamento parcial recebido
    const partialTx = await this.prisma.financialTransaction.create({
      data: {
        tenant_id: original.tenant_id,
        type: original.type,
        category: original.category,
        description: `${original.description} (parcial)`,
        amount: amount,
        date: new Date(),
        due_date: original.due_date,
        paid_at: new Date(),
        payment_method: paymentMethod || original.payment_method,
        status: 'PAGO',
        lead_id: original.lead_id,
        lawyer_id: original.lawyer_id,
        notes: `Recebimento parcial de R$ ${amount.toFixed(2)}`,
      },
    });

    // Atualizar original: reduzir valor ou marcar como pago se zerou
    if (remaining <= 0) {
      await this.prisma.financialTransaction.update({
        where: { id },
        data: { status: 'PAGO', paid_at: new Date(), amount: 0 },
      });
    } else {
      await this.prisma.financialTransaction.update({
        where: { id },
        data: { amount: remaining },
      });
    }

    await this.logAction(actorId || null, 'PAGAMENTO_PARCIAL', id, {
      valor_recebido: amount, saldo_restante: remaining,
      metodo: paymentMethod, descricao: original.description,
      lawyer_id: original.lawyer_id,
    });

    return { partial: partialTx, remaining };
  }

  async deleteTransaction(id: string, tenantId?: string, actorId?: string) {
    const tx = await this.verifyTransactionAccess(id, tenantId);

    const actionType = tx.type === 'DESPESA' ? 'DESPESA_EXCLUIDA' : 'RECEITA_EXCLUIDA';
    await this.logAction(actorId || null, actionType, id, {
      descricao: tx.description, valor: Number(tx.amount),
      tipo: tx.type, categoria: tx.category, lawyer_id: tx.lawyer_id,
    });

    return this.prisma.financialTransaction.update({
      where: { id },
      data: { status: 'CANCELADO' },
    });
  }

  // ─── Create from Honorario Parcela ─────────────────────

  async createFromHonorarioParcela(parcelaId: string, tenantId?: string) {
    const parcela = await this.prisma.honorarioParcela.findUnique({
      where: { id: parcelaId },
      include: {
        honorario: {
          include: {
            cliente: {
              select: { id: true, tenant_id: true, lead_id: true },
            },
          },
        },
      },
    });

    if (!parcela) throw new NotFoundException('Parcela de honorário não encontrada');

    const honorario = parcela.honorario;
    const cliente = (honorario as any)?.cliente;
    const status = parcela.status === 'PAGO' ? 'PAGO' : 'PENDENTE';

    // Label do tipo de honorário contábil
    const tipoLabels: Record<string, string> = {
      MENSALIDADE: 'Mensalidade', SERVICO_AVULSO: 'Serviço Avulso', IMPLANTACAO: 'Implantação',
    };
    const tipoLabel = tipoLabels[(honorario as any)?.tipo] || (honorario as any)?.tipo || '';

    // Se já existe transação para esta parcela (via reference_id), atualizar status/valor
    const existing = await this.prisma.financialTransaction.findFirst({
      where: { reference_id: parcelaId },
    });
    if (existing) {
      return this.prisma.financialTransaction.update({
        where: { id: existing.id },
        data: {
          status,
          amount: parcela.amount,
          paid_at: parcela.paid_at,
          payment_method: parcela.payment_method || existing.payment_method,
          date: parcela.paid_at || existing.date,
        },
      });
    }

    return this.prisma.financialTransaction.create({
      data: {
        tenant_id: tenantId || cliente?.tenant_id || null,
        type: 'RECEITA',
        category: 'HONORARIO',
        description: `Honorário ${tipoLabel}`.trim(),
        amount: parcela.amount,
        date: parcela.paid_at || parcela.due_date || new Date(),
        paid_at: parcela.paid_at,
        due_date: parcela.due_date,
        payment_method: parcela.payment_method,
        status,
        lead_id: cliente?.lead_id || null,
        reference_id: parcelaId,
        notes: (parcela as any).notas || (honorario as any)?.notas || null,
      } as any,
    });
  }

  // ─── Audit Log ─────────────────────────────────────────

  async getAuditLog(lawyerId?: string, startDate?: string, endDate?: string, limit = 50, offset = 0) {
    const where: any = { entity: 'FINANCEIRO' };

    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at.gte = new Date(startDate);
      if (endDate) where.created_at.lte = new Date(endDate);
    }

    // Filtrar por advogado via meta_json (PostgreSQL JSONB)
    if (lawyerId) {
      where.meta_json = { path: ['lawyer_id'], equals: lawyerId };
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: { select: { id: true, name: true, email: true } },
        },
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total };
  }

  // ─── Summary & Analytics ───────────────────────────────

  async getSummary(tenantId?: string, startDate?: string, endDate?: string, lawyerId?: string) {
    const where: any = {};
    if (tenantId) where.tenant_id = tenantId;
    // Exclude cancelled from aggregation
    where.status = { not: 'CANCELADO' };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    // Filtro de parcelas de honorários contábeis
    const honorarioWhere: any = {
      status: { in: ['PENDENTE', 'ATRASADO'] },
    };
    if (tenantId) {
      honorarioWhere.honorario = { tenant_id: tenantId };
    }

    // Filtros específicos por tipo para advogado
    const receitaWhere = lawyerId ? { ...where, lawyer_id: lawyerId } : where;
    const despesaWhere = lawyerId
      ? { ...where, OR: [{ lawyer_id: lawyerId }, { lawyer_id: null, visible_to_lawyer: true }] }
      : where;

    const [totalRevenue, totalExpenses, totalPayable, totalReceivable, totalOverdue] = await Promise.all([
      // Receita efetiva (regime de caixa: só PAGO) — advogado só dele
      this.prisma.financialTransaction.aggregate({
        where: { ...receitaWhere, type: 'RECEITA', status: 'PAGO' },
        _sum: { amount: true },
      }),
      // Despesas pagas — advogado vê dele + gerais visíveis
      this.prisma.financialTransaction.aggregate({
        where: { ...despesaWhere, type: 'DESPESA', status: 'PAGO' },
        _sum: { amount: true },
      }),
      // Contas a pagar (despesas PENDENTE)
      this.prisma.financialTransaction.aggregate({
        where: { ...despesaWhere, type: 'DESPESA', status: 'PENDENTE' },
        _sum: { amount: true },
      }),
      // A receber: parcelas de honorários contábeis pendentes
      this.prisma.honorarioParcela.aggregate({
        where: { ...honorarioWhere, status: { in: ['PENDENTE', 'ATRASADO'] } },
        _sum: { amount: true },
      }),
      // Atrasado: parcelas com status ATRASADO
      this.prisma.honorarioParcela.aggregate({
        where: {
          ...honorarioWhere,
          status: 'ATRASADO',
        },
        _sum: { amount: true },
      }),
    ]);

    const revenue = Number(totalRevenue._sum.amount || 0);
    const expenses = Number(totalExpenses._sum.amount || 0);
    const payable = Number(totalPayable._sum.amount || 0);
    const receivable = Number(totalReceivable._sum.amount || 0);
    const overdue = Number(totalOverdue._sum.amount || 0);

    return {
      totalRevenue: revenue,
      totalExpenses: expenses,
      totalPayable: payable,
      totalReceivable: receivable,
      totalOverdue: overdue,
      balance: revenue - expenses,
    };
  }

  async getCashFlow(
    tenantId?: string,
    startDate?: string,
    endDate?: string,
    groupBy: 'day' | 'week' | 'month' = 'month',
  ) {
    const where: any = { status: { not: 'CANCELADO' } };
    if (tenantId) where.tenant_id = tenantId;

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const transactions = await this.prisma.financialTransaction.findMany({
      where,
      select: {
        type: true,
        amount: true,
        date: true,
        status: true,
      },
      orderBy: { date: 'asc' },
    });

    // Group by period
    const groupedMap = new Map<string, { entries: number; exits: number; balance: number }>();

    for (const tx of transactions) {
      const date = new Date(tx.date);
      let key: string;

      if (groupBy === 'day') {
        key = date.toISOString().slice(0, 10); // YYYY-MM-DD
      } else if (groupBy === 'week') {
        // ISO week start (Monday)
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const weekStart = new Date(date);
        weekStart.setDate(diff);
        key = weekStart.toISOString().slice(0, 10);
      } else {
        key = date.toISOString().slice(0, 7); // YYYY-MM
      }

      if (!groupedMap.has(key)) {
        groupedMap.set(key, { entries: 0, exits: 0, balance: 0 });
      }

      const group = groupedMap.get(key)!;
      const amount = Number(tx.amount);

      if (tx.type === 'RECEITA') {
        group.entries += amount;
      } else {
        group.exits += amount;
      }
      group.balance = group.entries - group.exits;
    }

    // Convert to array sorted by period
    const periods = Array.from(groupedMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, values]) => ({
        period,
        entries: Math.round(values.entries * 100) / 100,
        exits: Math.round(values.exits * 100) / 100,
        balance: Math.round(values.balance * 100) / 100,
      }));

    return { periods, groupBy };
  }

  // ─── Categories CRUD ───────────────────────────────────

  async findAllCategories(tenantId?: string) {
    const where: any = { active: true };
    if (tenantId) where.tenant_id = tenantId;

    return this.prisma.financialCategory.findMany({
      where,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(data: CreateCategoryDto, tenantId?: string) {
    return this.prisma.financialCategory.create({
      data: {
        tenant_id: tenantId,
        type: data.type,
        name: data.name,
        icon: data.icon,
      },
    });
  }

  async updateCategory(id: string, data: UpdateCategoryDto, tenantId?: string) {
    await this.verifyCategoryAccess(id, tenantId);

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.icon !== undefined) updateData.icon = data.icon;
    if (data.active !== undefined) updateData.active = data.active;

    return this.prisma.financialCategory.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteCategory(id: string, tenantId?: string) {
    await this.verifyCategoryAccess(id, tenantId);

    return this.prisma.financialCategory.delete({
      where: { id },
    });
  }

  async seedDefaultCategories(tenantId: string) {
    const existing = await this.prisma.financialCategory.count({
      where: { tenant_id: tenantId },
    });

    if (existing > 0) {
      this.logger.log(`Tenant ${tenantId} ja possui ${existing} categorias, pulando seed`);
      return;
    }

    this.logger.log(`Criando categorias padrao para tenant ${tenantId}`);

    await this.prisma.financialCategory.createMany({
      data: DEFAULT_CATEGORIES.map((cat) => ({
        tenant_id: tenantId,
        type: cat.type,
        name: cat.name,
        icon: cat.icon,
        is_default: true,
      })),
    });

    return this.findAllCategories(tenantId);
  }
}
