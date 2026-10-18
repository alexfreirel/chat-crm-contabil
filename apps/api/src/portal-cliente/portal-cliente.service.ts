import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as jwt from 'jsonwebtoken';
import * as argon2 from 'argon2';
import { GoogleDriveService } from '../google-drive/google-drive.service';

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

  constructor(
    private prisma: PrismaService,
    private readonly drive: GoogleDriveService,
  ) {}

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

  // ─── Login do cliente (CNPJ + senha definida pelo admin) ────────────────────
  async login(loginRaw: string, senha: string): Promise<{ token: string; nome: string }> {
    const login = (loginRaw || '').replace(/\D/g, '');
    // Mesma mensagem para qualquer falha: não revela se o CNPJ existe
    const invalido = new UnauthorizedException('CNPJ ou senha inválidos');
    if (login.length !== 14 || !senha) throw invalido;

    const cliente = await this.prisma.clienteContabil.findUnique({
      where: { portal_login: login },
      select: {
        id: true, portal_ativo: true, portal_senha_hash: true, archived: true,
        nome_empresa: true, lead: { select: { name: true } },
      },
    });
    if (!cliente?.portal_senha_hash) throw invalido;

    const senhaOk = await argon2.verify(cliente.portal_senha_hash, senha).catch(() => false);
    if (!senhaOk) throw invalido;
    if (!cliente.portal_ativo || cliente.archived) {
      throw new UnauthorizedException('Acesso ao portal desativado. Fale com o escritório.');
    }

    await this.prisma.clienteContabil.update({
      where: { id: cliente.id },
      data: { portal_ultimo_acesso: new Date() },
    });

    const payload: PortalTokenPayload = { sub: cliente.id, clienteId: cliente.id, type: 'portal' };
    const token = jwt.sign(payload, PORTAL_SECRET, { expiresIn: '12h' });
    return { token, nome: cliente.nome_empresa || cliente.lead?.name || 'Cliente' };
  }

  // ─── Admin: lista clientes com situação do acesso ao portal ─────────────────
  async listarAcessos(tenantId?: string) {
    const clientes = await this.prisma.clienteContabil.findMany({
      where: { archived: false, ...(tenantId ? { tenant_id: tenantId } : {}) },
      select: {
        id: true, cpf_cnpj: true, nome_empresa: true,
        portal_login: true, portal_ativo: true, portal_senha_hash: true, portal_ultimo_acesso: true,
        lead: { select: { name: true, ficha_contabil: { select: { cnpj: true, razao_social: true } } } },
      },
      orderBy: { created_at: 'desc' },
      take: 1000,
    });
    return clientes
      .map(c => {
        const cnpj = (c.cpf_cnpj || c.lead?.ficha_contabil?.cnpj || '').replace(/\D/g, '');
        return {
          id: c.id,
          nome: c.nome_empresa || c.lead?.ficha_contabil?.razao_social || c.lead?.name || cnpj || 'Sem nome',
          cnpj: cnpj.length === 14 ? cnpj : null, // portal é só para PJ com CNPJ válido
          ativo: c.portal_ativo,
          temSenha: !!c.portal_senha_hash,
          login: c.portal_login,
          ultimoAcesso: c.portal_ultimo_acesso,
        };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  // ─── Admin: ativa/desativa e define a senha do portal de um cliente ─────────
  async configurarAcesso(
    clienteId: string,
    data: { ativo?: boolean; senha?: string },
    tenantId?: string,
  ) {
    const cliente = await this.prisma.clienteContabil.findUnique({
      where: { id: clienteId },
      select: {
        id: true, tenant_id: true, cpf_cnpj: true, portal_senha_hash: true,
        lead: { select: { ficha_contabil: { select: { cnpj: true } } } },
      },
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    if (tenantId && cliente.tenant_id && cliente.tenant_id !== tenantId) {
      throw new UnauthorizedException('Acesso negado');
    }

    const cnpj = (cliente.cpf_cnpj || cliente.lead?.ficha_contabil?.cnpj || '').replace(/\D/g, '');
    if (cnpj.length !== 14) {
      throw new BadRequestException('Este cliente não tem CNPJ válido cadastrado (o login é o CNPJ).');
    }

    const update: Record<string, any> = { portal_login: cnpj };
    if (data.senha !== undefined && data.senha !== '') {
      if (data.senha.length < 6) throw new BadRequestException('A senha deve ter pelo menos 6 caracteres.');
      update.portal_senha_hash = await argon2.hash(data.senha);
    }
    if (data.ativo !== undefined) {
      if (data.ativo && !update.portal_senha_hash && !cliente.portal_senha_hash) {
        throw new BadRequestException('Defina uma senha antes de ativar o acesso.');
      }
      update.portal_ativo = data.ativo;
    }

    try {
      await this.prisma.clienteContabil.update({ where: { id: clienteId }, data: update });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException('Já existe outro cadastro com acesso usando este CNPJ.');
      }
      throw err;
    }
    this.logger.log(`Acesso ao portal atualizado para cliente ${clienteId}`);
    return { ok: true };
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

  // ─── Certidões da empresa (somente leitura; anexadas pelo Agente Certidões) ──
  private async getCnpjDoCliente(clienteId: string): Promise<string> {
    const c = await this.prisma.clienteContabil.findUnique({
      where: { id: clienteId },
      select: {
        portal_login: true, cpf_cnpj: true,
        lead: { select: { cpf_cnpj: true, ficha_contabil: { select: { cnpj: true } } } },
      },
    });
    // Primeiro valor com 14 dígitos (algum deles pode estar vazio ou ser um CPF)
    const cnpj = [c?.portal_login, c?.cpf_cnpj, c?.lead?.ficha_contabil?.cnpj, c?.lead?.cpf_cnpj]
      .map(v => (v || '').replace(/\D/g, '')).find(v => v.length === 14) || '';
    if (cnpj.length !== 14) throw new NotFoundException('Cliente sem CNPJ cadastrado');
    return cnpj;
  }

  async getCertidoes(token: string) {
    const payload = this.verifyToken(token);
    const cnpj = await this.getCnpjDoCliente(payload.clienteId);
    try {
      const arquivos = await this.drive.listCertidoes(cnpj);
      // Não expõe link do Drive (o cliente não tem acesso a ele): o download passa pela API
      return arquivos.map(a => ({
        id: a.id,
        nome: a.name,
        tipo: a.tipo,
        atualizadaEm: a.modifiedTime || a.createdTime,
      }));
    } catch (err: any) {
      this.logger.warn(`Falha ao listar certidões do cliente ${payload.clienteId}: ${err.message}`);
      return [];
    }
  }

  async baixarCertidao(token: string, fileId: string) {
    const payload = this.verifyToken(token);
    const cnpj = await this.getCnpjDoCliente(payload.clienteId);
    const file = await this.drive.downloadCertidao(fileId, cnpj);
    if (!file) throw new NotFoundException('Certidão não encontrada');
    return file;
  }

  // ─── Contratos sociais e alterações (somente leitura; anexados em Certidões e Contratos) ──
  async getContratos(token: string) {
    const payload = this.verifyToken(token);
    const cnpj = await this.getCnpjDoCliente(payload.clienteId);
    try {
      const arquivos = await this.drive.listContratos(cnpj); // do mais antigo para o mais recente
      return arquivos.map(a => ({
        id: a.id,
        titulo: a.titulo,
        anexadoEm: a.createdTime,
      }));
    } catch (err: any) {
      this.logger.warn(`Falha ao listar contratos do cliente ${payload.clienteId}: ${err.message}`);
      return [];
    }
  }

  async baixarContrato(token: string, fileId: string) {
    const payload = this.verifyToken(token);
    const cnpj = await this.getCnpjDoCliente(payload.clienteId);
    const file = await this.drive.downloadContrato(fileId, cnpj);
    if (!file) throw new NotFoundException('Contrato não encontrado');
    return file;
  }

  // ─── Análise fiscal (PGDAS-D): gerada ao anexar o PGDAS-D em Impostos; só os dados, sem observações internas ──
  async getAnalise(token: string) {
    const payload = this.verifyToken(token);
    const cnpj = await this.getCnpjDoCliente(payload.clienteId);
    const row = await this.prisma.globalSetting.findUnique({ where: { key: `ANALISE_PGDAS:${cnpj}` } });
    if (!row?.value) return null;
    try {
      const dados = JSON.parse(row.value)?.dados ?? null;
      return dados ? { dados, updated_at: row.updated_at } : null;
    } catch { return null; }
  }

  // ─── Impostos mensais (somente leitura; apenas o que foi anexado no Portal do Contador) ──
  async getImpostos(token: string) {
    const payload = this.verifyToken(token);
    const cnpj = await this.getCnpjDoCliente(payload.clienteId);
    try {
      const arquivos = await this.drive.listImpostosPorCnpj(cnpj);
      return arquivos.map(a => ({
        id: a.id,
        nome: a.name,
        tipo: a.tipo,
        competencia: a.competencia,
        atualizadaEm: a.modifiedTime || a.createdTime,
      }));
    } catch (err: any) {
      this.logger.warn(`Falha ao listar impostos do cliente ${payload.clienteId}: ${err.message}`);
      return [];
    }
  }

  async baixarImposto(token: string, fileId: string) {
    const payload = this.verifyToken(token);
    const cnpj = await this.getCnpjDoCliente(payload.clienteId);
    const file = await this.drive.downloadImposto(fileId, cnpj);
    if (!file) throw new NotFoundException('Imposto não encontrado');
    return file;
  }

  // ─── Folha de pagamento (somente leitura; apenas o que foi anexado no Portal do Contador) ──
  async getFolha(token: string) {
    const payload = this.verifyToken(token);
    const cnpj = await this.getCnpjDoCliente(payload.clienteId);
    try {
      const arquivos = await this.drive.listFolhaPorCnpj(cnpj);
      return arquivos.map(a => ({
        id: a.id,
        nome: a.name,
        tipo: a.tipo,
        competencia: a.competencia,
        atualizadaEm: a.modifiedTime || a.createdTime,
      }));
    } catch (err: any) {
      this.logger.warn(`Falha ao listar folha do cliente ${payload.clienteId}: ${err.message}`);
      return [];
    }
  }

  async baixarFolha(token: string, fileId: string) {
    const payload = this.verifyToken(token);
    const cnpj = await this.getCnpjDoCliente(payload.clienteId);
    const file = await this.drive.downloadFolha(fileId, cnpj);
    if (!file) throw new NotFoundException('Documento não encontrado');
    return file;
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
