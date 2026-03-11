import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MediaS3Service } from '../media/s3.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { ChatGateway } from '../gateway/chat.gateway';
import { ContractsService, ContratoVariaveis } from '../contracts/contracts.service';

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface ClicksignDocument {
  key: string;
  path: string;
  status: string;
  [k: string]: unknown;
}

interface ClicksignSigner {
  key: string;
  [k: string]: unknown;
}

interface ClicksignList {
  document_key: string;
  signer_key: string;
  request_signature_key: string;
  [k: string]: unknown;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ClicksignService {
  private readonly logger = new Logger(ClicksignService.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly webhookToken: string;
  private readonly publicApiUrl: string;

  constructor(
    private prisma: PrismaService,
    private s3: MediaS3Service,
    private whatsapp: WhatsappService,
    private chatGateway: ChatGateway,
    private contracts: ContractsService,
  ) {
    this.baseUrl =
      (process.env.CLICKSIGN_BASE_URL ?? 'https://sandbox.clicksign.com').replace(/\/$/, '');
    this.token = process.env.CLICKSIGN_API_TOKEN ?? '';
    this.webhookToken = process.env.CLICKSIGN_WEBHOOK_TOKEN ?? '';
    this.publicApiUrl = process.env.PUBLIC_API_URL ?? '';
  }

  // ── Utilitário: faz chamadas HTTP para a API Clicksign ─────────────────────

  private async clicksignFetch<T>(
    method: string,
    path: string,
    body?: object,
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}?access_token=${this.token}`;
    const init: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    };

    const res = await fetch(url, init);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new InternalServerErrorException(
        `Clicksign API ${method} ${path} → ${res.status}: ${text}`,
      );
    }

    // 204 No Content (ex.: download redireciona) — retornar objeto vazio
    if (res.status === 204) return {} as T;

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) return res.json() as Promise<T>;

    // Download binário — retornar o Buffer no campo "buffer"
    const arrayBuffer = await res.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer) } as unknown as T;
  }

  // ── Passo 1: upload do DOCX ────────────────────────────────────────────────

  private async uploadDocument(
    buffer: Buffer,
    filename: string,
  ): Promise<string> {
    const base64 = buffer.toString('base64');
    const ext = filename.endsWith('.pdf') ? 'pdf' : 'docx';
    const mimeType =
      ext === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    const payload = {
      document: {
        path: `/${filename}`,
        content_base64: `data:${mimeType};base64,${base64}`,
      },
    };

    const result = await this.clicksignFetch<{ document: ClicksignDocument }>(
      'POST',
      '/documents',
      payload,
    );
    const key = result?.document?.key;
    if (!key) throw new InternalServerErrorException('Clicksign não retornou document.key');
    this.logger.log(`[Clicksign] Documento criado: ${key}`);
    return key;
  }

  // ── Passo 2: criar signatário (SMS + Selfie) ───────────────────────────────

  private async createSigner(
    name: string,
    email: string,
    phone: string,
  ): Promise<string> {
    // phone: +5511999999999 → formatar sem +
    const phoneNumber = phone.replace(/\D/g, '');

    const payload = {
      signer: {
        name,
        email,
        phone_number: `+${phoneNumber}`,
        auths: ['sms'],
        selfie_enabled: true,
        has_documentation: false,
      },
    };

    const result = await this.clicksignFetch<{ signer: ClicksignSigner }>(
      'POST',
      '/signers',
      payload,
    );
    const key = result?.signer?.key;
    if (!key) throw new InternalServerErrorException('Clicksign não retornou signer.key');
    this.logger.log(`[Clicksign] Signatário criado: ${key}`);
    return key;
  }

  // ── Passo 3: associar signatário ao documento ──────────────────────────────

  private async addSignerToDocument(
    documentKey: string,
    signerKey: string,
  ): Promise<string> {
    const payload = {
      list: {
        document_key: documentKey,
        signer_key: signerKey,
        sign_as: 'party',
        refusable: false,
        message:
          'Por favor, assine o contrato de prestação de serviços advocatícios.',
        delivery: 'link',
      },
    };

    const result = await this.clicksignFetch<{ list: ClicksignList }>(
      'POST',
      '/lists',
      payload,
    );
    const requestKey = result?.list?.request_signature_key;
    if (!requestKey)
      throw new InternalServerErrorException('Clicksign não retornou request_signature_key');
    this.logger.log(`[Clicksign] Signatário adicionado, request_key: ${requestKey}`);
    return requestKey;
  }

  // ── Método principal: solicitar assinatura ─────────────────────────────────

  async requestSignature(params: {
    conversationId: string;
    variaveis: ContratoVariaveis;
  }): Promise<{ signingUrl: string }> {
    const { conversationId, variaveis } = params;

    if (!this.token)
      throw new BadRequestException('CLICKSIGN_API_TOKEN não configurado');

    // Busca dados da conversa
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { lead: true },
    });
    if (!convo?.lead) throw new BadRequestException('Conversa inválida');

    const lead = convo.lead;
    const clientName = variaveis.NOME_CONTRATANTE || lead.name || 'Cliente';
    const clientPhone = lead.phone;
    const clientEmail = (lead as any).email ?? `${lead.phone.replace(/\D/g, '')}@noreply.placeholder`;
    const instanceName = convo.instance_name ?? undefined;

    // 1. Gerar buffer do documento
    const buffer = await this.contracts.generateBuffer(variaveis);
    const safeName = clientName.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
    const filename = `Contrato_Trabalhista_${safeName}_${Date.now()}.docx`;

    // 2. Upload para Clicksign
    const documentKey = await this.uploadDocument(buffer, filename);

    // 3. Criar signatário
    const signerKey = await this.createSigner(clientName, clientEmail, clientPhone);

    // 4. Associar signatário
    const requestSignatureKey = await this.addSignerToDocument(documentKey, signerKey);

    // 5. Montar URL de assinatura
    const signingUrl = `${this.baseUrl}/sign/${requestSignatureKey}`;

    // 6. Persistir no banco
    const signature = await this.prisma.contractSignature.create({
      data: {
        lead_id: lead.id,
        conversation_id: conversationId,
        cs_document_key: documentKey,
        cs_signer_key: signerKey,
        cs_request_signature_key: requestSignatureKey,
        signing_url: signingUrl,
        status: 'PENDENTE',
      },
    });
    this.logger.log(`[Clicksign] ContractSignature criado: ${signature.id}`);

    // 7. Enviar URL via WhatsApp
    const msg =
      `📝 *Contrato de Honorários Advocatícios*\n\n` +
      `Olá, ${clientName.split(' ')[0]}! Seu contrato está pronto para assinatura digital.\n\n` +
      `🔒 A assinatura é segura e válida juridicamente (Lei 14.063/2020).\n` +
      `📱 Você precisará confirmar sua identidade via SMS e selfie.\n\n` +
      `✍️ *Clique aqui para assinar:*\n${signingUrl}`;

    try {
      await this.whatsapp.sendText(clientPhone, msg, instanceName);
      this.logger.log(`[Clicksign] Link enviado via WhatsApp para ${clientPhone}`);
    } catch (e: any) {
      this.logger.warn(`[Clicksign] Falha ao enviar WhatsApp: ${e.message}`);
    }

    return { signingUrl };
  }

  // ── Verificar assinatura HMAC do webhook ──────────────────────────────────

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookToken) {
      this.logger.warn('[Clicksign] CLICKSIGN_WEBHOOK_TOKEN não configurado — verificação ignorada');
      return true;
    }
    const expected = crypto
      .createHmac('sha256', this.webhookToken)
      .update(payload)
      .digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  // ── Processar evento do webhook ───────────────────────────────────────────

  async handleWebhookEvent(payload: any): Promise<void> {
    // Clicksign envia diferentes estruturas — suportar v1 e v2
    const eventName: string =
      payload?.event?.name ?? payload?.event ?? '';
    const document =
      payload?.event?.data?.document ?? payload?.document ?? payload?.data?.document ?? {};

    const documentKey: string = document?.key ?? '';
    const documentStatus: string = document?.status ?? '';

    this.logger.log(
      `[Clicksign] Webhook recebido — event: ${eventName}, doc: ${documentKey}, status: ${documentStatus}`,
    );

    // Só processar quando o documento foi totalmente assinado (status "closed")
    if (documentStatus !== 'closed') {
      this.logger.debug(`[Clicksign] Status ${documentStatus} ignorado`);
      return;
    }

    // Buscar o registro no banco
    const sig = await this.prisma.contractSignature.findUnique({
      where: { cs_document_key: documentKey },
    });
    if (!sig) {
      this.logger.warn(`[Clicksign] Documento ${documentKey} não encontrado no banco`);
      return;
    }
    if (sig.status === 'ASSINADO') {
      this.logger.debug(`[Clicksign] Documento ${documentKey} já processado`);
      return;
    }

    // Buscar conversa + lead
    const convo = await this.prisma.conversation.findUnique({
      where: { id: sig.conversation_id },
      include: { lead: true },
    });
    if (!convo?.lead) {
      this.logger.warn(`[Clicksign] Conversa ${sig.conversation_id} inválida`);
      return;
    }

    const leadName = convo.lead.name ?? 'Cliente';
    const clientPhone = convo.lead.phone;
    const instanceName = convo.instance_name ?? undefined;
    const signedAt = new Date();

    // Download do PDF assinado via Clicksign
    let signedS3Key: string | undefined;
    try {
      const dlResult = await this.clicksignFetch<{ buffer?: Buffer }>(
        'GET',
        `/documents/${documentKey}/download`,
      );

      if (dlResult?.buffer && dlResult.buffer.length > 0) {
        signedS3Key = `contracts-signed/${sig.id}.pdf`;
        await this.s3.uploadBuffer(signedS3Key, dlResult.buffer, 'application/pdf');
        this.logger.log(`[Clicksign] PDF assinado salvo: ${signedS3Key}`);
      }
    } catch (e: any) {
      this.logger.warn(`[Clicksign] Falha ao baixar PDF assinado: ${e.message}`);
    }

    // Atualizar status no banco
    await this.prisma.contractSignature.update({
      where: { id: sig.id },
      data: {
        status: 'ASSINADO',
        signed_at: signedAt,
        ...(signedS3Key ? { signed_s3_key: signedS3Key } : {}),
      },
    });

    // Enviar PDF assinado ao cliente via WhatsApp (se disponível)
    if (signedS3Key && this.publicApiUrl) {
      try {
        // URL pública que serve o arquivo do S3 via endpoint /media/signed/{id}
        const pdfUrl = `${this.publicApiUrl}/contracts/clicksign/signed-pdf/${sig.id}`;
        await this.whatsapp.sendMedia(
          clientPhone,
          'document',
          pdfUrl,
          `📄 Contrato assinado — ${leadName}`,
          instanceName,
        );
        this.logger.log(`[Clicksign] PDF assinado enviado para ${clientPhone}`);
      } catch (e: any) {
        this.logger.warn(`[Clicksign] Falha ao enviar PDF: ${e.message}`);
      }
    }

    // Notificar atendente via WebSocket
    try {
      this.chatGateway.server
        ?.to(sig.conversation_id)
        .emit('contract:signed', {
          conversationId: sig.conversation_id,
          leadName,
          signedAt: signedAt.toISOString(),
        });
      this.logger.log(`[Clicksign] Evento contract:signed emitido para sala ${sig.conversation_id}`);
    } catch (e: any) {
      this.logger.warn(`[Clicksign] Falha ao emitir WebSocket: ${e.message}`);
    }
  }

  // ── Servir PDF assinado do S3 ─────────────────────────────────────────────

  async getSignedPdfStream(signatureId: string) {
    const sig = await this.prisma.contractSignature.findUnique({
      where: { id: signatureId },
    });
    if (!sig?.signed_s3_key)
      throw new BadRequestException('PDF assinado não disponível');

    return this.s3.getObjectStream(sig.signed_s3_key);
  }
}
