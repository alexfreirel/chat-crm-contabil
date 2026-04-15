import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type Quartile = 'TOP' | 'MID' | 'LOW';

interface UserRef { id: string; name: string; role?: string; roles?: string[] }

@Injectable()
export class TeamPerformanceService {
  constructor(private prisma: PrismaService) {}

  private tenantWhere(tenantId?: string) {
    return tenantId
      ? { OR: [{ tenant_id: tenantId }, { tenant_id: null }] }
      : {};
  }

  async getPerformance(userId: string, roles: string | string[], tenantId?: string, startDate?: string, endDate?: string) {
    const roleArr = Array.isArray(roles) ? roles : (roles ? [roles] : []);
    if (!roleArr.includes('ADMIN')) return { members: [], teamAverages: {}, period: {}, previousPeriod: {} };

    const tw = this.tenantWhere(tenantId);
    const now = new Date();
    const end = endDate ? new Date(endDate) : now;
    const start = startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 86400000);
    const periodMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime());
    const prevStart = new Date(start.getTime() - periodMs);

    // ─── 1. Get all team members ──
    const users = await this.prisma.user.findMany({
      where: tw,
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });

    // Normalize: treat role as array for compatibility
    const usersNorm = users.map(u => ({ ...u, roles: u.role ? [u.role] : [] }));

    const especialistas = usersNorm.filter(u => u.roles?.includes('ESPECIALISTA') || u.roles?.includes('ADVOGADO'));
    const operadores = usersNorm.filter(u => u.roles?.includes('OPERADOR'));
    const assistentes = usersNorm.filter(u => u.roles?.includes('ASSISTENTE') || u.roles?.includes('ESTAGIARIO'));
    const allIds = usersNorm.map(u => u.id);
    const espIds = especialistas.map(u => u.id);
    const opIds = operadores.map(u => u.id);
    const estIds = assistentes.map(u => u.id);

    // ─── 2. Batch queries (all roles in parallel) ──
    const [
      // Tasks (ALL roles)
      tasksCompleted, tasksPending, tasksOverdue,
      prevTasksCompleted, prevTasksPending,
      // ESPECIALISTA queries — clientes contábeis
      activeCases, casesFiledCurrent, casesFiledPrev,
      // OPERADOR queries
      openConvs, closedConvs, closedConvsPrev,
      leadsHandled, leadsConverted, leadsLost,
      stagesAdvanced, stagesAdvancedPrev,
    ] = await Promise.all([
      // ── Tasks (ALL) ──
      this.prisma.calendarEvent.groupBy({
        by: ['assigned_user_id'],
        _count: true,
        where: { type: 'TAREFA', status: 'CONCLUIDO', assigned_user_id: { in: allIds }, ...tw },
      }),
      this.prisma.calendarEvent.groupBy({
        by: ['assigned_user_id'],
        _count: true,
        where: { type: 'TAREFA', status: { in: ['AGENDADO', 'CONFIRMADO'] }, assigned_user_id: { in: allIds }, ...tw },
      }),
      this.prisma.calendarEvent.groupBy({
        by: ['assigned_user_id'],
        _count: true,
        where: { type: 'TAREFA', status: { in: ['AGENDADO', 'CONFIRMADO'] }, start_at: { lt: now }, assigned_user_id: { in: allIds }, ...tw },
      }),
      this.prisma.calendarEvent.groupBy({
        by: ['assigned_user_id'],
        _count: true,
        where: { type: 'TAREFA', status: 'CONCLUIDO', assigned_user_id: { in: allIds }, created_at: { gte: prevStart, lte: prevEnd }, ...tw },
      }),
      this.prisma.calendarEvent.groupBy({
        by: ['assigned_user_id'],
        _count: true,
        where: { type: 'TAREFA', status: { in: ['AGENDADO', 'CONFIRMADO'] }, assigned_user_id: { in: allIds }, created_at: { gte: prevStart, lte: prevEnd }, ...tw },
      }),

      // ── ESPECIALISTA: Clientes Contábeis ──
      this.prisma.clienteContabil.groupBy({
        by: ['accountant_id'],
        _count: true,
        where: { accountant_id: { in: espIds }, archived: false, ...tw },
      }),
      this.prisma.clienteContabil.groupBy({
        by: ['accountant_id'],
        _count: true,
        where: { accountant_id: { in: espIds }, created_at: { gte: start, lte: end }, ...tw },
      }),
      this.prisma.clienteContabil.groupBy({
        by: ['accountant_id'],
        _count: true,
        where: { accountant_id: { in: espIds }, created_at: { gte: prevStart, lte: prevEnd }, ...tw },
      }),

      // ── OPERADOR: Conversations ──
      this.prisma.conversation.groupBy({
        by: ['assigned_user_id'],
        _count: true,
        where: { assigned_user_id: { in: opIds }, status: { not: 'FECHADO' }, ...tw },
      }),
      this.prisma.conversation.groupBy({
        by: ['assigned_user_id'],
        _count: true,
        where: { assigned_user_id: { in: opIds }, status: 'FECHADO', last_message_at: { gte: start, lte: end }, ...tw },
      }),
      this.prisma.conversation.groupBy({
        by: ['assigned_user_id'],
        _count: true,
        where: { assigned_user_id: { in: opIds }, status: 'FECHADO', last_message_at: { gte: prevStart, lte: prevEnd }, ...tw },
      }),
      // Leads handled
      this.prisma.lead.groupBy({
        by: ['cs_user_id'],
        _count: true,
        where: { cs_user_id: { in: opIds }, ...tw },
      }),
      // Leads converted
      this.prisma.lead.groupBy({
        by: ['cs_user_id'],
        _count: true,
        where: { cs_user_id: { in: opIds }, is_client: true, ...tw },
      }),
      // Leads lost
      this.prisma.lead.groupBy({
        by: ['cs_user_id'],
        _count: true,
        where: { cs_user_id: { in: opIds }, stage: 'PERDIDO', ...tw },
      }),
      // Stages advanced
      this.prisma.leadStageHistory.groupBy({
        by: ['actor_id'],
        _count: true,
        where: { actor_id: { in: opIds }, created_at: { gte: start, lte: end } },
      }),
      this.prisma.leadStageHistory.groupBy({
        by: ['actor_id'],
        _count: true,
        where: { actor_id: { in: opIds }, created_at: { gte: prevStart, lte: prevEnd } },
      }),
    ]);

    // ─── 3. Helper: extract count from groupBy result ──
    const gc = (arr: any[], key: string, id: string, extraKey?: string, extraVal?: string): number => {
      if (extraKey) return arr.filter(r => r[key] === id && r[extraKey] === extraVal).reduce((s, r) => s + r._count, 0);
      return arr.find(r => r[key] === id)?._count || 0;
    };

    // ─── 4. Assemble members ──
    const members: any[] = [];

    for (const user of usersNorm) {
      const completed = gc(tasksCompleted, 'assigned_user_id', user.id);
      const pending = gc(tasksPending, 'assigned_user_id', user.id);
      const overdue = gc(tasksOverdue, 'assigned_user_id', user.id);
      const total = completed + pending;
      const taskRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      const sharedTasks = { tasksCompleted: completed, tasksPending: pending, tasksOverdue: overdue, taskCompletionRate: taskRate };

      let advKPIs: any = undefined;
      let opKPIs: any = undefined;
      let estKPIs: any = undefined;
      let score = 0;
      let prevScore = 0;

      if (user.roles?.some((r: string) => ['ESPECIALISTA', 'ADVOGADO', 'ADMIN'].includes(r))) {
        const active = gc(activeCases, 'accountant_id', user.id);
        const filed = gc(casesFiledCurrent, 'accountant_id', user.id);

        advKPIs = {
          activeCases: active, casesFiledThisPeriod: filed, avgDaysToFile: 0,
          totalContracted: 0, totalCollected: 0, totalReceivable: 0, collectionRate: 0,
        };

        // ESPECIALISTA SCORE
        score = 0;
        score += Math.min(30, active * 3); // clientes ativos 30pts
        score += Math.min(25, filed * 5);  // novos clientes 25pts
        score += Math.max(0, (taskRate / 100) * 30 - overdue * 3); // tasks 30pts
        score += 15; // placeholder

        const prevFiled = gc(casesFiledPrev, 'accountant_id', user.id);
        const prevCompleted = gc(prevTasksCompleted, 'assigned_user_id', user.id);
        const prevPend = gc(prevTasksPending, 'assigned_user_id', user.id);
        const prevTotal = prevCompleted + prevPend;
        const prevTaskRate = prevTotal > 0 ? (prevCompleted / prevTotal) * 100 : 0;
        prevScore = Math.min(30, active * 3) + Math.min(25, prevFiled * 5) + (prevTaskRate / 100) * 30 + 15;
      }

      if (user.roles?.includes('OPERADOR')) {
        const open = gc(openConvs, 'assigned_user_id', user.id);
        const closed = gc(closedConvs, 'assigned_user_id', user.id);
        const handled = gc(leadsHandled, 'cs_user_id', user.id);
        const converted = gc(leadsConverted, 'cs_user_id', user.id);
        const lost = gc(leadsLost, 'cs_user_id', user.id);
        const convRate = handled > 0 ? Math.round((converted / handled) * 100) : 0;
        const stages = gc(stagesAdvanced, 'actor_id', user.id);

        opKPIs = {
          openConversations: open, closedConversations: closed,
          avgResponseTimeMinutes: 0, medianResponseTimeMinutes: 0,
          leadsHandled: handled, leadsConverted: converted,
          conversionRate: convRate, avgConversionDays: 0,
          stagesAdvanced: stages, leadsLost: lost,
          tasksCompleted: completed, taskCompletionRate: taskRate,
        };

        // OPERADOR SCORE
        score = 0;
        score += (convRate / 100) * 30;
        score += 25;
        score += Math.min(15, closed / 5 * 1.5);
        score += (taskRate / 100) * 15;
        score += Math.min(10, stages / 10 * 2);
        score -= Math.min(5, lost * 0.5);

        const prevClosed = gc(closedConvsPrev, 'assigned_user_id', user.id);
        const prevStages = gc(stagesAdvancedPrev, 'actor_id', user.id);
        prevScore = (convRate / 100) * 30 + 25 + Math.min(15, prevClosed / 5 * 1.5) + (taskRate / 100) * 15 + Math.min(10, prevStages / 10 * 2);
      }

      if (user.roles?.includes('ASSISTENTE') || user.roles?.includes('ESTAGIARIO')) {
        estKPIs = {
          tasksCompleted: completed, tasksPending: pending, tasksOverdue: overdue,
          taskCompletionRate: taskRate, avgTaskCompletionDays: 0,
          documentsUploaded: 0,
        };

        // ASSISTENTE SCORE
        score = 0;
        score += Math.max(0, (taskRate / 100) * 35 - overdue * 5);
        score += 10 + 10 + 10 + 35; // placeholders

        prevScore = Math.max(0, (taskRate / 100) * 35) + 65;
      }

      score = Math.max(0, Math.min(100, Math.round(score)));
      prevScore = Math.max(0, Math.min(100, Math.round(prevScore)));

      members.push({
        userId: user.id, name: user.name, role: user.role ?? 'OPERADOR', roles: user.roles,
        compositeScore: score, previousScore: prevScore, scoreDelta: score - prevScore,
        rank: 0, quartile: 'MID' as Quartile,
        advogadoKPIs: advKPIs, operadorKPIs: opKPIs, estagiarioKPIs: estKPIs,
        sharedTasks,
        dailyActivity: [],
      });
    }

    // ─── 5. Rank and quartile per role ──
    const rankGroup = (roleFilter: string) => {
      const group = members.filter(m => m.roles?.includes(roleFilter)).sort((a, b) => b.compositeScore - a.compositeScore);
      group.forEach((m, i) => { m.rank = i + 1; });
      const len = group.length;
      if (len >= 4) {
        const q1 = Math.ceil(len * 0.25);
        const q3 = Math.ceil(len * 0.75);
        group.forEach((m, i) => {
          if (i < q1) m.quartile = 'TOP';
          else if (i >= q3) m.quartile = 'LOW';
          else m.quartile = 'MID';
        });
      } else {
        group.forEach(m => {
          if (m.compositeScore >= 70) m.quartile = 'TOP';
          else if (m.compositeScore < 50) m.quartile = 'LOW';
          else m.quartile = 'MID';
        });
      }
    };

    rankGroup('ESPECIALISTA');
    rankGroup('ADVOGADO');
    rankGroup('OPERADOR');
    rankGroup('ASSISTENTE');
    rankGroup('ADMIN');

    // ─── 6. Team averages ──
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
    const advMembers = members.filter(m => m.advogadoKPIs);
    const opMembers = members.filter(m => m.operadorKPIs);
    const estMembers = members.filter(m => m.estagiarioKPIs);

    const teamAverages = {
      especialista: {
        activeCases: Math.round(avg(advMembers.map(m => m.advogadoKPIs.activeCases))),
        collectionRate: Math.round(avg(advMembers.map(m => m.advogadoKPIs.collectionRate))),
        totalCollected: Math.round(avg(advMembers.map(m => m.advogadoKPIs.totalCollected))),
      },
      operador: {
        conversionRate: Math.round(avg(opMembers.map(m => m.operadorKPIs.conversionRate))),
        closedConversations: Math.round(avg(opMembers.map(m => m.operadorKPIs.closedConversations))),
        avgResponseTimeMinutes: Math.round(avg(opMembers.map(m => m.operadorKPIs.avgResponseTimeMinutes))),
        taskCompletionRate: Math.round(avg(opMembers.map(m => m.operadorKPIs.taskCompletionRate))),
      },
      assistente: {
        taskCompletionRate: Math.round(avg(estMembers.map(m => m.estagiarioKPIs.taskCompletionRate))),
      },
      tasks: {
        taskCompletionRate: Math.round(avg(members.map(m => m.sharedTasks.taskCompletionRate))),
        tasksCompleted: Math.round(avg(members.map(m => m.sharedTasks.tasksCompleted))),
      },
    };

    return {
      period: { startDate: start.toISOString(), endDate: end.toISOString() },
      previousPeriod: { startDate: prevStart.toISOString(), endDate: prevEnd.toISOString() },
      members,
      teamAverages,
    };
  }
}
