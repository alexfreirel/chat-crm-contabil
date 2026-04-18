import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { v4 as uuidv4 } from 'uuid';

export const FOLDERS = [
  { value: 'FISCAL',     label: 'Fiscal',              icon: '🧾', description: 'NFe, NFSe, SPED, DCTF, XML de notas' },
  { value: 'CONTABIL',   label: 'Contábil',             icon: '📊', description: 'Balancetes, DRE, Balanço, Livros contábeis' },
  { value: 'PESSOAL',    label: 'Pessoal',              icon: '👷', description: 'Contratos CLT, holerites, férias, rescisões' },
  { value: 'PAYROLL',    label: 'Folha de Pagamento',   icon: '💵', description: 'Folha, GFIP, GPS, eSocial' },
  { value: 'SOCIETARIO', label: 'Societário',           icon: '🏛️', description: 'Contrato social, atas, procurações, alterações' },
  { value: 'IR',         label: 'Imposto de Renda',     icon: '📋', description: 'IRPF, IRPJ, ECF, declarações' },
  { value: 'CERTIDOES',  label: 'Certidões',            icon: '📜', description: 'Certidões negativas e positivas' },
  { value: 'OUTROS',     label: 'Outros',               icon: '📁', description: 'Documentos gerais' },
];

// Checklist base: documentos esperados por tipo de serviço
// CLIENTE_EFETIVO absorve: BPO_FISCAL + BPO_CONTABIL + DP + IR_PJ
const CHECKLIST_BASE = [
  { folder: 'SOCIETARIO', nome: 'Contrato Social',            obrigatorio: true,  servicos: ['CLIENTE_EFETIVO','BPO_FISCAL','BPO_CONTABIL','DP','ABERTURA','ENCERRAMENTO'] },
  { folder: 'SOCIETARIO', nome: 'Cartão CNPJ',                obrigatorio: true,  servicos: ['CLIENTE_EFETIVO','BPO_FISCAL','BPO_CONTABIL','DP'] },
  { folder: 'SOCIETARIO', nome: 'Procuração',                 obrigatorio: false, servicos: ['CLIENTE_EFETIVO','BPO_FISCAL','BPO_CONTABIL'] },
  { folder: 'FISCAL',     nome: 'Última DCTF',                obrigatorio: false, servicos: ['CLIENTE_EFETIVO','BPO_FISCAL'] },
  { folder: 'FISCAL',     nome: 'PGDAS-D atual',              obrigatorio: false, servicos: ['CLIENTE_EFETIVO','BPO_FISCAL'] },
  { folder: 'FISCAL',     nome: 'Último DAS',                 obrigatorio: false, servicos: ['CLIENTE_EFETIVO','BPO_FISCAL'] },
  { folder: 'IR',         nome: 'Última declaração IRPF',     obrigatorio: false, servicos: ['IR_PF'] },
  { folder: 'IR',         nome: 'Comprovante de rendimentos', obrigatorio: false, servicos: ['IR_PF'] },
  { folder: 'CERTIDOES',  nome: 'CND Federal (SRF)',          obrigatorio: true,  servicos: ['CLIENTE_EFETIVO','BPO_FISCAL','BPO_CONTABIL'] },
  { folder: 'CERTIDOES',  nome: 'CND Municipal',              obrigatorio: false, servicos: ['CLIENTE_EFETIVO','BPO_FISCAL','BPO_CONTABIL'] },
  { folder: 'PESSOAL',    nome: 'Último RAIS',                obrigatorio: false, servicos: ['CLIENTE_EFETIVO','DP'] },
  { folder: 'PAYROLL',    nome: 'Última folha de pagamento',  obrigatorio: false, servicos: ['CLIENTE_EFETIVO','DP'] },
  { folder: 'PAYROLL',    nome: 'Última GFIP/eSocial',        obrigatorio: false, servicos: ['CLIENTE_EFETIVO','DP'] },
];

@Injectable()
export class DocumentosContabilService {
  private readonly logger = new Logger(DocumentosContabilService.name);

  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
  ) {}

  async findByCliente(clienteId: string, folder?: string, tenantId?: string) {
    const where: any = { cliente_id: clienteId };
    if (folder) where.folder = folder;
    return this.prisma.documentoContabil.findMany({
      where,
      orderBy: [{ competencia: 'desc' }, { created_at: 'desc' }],
      include: { uploaded_by: { select: { id: true, name: true } } },
    });
  }

  /** Upload de arquivo para o S3 e criação do registro */
  async upload(
    file: Express.Multer.File,
    data: {
      cliente_id: string;
      folder?: string;
      description?: string;
      competencia?: string; // 'YYYY-MM'
      uploaded_by_id?: string;
      tenant_id?: string;
    },
  ) {
    const ext = file.originalname.split('.').pop()?.toLowerCase() || 'bin';
    const s3Key = `documentos-contabil/${data.cliente_id}/${uuidv4()}.${ext}`;

    await this.s3.uploadBuffer(s3Key, file.buffer, file.mimetype || 'application/octet-stream');

    const doc = await this.prisma.documentoContabil.create({
      data: {
        cliente_id: data.cliente_id,
        uploaded_by_id: data.uploaded_by_id,
        tenant_id: data.tenant_id,
        folder: data.folder || 'OUTROS',
        name: file.originalname,
        original_name: file.originalname,
        s3_key: s3Key,
        mime_type: file.mimetype,
        size: file.size,
        description: data.description,
        competencia: data.competencia ? new Date(`${data.competencia}-01`) : undefined,
      },
      include: { uploaded_by: { select: { id: true, name: true } } },
    });
    this.logger.log(`Uploaded: ${doc.id} — ${file.originalname} (${file.size} bytes)`);
    return doc;
  }

  /** Metadados para download de um documento */
  async getDownload(id: string, tenantId?: string) {
    const doc = await this.prisma.documentoContabil.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    if (tenantId && doc.tenant_id && doc.tenant_id !== tenantId) {
      throw new ForbiddenException('Acesso negado');
    }
    const { buffer, contentType } = await this.s3.getObjectBuffer(doc.s3_key);
    return { buffer, contentType, filename: doc.original_name };
  }

  /** Remove do S3 e do banco */
  async remove(id: string, tenantId?: string) {
    const doc = await this.prisma.documentoContabil.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    if (tenantId && doc.tenant_id && doc.tenant_id !== tenantId) {
      throw new ForbiddenException('Acesso negado');
    }
    try { await this.s3.deleteObject(doc.s3_key); } catch (e) {
      this.logger.warn(`Falha ao deletar ${doc.s3_key}: ${e}`);
    }
    return this.prisma.documentoContabil.delete({ where: { id } });
  }

  /** Checklist de documentos pendentes para o cliente */
  async getChecklist(clienteId: string) {
    const cliente = await this.prisma.clienteContabil.findUnique({
      where: { id: clienteId },
      select: { service_type: true },
    });
    const serviceType = cliente?.service_type || 'OUTROS';

    const existentes = await this.prisma.documentoContabil.findMany({
      where: { cliente_id: clienteId },
      select: { folder: true, name: true },
    });

    const relevante = CHECKLIST_BASE.filter(item =>
      item.servicos.includes(serviceType),
    );

    return relevante.map(item => ({
      ...item,
      encontrado: existentes.some(
        e => e.folder === item.folder &&
          e.name.toLowerCase().includes(item.nome.toLowerCase().split(' ')[0].toLowerCase()),
      ),
    }));
  }

  /** Create manual (sem upload, para referências externas) */
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
    competencia?: string;
    tenant_id?: string;
  }) {
    return this.prisma.documentoContabil.create({
      data: {
        ...data,
        competencia: data.competencia ? new Date(`${data.competencia}-01`) : undefined,
      },
    });
  }

  getFolders() { return FOLDERS; }
}
