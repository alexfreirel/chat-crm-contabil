import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
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
    cpf_cnpj?: string;
    tipo_pessoa?: string;
    notes?: string;
    priority?: string;
    tenant_id?: string;
  }) {
    // Prevent duplicate for same lead + service_type
    const existing = await this.prisma.clienteContabil.findFirst({
      where: { lead_id: data.lead_id, service_type: data.service_type, archived: false },
    });
    if (existing) {
      throw new BadRequestException('Já existe um cliente contábil ativo para este lead e tipo de serviço');
    }

    const [cliente] = await this.prisma.$transaction(async (tx) => {
      const c = await tx.clienteContabil.create({
        data: {
          lead_id: data.lead_id,
          conversation_id: data.conversation_id,
          accountant_id: data.accountant_id,
          service_type: data.service_type,
          regime_tributario: data.regime_tributario,
          cpf_cnpj: data.cpf_cnpj,
          tipo_pessoa: data.tipo_pessoa,
          notes: data.notes,
          priority: data.priority ?? 'NORMAL',
          tenant_id: data.tenant_id,
          stage: 'ONBOARDING',
        },
        include: {
          lead: { select: { id: true, name: true, phone: true } },
          accountant: { select: { id: true, name: true } },
        },
      });

      // Mark lead as client
      await tx.lead.update({
        where: { id: data.lead_id },
        data: { is_client: true, became_client_at: new Date() },
      });

      // Register creation event
      await tx.clienteEvento.create({
        data: {
          cliente_id: c.id,
          type: 'INICIO_SERVICO',
          title: `Início de serviço: ${this.getServiceLabel(data.service_type)}`,
          description: data.regime_tributario ? `Regime: ${data.regime_tributario.replace(/_/g, ' ')}` : undefined,
          event_date: new Date(),
        },
      });

      return [c];
    });

    return cliente;
  }

  async createFromLead(leadId: string, data: {
    service_type: string;
    conversation_id?: string;
    regime_tributario?: string;
    accountant_id?: string;
    tenant_id?: string;
  }) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, name: true, phone: true, tenant_id: true, cpf_cnpj: true },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado');

    return this.create({
      lead_id: leadId,
      conversation_id: data.conversation_id,
      accountant_id: data.accountant_id,
      service_type: data.service_type,
      regime_tributario: data.regime_tributario,
      cpf_cnpj: lead.cpf_cnpj ?? undefined,
      tenant_id: data.tenant_id ?? lead.tenant_id ?? undefined,
    });
  }

  async findAll(options: {
    tenantId?: string;
    stage?: string;
    archived?: boolean;
    accountantId?: string;
    leadId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const where: any = {};
    // Same pattern as leads.findAll: include records with null tenant_id when filtering by tenant
    if (options.tenantId) {
      where.OR = [{ tenant_id: options.tenantId }, { tenant_id: null }];
    }
    if (options.stage) where.stage = options.stage;
    if (options.archived !== undefined) where.archived = options.archived;
    else where.archived = false;
    if (options.accountantId) where.accountant_id = options.accountantId;
    if (options.leadId) where.lead_id = options.leadId;

    if (options.search) {
      where.lead = {
        OR: [
          { name: { contains: options.search, mode: 'insensitive' } },
          { phone: { contains: options.search } },
          { email: { contains: options.search, mode: 'insensitive' } },
        ],
      };
    }

    const include = {
      lead: {
        select: {
          id: true, name: true, phone: true, email: true, tags: true, cpf_cnpj: true,
          ficha_contabil: { select: { razao_social: true } },
        },
      },
      accountant: { select: { id: true, name: true } },
      _count: { select: { obrigacoes: true, documentos: true, tasks: true } },
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
        lead: { select: { id: true, name: true, phone: true, email: true, tags: true, cpf_cnpj: true } },
        accountant: { select: { id: true, name: true } },
        obrigacoes: { where: { completed: false }, orderBy: { due_at: 'asc' }, take: 10 },
        honorarios: { where: { ativo: true }, include: { parcelas: { orderBy: { due_date: 'asc' }, take: 3 } } },
        eventos: { orderBy: { created_at: 'desc' }, take: 20 },
        _count: { select: { documentos: true, obrigacoes: true, tasks: true } },
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

    const cliente = await this.prisma.clienteContabil.update({
      where: { id },
      data: { stage, stage_changed_at: new Date() },
    });

    await this.prisma.clienteEvento.create({
      data: {
        cliente_id: id,
        type: 'MUDANCA_REGIME',
        title: `Stage alterado para ${stage}`,
        event_date: new Date(),
      },
    });

    return cliente;
  }

  async updateDetails(id: string, data: {
    lead_id?: string;
    service_type?: string;
    regime_tributario?: string;
    competencia_inicio?: string;
    data_encerramento?: string;
    notes?: string;
    priority?: string;
    accountant_id?: string;
    cpf_cnpj?: string;
    tipo_pessoa?: string;
    cep?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    estado?: string;
    google_drive_folder_id?: string;
  }, tenantId?: string) {
    await this.verifyAccess(id, tenantId);
    return this.prisma.clienteContabil.update({
      where: { id },
      data: {
        ...data,
        competencia_inicio: data.competencia_inicio ? new Date(data.competencia_inicio) : undefined,
        data_encerramento: data.data_encerramento ? new Date(data.data_encerramento) : undefined,
      },
      include: {
        lead: { select: { id: true, name: true, phone: true } },
        accountant: { select: { id: true, name: true } },
      },
    });
  }

  async archive(id: string, reason: string, tenantId?: string) {
    await this.verifyAccess(id, tenantId);
    const cliente = await this.prisma.clienteContabil.update({
      where: { id },
      data: { archived: true, archive_reason: reason, stage: 'ENCERRADO', data_encerramento: new Date() },
    });
    await this.prisma.clienteEvento.create({
      data: {
        cliente_id: id,
        type: 'OUTRO',
        title: `Cliente encerrado`,
        description: reason,
        event_date: new Date(),
      },
    });
    return cliente;
  }

  async unarchive(id: string, tenantId?: string) {
    await this.verifyAccess(id, tenantId);
    return this.prisma.clienteContabil.update({
      where: { id },
      data: { archived: false, archive_reason: null, stage: 'ATIVO' },
    });
  }

  async remove(id: string, tenantId?: string) {
    await this.verifyAccess(id, tenantId);
    return this.prisma.clienteContabil.delete({ where: { id } });
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
      { value: 'CLIENTE_EFETIVO', label: 'Cliente Efetivo (BPO Fiscal + Contábil + DP + IRPJ)', pacote: true },
      { value: 'BPO_FISCAL',      label: 'BPO Fiscal' },
      { value: 'BPO_CONTABIL',    label: 'BPO Contábil' },
      { value: 'DP',              label: 'Departamento Pessoal' },
      { value: 'ABERTURA',        label: 'Abertura de Empresa' },
      { value: 'ENCERRAMENTO',    label: 'Encerramento de Empresa' },
      { value: 'IR_PF',           label: 'IRPF - Imposto de Renda PF' },
      { value: 'IR_PJ',           label: 'IRPJ - Imposto de Renda PJ' },
      { value: 'CONSULTORIA',     label: 'Consultoria Tributária' },
      { value: 'OUTRO',           label: 'Outro' },
    ];
  }

  private getServiceLabel(serviceType: string): string {
    const map: Record<string, string> = {
      CLIENTE_EFETIVO: 'Cliente Efetivo',
      BPO_FISCAL: 'BPO Fiscal', BPO_CONTABIL: 'BPO Contábil', DP: 'Dep. Pessoal',
      ABERTURA: 'Abertura de Empresa', ENCERRAMENTO: 'Encerramento',
      IR_PF: 'IRPF', IR_PJ: 'IRPJ', CONSULTORIA: 'Consultoria', OUTRO: 'Outro',
    };
    return map[serviceType] || serviceType;
  }

  private async verifyAccess(id: string, tenantId?: string) {
    if (!tenantId) return;
    const c = await this.prisma.clienteContabil.findUnique({ where: { id }, select: { tenant_id: true } });
    if (!c) throw new NotFoundException('Cliente contábil não encontrado');
    if (c.tenant_id && c.tenant_id !== tenantId) throw new ForbiddenException('Acesso negado');
  }
}
