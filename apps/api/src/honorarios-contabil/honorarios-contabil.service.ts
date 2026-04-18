import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const TIPOS_HONORARIO = [
  { value: 'CONTABILIDADE_MENSAL',    label: 'Contabilidade Mensal',       recorrente: true  },
  { value: 'FOLHA_PAGAMENTO',         label: 'Folha de Pagamento (DP)',     recorrente: true  },
  { value: 'ABERTURA_EMPRESA',        label: 'Abertura de Empresa',         recorrente: false },
  { value: 'ENCERRAMENTO_EMPRESA',    label: 'Encerramento de Empresa',     recorrente: false },
  { value: 'IRPF',                    label: 'IRPF',                        recorrente: false },
  { value: 'CONSULTORIA',             label: 'Consultoria Tributária',      recorrente: false },
  { value: 'PARCELAMENTO',            label: 'Regularização Parcelada',     recorrente: true  },
  { value: 'PLANEJAMENTO_TRIBUTARIO', label: 'Planejamento Tributário',     recorrente: false },
  { value: 'RECUPERACAO_CREDITO',     label: 'Recuperação de Crédito',      recorrente: false },
  { value: 'OUTROS',                  label: 'Outros',                      recorrente: false },
];

@Injectable()
export class HonorariosContabilService {
  private readonly logger = new Logger(HonorariosContabilService.name);

  constructor(private prisma: PrismaService) {}

  getTipos() { return TIPOS_HONORARIO; }

  async findByCliente(clienteId: string, tenantId?: string) {
    await this.markOverdueByCliente(clienteId);
    return this.prisma.honorarioContabil.findMany({
      where: { cliente_id: clienteId },
      include: { parcelas: { orderBy: { due_date: 'asc' } } },
      orderBy: { created_at: 'desc' },
    });
  }

  async getInadimplencia(tenantId: string) {
    // Retorna todas as parcelas atrasadas com info do cliente
    const parcelas = await this.prisma.honorarioParcela.findMany({
      where: {
        status: 'ATRASADO',
        honorario: { tenant_id: tenantId },
      },
      include: {
        honorario: {
          include: {
            cliente: {
              include: { lead: { select: { name: true, phone: true } } },
            },
          },
        },
      },
      orderBy: { due_date: 'asc' },
    });

    // Agrupar por cliente
    const byCliente: Record<string, any> = {};
    let totalAtrasado = 0;

    for (const p of parcelas) {
      const clienteId = p.honorario.cliente_id;
      const amount = parseFloat(String(p.amount));
      totalAtrasado += amount;

      if (!byCliente[clienteId]) {
        byCliente[clienteId] = {
          clienteId,
          clienteNome: p.honorario.cliente.lead?.name || 'Sem nome',
          clienteTelefone: p.honorario.cliente.lead?.phone || '',
          parcelas: [],
          totalAtrasado: 0,
        };
      }
      byCliente[clienteId].parcelas.push(p);
      byCliente[clienteId].totalAtrasado += amount;
    }

    return {
      totalAtrasado,
      clientes: Object.values(byCliente).sort((a: any, b: any) => b.totalAtrasado - a.totalAtrasado),
      parcelas,
    };
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
      include: { parcelas: true },
    });
  }

  async update(id: string, data: {
    valor?: number;
    dia_vencimento?: number;
    notas?: string;
    ativo?: boolean;
  }) {
    return this.prisma.honorarioContabil.update({
      where: { id },
      data,
      include: { parcelas: { orderBy: { due_date: 'asc' } } },
    });
  }

  /**
   * Gera parcelas mensais automaticamente para um honorário.
   * Evita duplicar competências já existentes.
   */
  async generateParcelas(
    honorarioId: string,
    meses: number,
    competenciaInicio: string, // 'YYYY-MM'
  ) {
    const honorario = await this.prisma.honorarioContabil.findUnique({
      where: { id: honorarioId },
      include: { parcelas: { select: { competencia: true } } },
    });
    if (!honorario) throw new NotFoundException('Honorário não encontrado');

    const existentesComp = new Set(
      honorario.parcelas
        .filter(p => p.competencia)
        .map(p => p.competencia!.toISOString().slice(0, 7)),
    );

    const diaVenc = honorario.dia_vencimento || 10;
    const amount  = parseFloat(String(honorario.valor));
    const toCreate: any[] = [];
    const [anoStr, mesStr] = competenciaInicio.split('-');
    let ano = parseInt(anoStr, 10);
    let mes = parseInt(mesStr, 10);

    for (let i = 0; i < meses; i++) {
      const compKey = `${ano}-${String(mes).padStart(2, '0')}`;
      if (!existentesComp.has(compKey)) {
        // Data de vencimento: mês seguinte à competência
        let vencMes = mes + 1;
        let vencAno = ano;
        if (vencMes > 12) { vencMes = 1; vencAno++; }
        const lastDay = new Date(vencAno, vencMes, 0).getDate();
        const dueDate = new Date(vencAno, vencMes - 1, Math.min(diaVenc, lastDay));

        toCreate.push({
          honorario_id: honorarioId,
          competencia: new Date(`${compKey}-01`),
          amount,
          due_date: dueDate,
          status: dueDate < new Date() ? 'ATRASADO' : 'PENDENTE',
        });
        existentesComp.add(compKey);
      }
      mes++;
      if (mes > 12) { mes = 1; ano++; }
    }

    if (toCreate.length > 0) {
      await this.prisma.honorarioParcela.createMany({ data: toCreate });
    }

    this.logger.log(`Geradas ${toCreate.length} parcelas para honorário ${honorarioId}`);
    return { criadas: toCreate.length };
  }

  /**
   * Aplica reajuste percentual no valor do honorário.
   * Cria um lançamento de observação para histórico.
   */
  async applyReajuste(id: string, percentual: number, motivo?: string) {
    const honorario = await this.prisma.honorarioContabil.findUnique({ where: { id } });
    if (!honorario) throw new NotFoundException('Honorário não encontrado');

    const valorAtual = parseFloat(String(honorario.valor));
    const novoValor  = parseFloat((valorAtual * (1 + percentual / 100)).toFixed(2));

    const historico = honorario.notas
      ? `${honorario.notas}\n[${new Date().toLocaleDateString('pt-BR')}] Reajuste ${percentual}%: R$ ${valorAtual.toFixed(2)} → R$ ${novoValor.toFixed(2)}${motivo ? ` (${motivo})` : ''}`
      : `[${new Date().toLocaleDateString('pt-BR')}] Reajuste ${percentual}%: R$ ${valorAtual.toFixed(2)} → R$ ${novoValor.toFixed(2)}${motivo ? ` (${motivo})` : ''}`;

    return this.prisma.honorarioContabil.update({
      where: { id },
      data: { valor: novoValor, notas: historico },
      include: { parcelas: { orderBy: { due_date: 'asc' } } },
    });
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
        competencia: data.competencia ? new Date(data.competencia + '-01') : undefined,
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
        where: { honorario_id: { in: ids }, status: 'PENDENTE', due_date: { lt: new Date() } },
        data: { status: 'ATRASADO' },
      });
    }
  }
}
