import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TemplatesContabilService {
  private readonly logger = new Logger(TemplatesContabilService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(tenantId?: string, tipo?: string) {
    return this.prisma.templateContabil.findMany({
      where: {
        OR: [
          ...(tenantId ? [{ tenant_id: tenantId }] : []),
          { is_global: true },
        ],
        ...(tipo ? { tipo } : {}),
      },
      orderBy: { usage_count: 'desc' },
    });
  }

  async findOne(id: string) {
    const t = await this.prisma.templateContabil.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Template não encontrado');
    return t;
  }

  async create(data: {
    name: string; tipo: string; description?: string;
    content_json?: any; variables?: string[];
    is_global?: boolean; tenant_id?: string; created_by_id?: string;
  }) {
    return this.prisma.templateContabil.create({ data });
  }

  async update(id: string, data: { name?: string; tipo?: string; description?: string; content_json?: any; variables?: string[] }) {
    return this.prisma.templateContabil.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.templateContabil.delete({ where: { id } });
  }

  async incrementUsage(id: string) {
    return this.prisma.templateContabil.update({
      where: { id },
      data: { usage_count: { increment: 1 } },
    });
  }

  getTipos() {
    return [
      { value: 'CONTRATO_SERVICO', label: 'Contrato de Prestação de Serviços' },
      { value: 'PROCURACAO', label: 'Procuração' },
      { value: 'PROPOSTA', label: 'Proposta Comercial' },
      { value: 'NOTIFICACAO', label: 'Notificação / Comunicado' },
      { value: 'OUTRO', label: 'Outro' },
    ];
  }
}
