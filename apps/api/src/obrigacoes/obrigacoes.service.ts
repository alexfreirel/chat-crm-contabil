import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';

// Mapa de obrigações por regime
const OBRIGACOES_POR_REGIME: Record<string, Array<{
  tipo: string; titulo: string; frequencia: string; alert_days: number;
  diaVencimento?: number; // dia do mês de vencimento (aproximado)
}>> = {
  MEI: [
    { tipo: 'DAS_MENSAL', titulo: 'DAS-MEI Mensal', frequencia: 'MENSAL', alert_days: 5, diaVencimento: 20 },
    { tipo: 'DASN',       titulo: 'DASN-SIMEI Anual', frequencia: 'ANUAL', alert_days: 15, diaVencimento: 31 },
  ],
  SIMPLES_NACIONAL: [
    { tipo: 'DAS_MENSAL', titulo: 'DAS Simples Nacional', frequencia: 'MENSAL', alert_days: 5, diaVencimento: 20 },
    { tipo: 'PGDAS',      titulo: 'PGDAS-D (apuração)', frequencia: 'MENSAL', alert_days: 5, diaVencimento: 20 },
    { tipo: 'DEFIS',      titulo: 'DEFIS Anual', frequencia: 'ANUAL', alert_days: 15, diaVencimento: 31 },
  ],
  LUCRO_PRESUMIDO: [
    { tipo: 'DCTF',       titulo: 'DCTF Mensal', frequencia: 'MENSAL', alert_days: 5, diaVencimento: 15 },
    { tipo: 'EFD_CONTRIB',titulo: 'EFD-Contribuições (PIS/COFINS)', frequencia: 'MENSAL', alert_days: 7, diaVencimento: 10 },
    { tipo: 'ECF',        titulo: 'ECF Anual', frequencia: 'ANUAL', alert_days: 30, diaVencimento: 31 },
    { tipo: 'ECD',        titulo: 'ECD (SPED Contábil)', frequencia: 'ANUAL', alert_days: 30, diaVencimento: 31 },
  ],
  LUCRO_REAL: [
    { tipo: 'DCTF',       titulo: 'DCTF Mensal', frequencia: 'MENSAL', alert_days: 5, diaVencimento: 15 },
    { tipo: 'SPED_FISCAL',titulo: 'SPED Fiscal (EFD-ICMS/IPI)', frequencia: 'MENSAL', alert_days: 7, diaVencimento: 15 },
    { tipo: 'EFD_CONTRIB',titulo: 'EFD-Contribuições (PIS/COFINS)', frequencia: 'MENSAL', alert_days: 7, diaVencimento: 10 },
    { tipo: 'ECF',        titulo: 'ECF Anual', frequencia: 'ANUAL', alert_days: 30, diaVencimento: 31 },
    { tipo: 'ECD',        titulo: 'ECD (SPED Contábil)', frequencia: 'ANUAL', alert_days: 30, diaVencimento: 31 },
  ],
};

// Obrigações adicionais para empresas com funcionários (qualquer regime)
const OBRIGACOES_FUNCIONARIOS = [
  { tipo: 'FOLHA',   titulo: 'Folha de Pagamento', frequencia: 'MENSAL', alert_days: 3, diaVencimento: 5 },
  { tipo: 'FGTS',    titulo: 'FGTS / GFIP', frequencia: 'MENSAL', alert_days: 5, diaVencimento: 7 },
  { tipo: 'eSocial', titulo: 'eSocial', frequencia: 'MENSAL', alert_days: 5, diaVencimento: 7 },
  { tipo: 'RAIS',    titulo: 'RAIS Anual', frequencia: 'ANUAL', alert_days: 15, diaVencimento: 28 },
];

function buildDueDate(diaVencimento: number, competencia: Date, frequencia: string): Date {
  const d = new Date(competencia);
  if (frequencia === 'ANUAL') {
    // Vence no ano seguinte à competência
    d.setFullYear(d.getFullYear() + 1);
  } else {
    // Vence no mês seguinte à competência
    d.setMonth(d.getMonth() + 1);
  }
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(diaVencimento, lastDay));
  return d;
}

@Injectable()
export class ObrigacoesService {
  private readonly logger = new Logger(ObrigacoesService.name);

  constructor(
    private prisma: PrismaService,
    private tasksService: TasksService,
  ) {}

  async findByCliente(clienteId: string, tenantId?: string) {
    await this.verifyClienteAccess(clienteId, tenantId);
    await this.markOverdue(clienteId);
    return this.prisma.obrigacaoFiscal.findMany({
      where: { cliente_id: clienteId },
      orderBy: { due_at: 'asc' },
      include: { responsavel: { select: { id: true, name: true } } },
    });
  }

  async findVencendo(tenantId: string, dias = 7) {
    const limite = new Date();
    limite.setDate(limite.getDate() + dias);
    // Incluir vencidas (due_at no passado, não concluídas)
    return this.prisma.obrigacaoFiscal.findMany({
      where: {
        tenant_id: tenantId,
        completed: false,
        due_at: { lte: limite },
      },
      orderBy: { due_at: 'asc' },
      include: {
        cliente: { include: { lead: { select: { name: true, phone: true } } } },
        responsavel: { select: { id: true, name: true } },
      },
    });
  }

  async findCalendario(tenantId: string, ano: number, mes: number) {
    // Retorna todas as obrigações (pendentes e concluídas) do mês
    const inicio = new Date(ano, mes - 1, 1);
    const fim    = new Date(ano, mes, 0, 23, 59, 59);
    return this.prisma.obrigacaoFiscal.findMany({
      where: {
        tenant_id: tenantId,
        due_at: { gte: inicio, lte: fim },
      },
      orderBy: { due_at: 'asc' },
      include: {
        cliente: { include: { lead: { select: { name: true, phone: true } } } },
        responsavel: { select: { id: true, name: true } },
      },
    });
  }

  async create(clienteId: string, data: {
    tipo: string;
    titulo: string;
    competencia?: string;
    due_at: string;
    recorrente?: boolean;
    frequencia?: string;
    alert_days?: number;
    responsavel_id?: string;
  }, tenantId?: string, userId?: string) {
    await this.verifyClienteAccess(clienteId, tenantId);
    const obrigacao = await this.prisma.obrigacaoFiscal.create({
      data: {
        cliente_id: clienteId,
        tenant_id: tenantId,
        tipo: data.tipo,
        titulo: data.titulo,
        competencia: data.competencia ? new Date(data.competencia) : undefined,
        due_at: new Date(data.due_at),
        recorrente: data.recorrente ?? false,
        frequencia: data.frequencia,
        alert_days: data.alert_days ?? 3,
        responsavel_id: data.responsavel_id,
      },
    });

    await this.tasksService.create({
      title: data.titulo,
      description: `Obrigação fiscal: ${data.tipo}`,
      cliente_contabil_id: clienteId,
      due_at: obrigacao.due_at,
      tenant_id: tenantId,
      assigned_user_id: data.responsavel_id,
      created_by_id: userId,
    }).catch(e => this.logger.warn(`Erro ao criar task para obrigação: ${e.message}`));

    return obrigacao;
  }

  /**
   * Gera obrigações padrão para um cliente com base no regime tributário.
   * Retorna a lista de obrigações criadas.
   */
  async generateByRegime(
    clienteId: string,
    regime: string,
    temFuncionarios: boolean,
    competenciaInicio: string, // 'YYYY-MM' ou 'YYYY-MM-DD'
    tenantId?: string,
    userId?: string,
  ) {
    await this.verifyClienteAccess(clienteId, tenantId);

    const regimeKey = regime.toUpperCase().replace(' ', '_');
    const templates = [...(OBRIGACOES_POR_REGIME[regimeKey] ?? [])];
    if (temFuncionarios) templates.push(...OBRIGACOES_FUNCIONARIOS);

    if (templates.length === 0) {
      return { criadas: 0, obrigacoes: [] };
    }

    // Verificar obrigações já existentes para evitar duplicatas
    const existing = await this.prisma.obrigacaoFiscal.findMany({
      where: { cliente_id: clienteId },
      select: { tipo: true },
    });
    const existingTypes = new Set(existing.map(e => e.tipo));

    const competencia = new Date(competenciaInicio.length === 7
      ? competenciaInicio + '-01'
      : competenciaInicio,
    );

    const toCreate = templates
      .filter(t => !existingTypes.has(t.tipo))
      .map(t => ({
        cliente_id: clienteId,
        tenant_id: tenantId,
        tipo: t.tipo,
        titulo: t.titulo,
        competencia: competencia,
        due_at: buildDueDate(t.diaVencimento ?? 20, competencia, t.frequencia),
        recorrente: true,
        frequencia: t.frequencia,
        alert_days: t.alert_days,
      }));

    if (toCreate.length === 0) {
      return { criadas: 0, obrigacoes: [] };
    }

    await this.prisma.obrigacaoFiscal.createMany({ data: toCreate });

    // Retornar obrigações criadas
    const created = await this.prisma.obrigacaoFiscal.findMany({
      where: { cliente_id: clienteId, tipo: { in: toCreate.map(t => t.tipo) } },
      orderBy: { due_at: 'asc' },
    });

    this.logger.log(`Geradas ${created.length} obrigações para cliente ${clienteId} (regime: ${regime})`);

    // Criar uma task para cada obrigação gerada
    for (const ob of created) {
      await this.tasksService.create({
        title: ob.titulo,
        description: `Obrigação fiscal: ${ob.tipo}`,
        cliente_contabil_id: clienteId,
        due_at: ob.due_at,
        tenant_id: tenantId,
        created_by_id: userId,
      }).catch(e => this.logger.warn(`Erro ao criar task para obrigação ${ob.tipo}: ${e.message}`));
    }

    return { criadas: created.length, obrigacoes: created };
  }

  /**
   * Sincroniza obrigações fiscais de um mês como CalendarEvents.
   * Cria um CalendarEvent para cada ObrigacaoFiscal que ainda não tem calendar_event_id.
   */
  async syncToCalendar(tenantId: string, userId: string, ano: number, mes: number) {
    const inicio = new Date(ano, mes - 1, 1);
    const fim    = new Date(ano, mes, 0, 23, 59, 59);

    const obrigacoes = await this.prisma.obrigacaoFiscal.findMany({
      where: {
        tenant_id: tenantId,
        due_at: { gte: inicio, lte: fim },
        calendar_event_id: null,
      },
      include: { cliente: { include: { lead: { select: { name: true } } } } },
    });

    let criados = 0;
    for (const ob of obrigacoes) {
      const event = await this.prisma.calendarEvent.create({
        data: {
          tenant_id: tenantId,
          type: 'OBRIGACAO',
          title: `${ob.titulo}${ob.cliente?.lead?.name ? ` — ${ob.cliente.lead.name}` : ''}`,
          description: `Tipo: ${ob.tipo}`,
          start_at: ob.due_at,
          end_at: ob.due_at,
          status: ob.completed ? 'CONCLUIDO' : 'AGENDADO',
          priority: 'NORMAL',
          cliente_contabil_id: ob.cliente_id,
          created_by_id: userId,
        },
      });
      await this.prisma.obrigacaoFiscal.update({
        where: { id: ob.id },
        data: { calendar_event_id: event.id },
      });
      criados++;
    }

    this.logger.log(`syncToCalendar: ${criados} CalendarEvents criados para ${ano}-${mes}`);
    return { sincronizados: criados, total: obrigacoes.length };
  }

  /**
   * Retorna obrigações vencendo nos próximos X dias para alerta (lista para WhatsApp manual).
   */
  async sendAlertaVencimento(tenantId: string, dias = 3) {
    const limite = new Date();
    limite.setDate(limite.getDate() + dias);
    const vencendo = await this.prisma.obrigacaoFiscal.findMany({
      where: {
        tenant_id: tenantId,
        completed: false,
        due_at: { gte: new Date(), lte: limite },
      },
      orderBy: { due_at: 'asc' },
      include: {
        cliente: { include: { lead: { select: { name: true, phone: true } } } },
        responsavel: { select: { id: true, name: true } },
      },
    });

    const mensagens = vencendo.map(ob => ({
      id: ob.id,
      titulo: ob.titulo,
      tipo: ob.tipo,
      due_at: ob.due_at,
      cliente_nome: ob.cliente?.lead?.name ?? 'Cliente',
      cliente_phone: ob.cliente?.lead?.phone ?? null,
      responsavel: ob.responsavel?.name ?? null,
      mensagem: `⚠️ *Obrigação próxima do vencimento*\n\n📋 *${ob.titulo}*\n👤 Cliente: ${ob.cliente?.lead?.name ?? 'N/A'}\n📅 Vencimento: ${ob.due_at.toLocaleDateString('pt-BR')}\n\nFavor verificar e concluir no sistema.`,
    }));

    return { total: mensagens.length, alertas: mensagens };
  }

  async complete(id: string, tenantId?: string) {
    return this.prisma.obrigacaoFiscal.update({
      where: { id },
      data: { completed: true, completed_at: new Date() },
    });
  }

  async uncomplete(id: string) {
    return this.prisma.obrigacaoFiscal.update({
      where: { id },
      data: { completed: false, completed_at: null },
    });
  }

  async remove(id: string, tenantId?: string) {
    return this.prisma.obrigacaoFiscal.delete({ where: { id } });
  }

  getTipos() {
    return [
      { value: 'DAS_MENSAL',  label: 'DAS Mensal (MEI/Simples)' },
      { value: 'PGDAS',       label: 'PGDAS-D (apuração Simples)' },
      { value: 'SPED_FISCAL', label: 'SPED Fiscal (EFD-ICMS/IPI)' },
      { value: 'EFD_CONTRIB', label: 'EFD-Contribuições (PIS/COFINS)' },
      { value: 'ECF',         label: 'ECF (Escrit. Contábil Fiscal)' },
      { value: 'ECD',         label: 'ECD (SPED Contábil)' },
      { value: 'DCTF',        label: 'DCTF Mensal' },
      { value: 'DEFIS',       label: 'DEFIS (Simples Anual)' },
      { value: 'DASN',        label: 'DASN-SIMEI (MEI Anual)' },
      { value: 'DIRF',        label: 'DIRF Anual' },
      { value: 'RAIS',        label: 'RAIS Anual' },
      { value: 'eSocial',     label: 'eSocial' },
      { value: 'FGTS',        label: 'FGTS / GFIP' },
      { value: 'FOLHA',       label: 'Folha de Pagamento' },
      { value: 'IRPF',        label: 'IRPF (Pessoa Física)' },
      { value: 'NOTA_FISCAL', label: 'Nota Fiscal' },
      { value: 'CERTIDAO',    label: 'Certidão / Regularização' },
      { value: 'OUTRO',       label: 'Outro' },
    ];
  }

  private async markOverdue(clienteId: string) {
    // Apenas registra no log — status de "vencida" é calculado no frontend via due_at
    const count = await this.prisma.obrigacaoFiscal.count({
      where: { cliente_id: clienteId, completed: false, due_at: { lt: new Date() } },
    });
    if (count > 0) {
      this.logger.debug(`Cliente ${clienteId}: ${count} obrigações vencidas`);
    }
  }

  private async verifyClienteAccess(clienteId: string, tenantId?: string) {
    if (!tenantId) return;
    const c = await this.prisma.clienteContabil.findUnique({
      where: { id: clienteId },
      select: { tenant_id: true },
    });
    if (!c) throw new NotFoundException('Cliente contábil não encontrado');
    if (c.tenant_id && c.tenant_id !== tenantId) throw new ForbiddenException('Acesso negado');
  }
}
