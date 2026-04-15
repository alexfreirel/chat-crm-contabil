import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClientesContabilService {
  private readonly logger = new Logger(ClientesContabilService.name);

  constructor(private prisma: PrismaService) {}

  async create(data: {
    lead_id: string;
    conversation_id?: string;
    accountant_id?: string;
    service_type: string;
    regime_tributario?: string;
    tenant_id?: string;
  }) {
    return this.prisma.clienteContabil.create({
      data: {
        lead_id: data.lead_id,
        conversation_id: data.conversation_id,
        accountant_id: data.accountant_id,
        service_type: data.service_type,
        regime_tributario: data.regime_tributario,
        tenant_id: data.tenant_id,
        stage: 'ONBOARDING',
      },
      include: {
        lead: { select: { id: true, name: true, phone: true } },
        accountant: { select: { id: true, name: true } },
      },
    });
  }

  async findAll(options: {
    tenantId?: string;
    stage?: string;
    archived?: boolean;
    accountantId?: string;
    leadId?: string;
    page?: number;
    limit?: number;
  }) {
    const where: any = {};
    if (options.tenantId) where.tenant_id = options.tenantId;
    if (options.stage) where.stage = options.stage;
    if (options.archived !== undefined) where.archived = options.archived;
    else where.archived = false;
    if (options.accountantId) where.accountant_id = options.accountantId;
    if (options.leadId) where.lead_id = options.leadId;

    const include = {
      lead: { select: { id: true, name: true, phone: true, email: true, tags: true } },
      accountant: { select: { id: true, name: true } },
      _count: { select: { obrigacoes: true, documentos: true } },
    };

    if (options.page && options.limit) {
      const [data, total] = await this.prisma.$transaction([
        this.prisma.clienteContabil.findMany({
          where, include,
          orderBy: { created_at: 'desc' },
          skip: (options.page - 1) * options.limit,
          take: options.limit,
        }),
        this.prisma.clienteContabil.count({ where }),
      ]);
      return { data, total, page: options.page, limit: options.limit };
    }

    return this.prisma.clienteContabil.findMany({
      where, include, orderBy: { created_at: 'desc' },
    });
  }

  async findOne(id: string, tenantId?: string) {
    const cliente = await this.prisma.clienteContabil.findUnique({
      where: { id },
      include: {
        lead: { select: { id: true, name: true, phone: true, email: true, tags: true } },
        accountant: { select: { id: true, name: true } },
        obrigacoes: { where: { completed: false }, orderBy: { due_at: 'asc' }, take: 10 },
        honorarios: { where: { ativo: true }, include: { parcelas: { orderBy: { due_date: 'asc' }, take: 3 } } },
        eventos: { orderBy: { created_at: 'desc' }, take: 20 },
        _count: { select: { documentos: true, obrigacoes: true } },
      },
    });
    if (!cliente) throw new NotFoundException('Cliente contábil não encontrado');
    if (tenantId && cliente.tenant_id && cliente.tenant_id !== tenantId) {
      throw new ForbiddenException('Acesso negado');
    }
    return cliente;
  }

  async getWorkspaceData(id: string, tenantId?: string) {
    const cliente = await this.prisma.clienteContabil.findUnique({
      where: { id },
      include: {
        lead: {
          include: {
            ficha_contabil: true,
            memory: true,
          },
        },
        accountant: { select: { id: true, name: true, email: true } },
        obrigacoes: { orderBy: { due_at: 'asc' } },
        honorarios: { include: { parcelas: { orderBy: { due_date: 'desc' } } } },
        documentos: { orderBy: { created_at: 'desc' } },
        eventos: { orderBy: { created_at: 'desc' } },
        tasks: { where: { status: { not: 'CONCLUIDA' } }, orderBy: { due_at: 'asc' }, take: 10 },
        calendar_events: {
          where: { start_at: { gte: new Date() } },
          orderBy: { start_at: 'asc' },
          take: 5,
        },
      },
    });
    if (!cliente) throw new NotFoundException('Cliente contábil não encontrado');
    if (tenantId && cliente.tenant_id && cliente.tenant_id !== tenantId) {
      throw new ForbiddenException('Acesso negado');
    }
    return cliente;
  }

  async updateStage(id: string, stage: string, tenantId?: string) {
    await this.verifyAccess(id, tenantId);
    return this.prisma.clienteContabil.update({
      where: { id },
      data: { stage, stage_changed_at: new Date() },
    });
  }

  async updateDetails(id: string, data: {
    service_type?: string;
    regime_tributario?: string;
    competencia_inicio?: string;
    notes?: string;
    priority?: string;
    accountant_id?: string;
  }, tenantId?: string) {
    await this.verifyAccess(id, tenantId);
    return this.prisma.clienteContabil.update({
      where: { id },
      data: {
        ...data,
        competencia_inicio: data.competencia_inicio ? new Date(data.competencia_inicio) : undefined,
      },
    });
  }

  async archive(id: string, reason: string, tenantId?: string) {
    await this.verifyAccess(id, tenantId);
    return this.prisma.clienteContabil.update({
      where: { id },
      data: { archived: true, archive_reason: reason, stage: 'ENCERRADO' },
    });
  }

  async unarchive(id: string, tenantId?: string) {
    await this.verifyAccess(id, tenantId);
    return this.prisma.clienteContabil.update({
      where: { id },
      data: { archived: false, archive_reason: null, stage: 'ATIVO' },
    });
  }

  async addEvent(clienteId: string, data: { type: string; title: string; description?: string; event_date?: string }, tenantId?: string) {
    await this.verifyAccess(clienteId, tenantId);
    return this.prisma.clienteEvento.create({
      data: {
        cliente_id: clienteId,
        type: data.type,
        title: data.title,
        description: data.description,
        event_date: data.event_date ? new Date(data.event_date) : undefined,
      },
    });
  }

  async findEvents(clienteId: string, tenantId?: string) {
    await this.verifyAccess(clienteId, tenantId);
    return this.prisma.clienteEvento.findMany({
      where: { cliente_id: clienteId },
      orderBy: { created_at: 'desc' },
    });
  }

  getStages() {
    return [
      { value: 'ONBOARDING', label: 'Onboarding', color: '#3b82f6' },
      { value: 'ATIVO', label: 'Ativo', color: '#22c55e' },
      { value: 'SUSPENSO', label: 'Suspenso', color: '#eab308' },
      { value: 'ENCERRADO', label: 'Encerrado', color: '#6b7280' },
    ];
  }

  getServiceTypes() {
    return [
      { value: 'BPO_FISCAL', label: 'BPO Fiscal' },
      { value: 'BPO_CONTABIL', label: 'BPO Contábil' },
      { value: 'DP', label: 'Departamento Pessoal' },
      { value: 'ABERTURA', label: 'Abertura de Empresa' },
      { value: 'ENCERRAMENTO', label: 'Encerramento de Empresa' },
      { value: 'IR_PF', label: 'IRPF - Imposto de Renda PF' },
      { value: 'IR_PJ', label: 'IRPJ - Imposto de Renda PJ' },
      { value: 'CONSULTORIA', label: 'Consultoria Tributária' },
      { value: 'OUTRO', label: 'Outro' },
    ];
  }

  private async verifyAccess(id: string, tenantId?: string) {
    if (!tenantId) return;
    const c = await this.prisma.clienteContabil.findUnique({ where: { id }, select: { tenant_id: true } });
    if (!c) throw new NotFoundException('Cliente contábil não encontrado');
    if (c.tenant_id && c.tenant_id !== tenantId) throw new ForbiddenException('Acesso negado');
  }
}
