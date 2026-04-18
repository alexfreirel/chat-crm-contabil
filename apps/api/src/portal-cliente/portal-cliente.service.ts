import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as jwt from 'jsonwebtoken';

const PORTAL_SECRET  = process.env.JWT_SECRET || '__INSECURE_DEV_FALLBACK_CHANGE_ME__';
const PORTAL_EXPIRES = '7d';

interface PortalTokenPayload {
  sub: string;        // clienteContabilId
  clienteId: string;
  type: 'portal';
}

@Injectable()
export class PortalClienteService {
  private readonly logger = new Logger(PortalClienteService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Gera um token JWT de acesso ao portal ──────────────────────────────────
  async gerarLink(clienteId: string, tenantId?: string): Promise<{ token: string; url: string }> {
    const cliente = await this.prisma.clienteContabil.findUnique({
      where: { id: clienteId },
      select: { id: true, tenant_id: true, lead: { select: { name: true } } },
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    if (tenantId && cliente.tenant_id && cliente.tenant_id !== tenantId) {
      throw new UnauthorizedException('Acesso negado');
    }

    const payload: PortalTokenPayload = { sub: clienteId, clienteId, type: 'portal' };
    const token = jwt.sign(payload, PORTAL_SECRET, { expiresIn: PORTAL_EXPIRES });
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lexconassessoriacontabil.com.br';
    const url = `${baseUrl}/portal/${token}`;

    this.logger.log(`Portal link gerado para cliente ${clienteId} (${cliente.lead?.name ?? 'sem nome'})`);
    return { token, url };
  }

  // ─── Valida token e retorna dados básicos do cliente ────────────────────────
  async getInfo(token: string) {
    const payload = this.verifyToken(token);
    const cliente = await this.prisma.clienteContabil.findUnique({
      where: { id: payload.clienteId },
      select: {
        id: true,
        stage: true,
        service_type: true,
        regime_tributario: true,
        lead: { select: { name: true, email: true, phone: true } },
        accountant: { select: { name: true, email: true } },
      },
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');

    const now = new Date();

    // Resumo de obrigações
    const [totalObrigacoes, vencidas, concluidas] = await Promise.all([
      this.prisma.obrigacaoFiscal.count({ where: { cliente_id: payload.clienteId } }),
      this.prisma.obrigacaoFiscal.count({
        where: { cliente_id: payload.clienteId, completed: false, due_at: { lt: now } },
      }),
      this.prisma.obrigacaoFiscal.count({
        where: { cliente_id: payload.clienteId, completed: true },
      }),
    ]);

    // Resumo financeiro
    const [totalPendente, totalPago] = await Promise.all([
      this.prisma.honorarioParcela.aggregate({
        _sum: { amount: true },
        where: {
          status: 'PENDENTE',
          honorario: { cliente_id: payload.clienteId },
        },
      }),
      this.prisma.honorarioParcela.aggregate({
        _sum: { amount: true },
        where: {
          status: 'PAGO',
          honorario: { cliente_id: payload.clienteId },
        },
      }),
    ]);

    return {
      cliente: {
        id: cliente.id,
        nome: cliente.lead?.name ?? 'Cliente',
        email: cliente.lead?.email ?? null,
        phone: cliente.lead?.phone ?? null,
        stage: cliente.stage,
        service_type: cliente.service_type,
        regime_tributario: cliente.regime_tributario,
        contador: cliente.accountant?.name ?? null,
      },
      resumo: {
        totalObrigacoes,
        vencidas,
        concluidas,
        pendentes: totalObrigacoes - concluidas - vencidas,
        totalPendente: Number(totalPendente._sum.amount ?? 0),
        totalPago: Number(totalPago._sum.amount ?? 0),
      },
    };
  }

  // ─── Obrigações fiscais do cliente ──────────────────────────────────────────
  async getObrigacoes(token: string) {
    const payload = this.verifyToken(token);
    const now = new Date();
    const obrigacoes = await this.prisma.obrigacaoFiscal.findMany({
      where: { cliente_id: payload.clienteId },
      orderBy: { due_at: 'asc' },
      select: {
        id: true,
        tipo: true,
        titulo: true,
        due_at: true,
        completed: true,
        completed_at: true,
        recorrente: true,
        frequencia: true,
      },
    });
    return obrigacoes.map(o => ({
      ...o,
      status: o.completed ? 'CONCLUIDA' : new Date(o.due_at) < now ? 'VENCIDA' : 'PENDENTE',
    }));
  }

  // ─── Documentos do cliente ──────────────────────────────────────────────────
  async getDocumentos(token: string) {
    const payload = this.verifyToken(token);
    return this.prisma.documentoContabil.findMany({
      where: { cliente_id: payload.clienteId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        folder: true,
        mime_type: true,
        size: true,
        competencia: true,
        created_at: true,
        // s3_key not exposed — client downloads via signed URL route
      },
    });
  }

  // ─── Parcelas / histórico financeiro ────────────────────────────────────────
  async getParcelas(token: string) {
    const payload = this.verifyToken(token);
    const parcelas = await this.prisma.honorarioParcela.findMany({
      where: { honorario: { cliente_id: payload.clienteId } },
      orderBy: { due_date: 'desc' },
      select: {
        id: true,
        amount: true,
        due_date: true,
        paid_at: true,
        status: true,
        payment_method: true,
        competencia: true,
        honorario: { select: { tipo: true } },
      },
    });
    return parcelas.map(p => ({
      id: p.id,
      amount: Number(p.amount),
      due_date: p.due_date,
      paid_at: p.paid_at,
      status: p.status,
      payment_method: p.payment_method,
      competencia: p.competencia,
      tipo: p.honorario?.tipo ?? null,
    }));
  }

  // ─── Utilitário ─────────────────────────────────────────────────────────────
  private verifyToken(token: string): PortalTokenPayload {
    try {
      const decoded = jwt.verify(token, PORTAL_SECRET) as PortalTokenPayload;
      if (decoded.type !== 'portal') throw new Error('Tipo de token inválido');
      return decoded;
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }
  }
}
