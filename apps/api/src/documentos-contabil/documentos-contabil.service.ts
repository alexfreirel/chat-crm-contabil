import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DocumentosContabilService {
  private readonly logger = new Logger(DocumentosContabilService.name);

  constructor(private prisma: PrismaService) {}

  async findByCliente(clienteId: string, folder?: string, tenantId?: string) {
    const where: any = { cliente_id: clienteId };
    if (folder) where.folder = folder;
    return this.prisma.documentoContabil.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        uploaded_by: { select: { id: true, name: true } },
      },
    });
  }

  async create(data: {
    cliente_id: string;
    uploaded_by_id?: string;
    folder: string;
    name: string;
    original_name: string;
    s3_key: string;
    mime_type?: string;
    size?: number;
    description?: string;
    tenant_id?: string;
  }) {
    return this.prisma.documentoContabil.create({ data });
  }

  async remove(id: string, tenantId?: string) {
    const doc = await this.prisma.documentoContabil.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    if (tenantId && doc.tenant_id && doc.tenant_id !== tenantId) {
      throw new ForbiddenException('Acesso negado');
    }
    return this.prisma.documentoContabil.delete({ where: { id } });
  }

  getFolders() {
    return [
      { value: 'CONTRATO', label: 'Contratos' },
      { value: 'PROCURACAO', label: 'Procurações' },
      { value: 'CERTIDAO', label: 'Certidões' },
      { value: 'NOTA_FISCAL', label: 'Notas Fiscais' },
      { value: 'SPED', label: 'SPED / Arquivos Fiscais' },
      { value: 'FOLHA', label: 'Folha de Pagamento' },
      { value: 'IR', label: 'Imposto de Renda' },
      { value: 'CNPJ', label: 'CNPJ / Contrato Social' },
      { value: 'SOCIOS', label: 'Documentos dos Sócios' },
      { value: 'OUTROS', label: 'Outros' },
    ];
  }
}
