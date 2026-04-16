import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ObrigacoesService {
  private readonly logger = new Logger(ObrigacoesService.name);

  constructor(private prisma: PrismaService) {}

  async findByCliente(clienteId: string, tenantId?: string) {
    await this.verifyClienteAccess(clienteId, tenantId);
    // Marca como atrasadas obrigações vencidas antes de retornar
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

  async create(clienteId: string, data: {
    tipo: string;
    titulo: string;
    competencia?: string;
    due_at: string;
    recorrente?: boolean;
    frequencia?: string;
    alert_days?: number;
    responsavel_id?: string;
  }, tenantId?: string) {
    await this.verifyClienteAccess(clienteId, tenantId);
    return this.prisma.obrigacaoFiscal.create({
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
  }

  async complete(id: string, tenantId?: string) {
    return this.prisma.obrigacaoFiscal.update({
      where: { id },
      data: { completed: true, completed_at: new Date() },
    });
  }

  async remove(id: string, tenantId?: string) {
    return this.prisma.obrigacaoFiscal.delete({ where: { id } });
  }

  getTipos() {
    return [
      { value: 'DAS_MENSAL', label: 'DAS Mensal (Simples)' },
      { value: 'PGDAS', label: 'PGDAS-D' },
      { value: 'SPED_FISCAL', label: 'SPED Fiscal (EFD-ICMS/IPI)' },
      { value: 'EFD_CONTRIB', label: 'EFD-Contribuições (PIS/COFINS)' },
      { value: 'ECF', label: 'ECF (Escrituração Contábil Fiscal)' },
      { value: 'ECD', label: 'ECD (Escrituração Contábil Digital)' },
      { value: 'DCTF', label: 'DCTF Mensal' },
      { value: 'DEFIS', label: 'DEFIS (Simples Nacional Anual)' },
      { value: 'DASN', label: 'DASN-SIMEI (MEI Anual)' },
      { value: 'DIRF', label: 'DIRF Anual' },
      { value: 'RAIS', label: 'RAIS Anual' },
      { value: 'eSocial', label: 'eSocial' },
      { value: 'FGTS', label: 'FGTS / GFIP' },
      { value: 'FOLHA', label: 'Folha de Pagamento' },
      { value: 'IRPF', label: 'IRPF (Imposto de Renda PF)' },
      { value: 'NOTA_FISCAL', label: 'Nota Fiscal' },
      { value: 'CERTIDAO', label: 'Certidão / Regularização' },
      { value: 'OUTRO', label: 'Outro' },
    ];
  }

  private async markOverdue(clienteId: string) {
    await this.prisma.obrigacaoFiscal.updateMany({
      where: {
        cliente_id: clienteId,
        completed: false,
        due_at: { lt: new Date() },
      },
      data: {},  // apenas para disparar updated_at; status pode ser adicionado se necessário
    });
  }

  private async verifyClienteAccess(clienteId: string, tenantId?: string) {
    if (!tenantId) return;
    const c = await this.prisma.clienteContabil.findUnique({ where: { id: clienteId }, select: { tenant_id: true } });
    if (!c) throw new NotFoundException('Cliente contábil não encontrado');
    if (c.tenant_id && c.tenant_id !== tenantId) throw new ForbiddenException('Acesso negado');
  }
}
