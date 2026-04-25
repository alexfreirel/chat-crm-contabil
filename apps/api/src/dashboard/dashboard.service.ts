import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  private tenantWhere(tenantId?: string) {
    return tenantId
      ? { OR: [{ tenant_id: tenantId }, { tenant_id: null }] }
      : {};
  }

  async aggregate(userId: string, roles: string | string[], tenantId?: string) {
    const roleArr = Array.isArray(roles) ? roles : (roles ? [roles] : []);
    const isAdmin = roleArr.includes('ADMIN');
    const tw = this.tenantWhere(tenantId);
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // ─── Resolve user inbox IDs (for non-admin conversation counting) ──
    let userInboxIds: string[] = [];
    if (!isAdmin) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { inboxes: { select: { id: true } } },
      });
      userInboxIds = (user?.inboxes || []).map((i) => i.id);
    }

    // ─── Build conversation where clause ──
    const convWhere = isAdmin
      ? { status: { not: 'FECHADO' }, ...tw }
      : {
          status: { not: 'FECHADO' },
          ...(userInboxIds.length > 0
            ? { inbox_id: { in: userInboxIds } }
            : { assigned_user_id: userId }),
        };

    const pendingTransferWhere = isAdmin
      ? { pending_transfer_to_id: { not: null }, status: { not: 'FECHADO' }, ...tw }
      : { pending_transfer_to_id: userId, status: { not: 'FECHADO' } };

    // ─── Task filters (CalendarEvent type=TAREFA) ──
    const calTaskWhere = (statuses: string[]) =>
      isAdmin
        ? { type: 'TAREFA', status: { in: statuses }, ...tw }
        : { type: 'TAREFA', status: { in: statuses }, assigned_user_id: userId, ...tw };

    // ─── Event filters ──
    const eventWhere = {
      start_at: { gte: now, lte: sevenDaysFromNow },
      status: { notIn: ['CANCELADO', 'CONCLUIDO'] },
      ...(isAdmin ? {} : { assigned_user_id: userId }),
      ...tw,
    };

    // ─── Run all queries in parallel ──
    const [
      userName,
      openConvCount,
      pendingTransferCount,
      leadPipelineRaw,
      clientesContabilRaw,
      _unused,
      upcomingEvents,
      tasksPending,
      tasksInProgress,
      tasksOverdue,
      totalContracted,
      totalCollected,
      totalReceivable,
      totalOverdue,
      overdueCount,
      obrigacoesFiscaisRaw,
      teamUsers,
      closedToday,
      closedThisWeek,
      closedThisMonth,
    ] = await Promise.all([
      // 1. User name
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      }),
      // 2. Open conversations
      this.prisma.conversation.count({ where: convWhere }),
      // 3. Pending transfers
      this.prisma.conversation.count({ where: pendingTransferWhere }),
      // 4. Lead pipeline — exclui PERDIDO e FINALIZADO (não estão no funil ativo)
      this.prisma.lead.groupBy({
        by: ['stage'],
        _count: true,
        where: { ...tw, stage: { notIn: ['PERDIDO', 'FINALIZADO'] } },
      }),
      // 5. Clientes contábeis por stage
      this.prisma.clienteContabil.groupBy({
        by: ['stage'],
        _count: true,
        where: tw,
      }),
      // 6. (removed — sem tracking separado)
      Promise.resolve([]),
      // 7. Upcoming events
      this.prisma.calendarEvent.findMany({
        where: eventWhere,
        select: {
          id: true,
          type: true,
          title: true,
          start_at: true,
          end_at: true,
          status: true,
          priority: true,
          lead: { select: { name: true } },
          cliente_contabil_id: true,
        },
        orderBy: { start_at: 'asc' },
        take: 20,
      }),
      // 8. Tasks pending (CalendarEvent TAREFA com status AGENDADO)
      this.prisma.calendarEvent.count({ where: calTaskWhere(['AGENDADO']) }),
      // 9. Tasks in progress (CalendarEvent TAREFA com status CONFIRMADO)
      this.prisma.calendarEvent.count({ where: calTaskWhere(['CONFIRMADO']) }),
      // 10. Tasks overdue (TAREFA pendente com start_at no passado)
      this.prisma.calendarEvent.count({
        where: {
          ...calTaskWhere(['AGENDADO', 'CONFIRMADO']),
          start_at: { lt: now },
        },
      }),
      // 11. Total contratado (honoráriosContabil ativos)
      this.prisma.honorarioContabil.aggregate({
        _sum: { valor: true },
        where: { ativo: true, ...(isAdmin ? {} : { cliente: { accountant_id: userId } }) },
      }),
      // 12. Total recebido (parcelas PAGO)
      this.prisma.honorarioParcela.aggregate({
        _sum: { amount: true },
        where: { status: 'PAGO' },
      }),
      // 13. Total a receber (parcelas PENDENTE)
      this.prisma.honorarioParcela.aggregate({
        _sum: { amount: true },
        where: { status: 'PENDENTE' },
      }),
      // 14. Total em atraso (PENDENTE + due_date < now)
      this.prisma.honorarioParcela.aggregate({
        _sum: { amount: true },
        where: { status: 'PENDENTE', due_date: { lt: now } },
      }),
      // 15. Contagem de parcelas em atraso
      this.prisma.honorarioParcela.count({
        where: { status: 'PENDENTE', due_date: { lt: now } },
      }),
      // 16. Obrigações fiscais próximas (7 dias)
      this.prisma.obrigacaoFiscal.findMany({
        where: {
          completed: false,
          due_at: { gte: now, lte: new Date(now.getTime() + 7 * 86400000) },
        },
        select: {
          id: true,
          titulo: true,
          tipo: true,
          due_at: true,
          cliente: { select: { id: true, lead: { select: { name: true } } } },
        },
        orderBy: { due_at: 'asc' },
        take: 10,
      }),
      // 17. Team users (ADMIN only)
      isAdmin
        ? this.prisma.user.findMany({
            where: tw,
            select: { id: true, name: true, role: true },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([]),
      // 18. Conversas encerradas hoje
      this.prisma.conversation.count({
        where: { status: 'FECHADO', last_message_at: { gte: startOfToday }, ...tw },
      }),
      // 19. Conversas encerradas esta semana
      this.prisma.conversation.count({
        where: { status: 'FECHADO', last_message_at: { gte: startOfWeek }, ...tw },
      }),
      // 20. Conversas encerradas este mês
      this.prisma.conversation.count({
        where: { status: 'FECHADO', last_message_at: { gte: startOfMonth }, ...tw },
      }),
    ]);

    // ─── Build team metrics (ADMIN only) ──
    let teamMetrics: any[] = [];
    if (isAdmin && teamUsers.length > 0) {
      teamMetrics = await Promise.all(
        teamUsers.map(async (member: any) => {
          const [
            openConversations,
            activeCases,
            pendingTasks,
            overdueTasks,
            memberCollected,
            memberReceivable,
          ] = await Promise.all([
            this.prisma.conversation.count({
              where: {
                assigned_user_id: member.id,
                status: { not: 'FECHADO' },
              },
            }),
            this.prisma.clienteContabil.count({
              where: { accountant_id: member.id, archived: false, ...tw },
            }),
            this.prisma.calendarEvent.count({
              where: {
                type: 'TAREFA',
                assigned_user_id: member.id,
                status: { in: ['AGENDADO', 'CONFIRMADO'] },
              },
            }),
            this.prisma.calendarEvent.count({
              where: {
                type: 'TAREFA',
                assigned_user_id: member.id,
                status: { in: ['AGENDADO', 'CONFIRMADO'] },
                start_at: { lt: now },
              },
            }),
            Promise.resolve({ _sum: { amount: null } }),
            Promise.resolve({ _sum: { amount: null } }),
          ]);

          return {
            userId: member.id,
            name: member.name,
            role: member.role ?? 'OPERADOR',
            openConversations,
            activeCases,
            pendingTasks,
            overdueTasks,
            totalCollected: Number(memberCollected._sum.amount || 0),
            totalReceivable: Number(memberReceivable._sum.amount || 0),
          };
        }),
      );
    }

    // ─── Assemble response ──
    const clientesContabilTotal = (clientesContabilRaw as any[]).reduce((s: number, g: any) => s + g._count, 0);

    return {
      user: {
        id: userId,
        name: userName?.name || 'Usuário',
        roles: roleArr,
      },
      conversations: {
        open: openConvCount,
        pendingTransfers: pendingTransferCount,
      },
      leadPipeline: (leadPipelineRaw as any[]).map((g: any) => ({
        stage: g.stage || 'INICIAL',
        count: g._count,
      })),
      clientesContabil: {
        total: clientesContabilTotal,
        byStage: (clientesContabilRaw as any[]).map((g: any) => ({
          stage: g.stage,
          count: g._count,
        })),
      },
      upcomingEvents: (upcomingEvents as any[]).map((e: any) => ({
        id: e.id,
        type: e.type,
        title: e.title,
        start_at: e.start_at.toISOString(),
        end_at: e.end_at?.toISOString() || null,
        status: e.status,
        priority: e.priority,
        lead_name: e.lead?.name || null,
        cliente_contabil_id: e.cliente_contabil_id,
      })),
      tasks: {
        pending: tasksPending,
        inProgress: tasksInProgress,
        overdue: tasksOverdue,
      },
      financials: {
        totalContracted: Number((totalContracted as any)._sum.valor || 0),
        totalCollected: Number(totalCollected._sum.amount || 0),
        totalReceivable: Number(totalReceivable._sum.amount || 0),
        totalOverdue: Number(totalOverdue._sum.amount || 0),
        overdueCount,
      },
      obrigacoesFiscais: (obrigacoesFiscaisRaw as any[]).map((o: any) => ({
        id: o.id,
        titulo: o.titulo,
        tipo: o.tipo,
        due_at: o.due_at,
        lead_name: o.cliente?.lead?.name || null,
        cliente_contabil_id: o.cliente?.id || null,
      })),
      teamMetrics,
      inboxStats: {
        closedToday,
        closedThisWeek,
        closedThisMonth,
      },
    };
  }

  async aggregateContabil(tenantId: string | undefined, period: string) {
    const tw = this.tenantWhere(tenantId);
    const now = new Date();

    // Parse period to get startDate
    const periodDays = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const startDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

    // End of current month
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    // Start of current month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    // 7 days from now
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      clientesPorRegimeRaw,
      clientesAtivos,
      novosClientesPeriodo,
      obrigacoesAtrasadas,
      obrigacoesEssaSemana,
      obrigacoesEsseMes,
      produtividadeConcluidas,
      produtividadeTotal,
      inadimplenciaRaw,
    ] = await Promise.all([
      // 1. Clientes por regime tributário
      this.prisma.clienteContabil.groupBy({
        by: ['regime_tributario'],
        _count: true,
        where: { ...tw, stage: 'ATIVO', archived: false },
      }),
      // 2. Clientes ativos
      this.prisma.clienteContabil.count({
        where: { ...tw, stage: 'ATIVO', archived: false },
      }),
      // 3. Novos clientes no período
      this.prisma.clienteContabil.count({
        where: { ...tw, created_at: { gte: startDate } },
      }),
      // 4. Obrigações atrasadas
      this.prisma.obrigacaoFiscal.count({
        where: { ...tw, completed: false, due_at: { lt: now } },
      }),
      // 5. Obrigações essa semana
      this.prisma.obrigacaoFiscal.count({
        where: { ...tw, completed: false, due_at: { gte: now, lte: sevenDaysFromNow } },
      }),
      // 6. Obrigações esse mês
      this.prisma.obrigacaoFiscal.count({
        where: { ...tw, completed: false, due_at: { gte: now, lte: endOfMonth } },
      }),
      // 7. Obrigações concluídas este mês
      this.prisma.obrigacaoFiscal.count({
        where: { ...tw, completed: true, due_at: { gte: startOfMonth, lte: endOfMonth } },
      }),
      // 8. Total de obrigações este mês
      this.prisma.obrigacaoFiscal.count({
        where: { ...tw, due_at: { gte: startOfMonth, lte: endOfMonth } },
      }),
      // 9. Inadimplência por cliente (parcelas PENDENTE vencidas)
      this.prisma.honorarioParcela.findMany({
        where: {
          status: 'PENDENTE',
          due_date: { lt: now },
          ...(tenantId ? { honorario: { tenant_id: tenantId } } : {}),
        },
        select: {
          amount: true,
          honorario: {
            select: {
              cliente: {
                select: {
                  id: true,
                  lead: { select: { name: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    // Build inadimplência ranking grouped by cliente
    const inadimplenciaMap = new Map<string, { clienteId: string; nome: string; totalAtrasado: number; parcelas: number }>();
    for (const parcela of inadimplenciaRaw as any[]) {
      const cliente = parcela.honorario?.cliente;
      if (!cliente) continue;
      const clienteId = cliente.id;
      const nome = cliente.lead?.name || 'Cliente sem nome';
      const existing = inadimplenciaMap.get(clienteId);
      if (existing) {
        existing.totalAtrasado += Number(parcela.amount || 0);
        existing.parcelas += 1;
      } else {
        inadimplenciaMap.set(clienteId, {
          clienteId,
          nome,
          totalAtrasado: Number(parcela.amount || 0),
          parcelas: 1,
        });
      }
    }

    const inadimplenciaPorCliente = Array.from(inadimplenciaMap.values())
      .sort((a, b) => b.totalAtrasado - a.totalAtrasado)
      .slice(0, 5);

    const produtividadePendentes = produtividadeTotal - produtividadeConcluidas;
    const pct = produtividadeTotal > 0 ? Math.round((produtividadeConcluidas / produtividadeTotal) * 100) : 0;

    return {
      clientesPorRegime: (clientesPorRegimeRaw as any[]).map((g: any) => ({
        regime: g.regime_tributario || 'OUTRO',
        count: g._count,
      })),
      clientesAtivos,
      novosClientesPeriodo,
      obrigacoesAtrasadas,
      obrigacoesEssaSemana,
      obrigacoesEsseMes,
      produtividade: {
        concluidas: produtividadeConcluidas,
        pendentes: produtividadePendentes,
        total: produtividadeTotal,
        pct,
      },
      inadimplenciaPorCliente,
    };
  }
}
