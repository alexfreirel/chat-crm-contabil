import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { decryptValue } from '../common/utils/crypto.util';
import { google, drive_v3, docs_v1 } from 'googleapis';

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Helpers ────────────────────────────────────────────────

  private async getSetting(key: string): Promise<string | null> {
    const row = await this.prisma.globalSetting.findUnique({ where: { key } });
    if (!row?.value) return null;
    return decryptValue(row.value);
  }

  /** Verifica se o Google Drive está configurado */
  async isConfigured(): Promise<boolean> {
    const b64 = await this.getSetting('GDRIVE_SERVICE_ACCOUNT_B64');
    const rootFolder = await this.getSetting('GDRIVE_ROOT_FOLDER_ID');
    return !!(b64 && rootFolder);
  }

  /** Retorna status da configuração */
  async getConfig() {
    const b64 = await this.getSetting('GDRIVE_SERVICE_ACCOUNT_B64');
    const rootFolder = await this.getSetting('GDRIVE_ROOT_FOLDER_ID');
    return {
      configured: !!(b64 && rootFolder),
      hasServiceAccount: !!b64,
      hasRootFolder: !!rootFolder,
      rootFolderId: rootFolder || null,
    };
  }

  /** Cria cliente autenticado do Google (Drive + Docs) */
  private async getAuth() {
    const b64 = await this.getSetting('GDRIVE_SERVICE_ACCOUNT_B64');
    if (!b64) throw new Error('Google Drive não configurado: GDRIVE_SERVICE_ACCOUNT_B64 ausente');

    const credentialsJson = Buffer.from(b64, 'base64').toString('utf8');
    const creds = JSON.parse(credentialsJson);

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: creds.client_email,
        private_key: creds.private_key,
      },
      scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/documents',
      ],
    });

    return auth;
  }

  private async getDriveClient(): Promise<drive_v3.Drive> {
    const auth = await this.getAuth();
    return google.drive({ version: 'v3', auth });
  }

  private async getDocsClient(): Promise<docs_v1.Docs> {
    const auth = await this.getAuth();
    return google.docs({ version: 'v1', auth });
  }

  // ── Pastas ─────────────────────────────────────────────────

  /**
   * Cria ou retorna a pasta do Lead no Google Drive.
   * Formato: "Nome do Lead (últimos 4 dígitos do ID)"
   */
  async ensureLeadFolder(leadId: string, leadName: string): Promise<string> {
    // Verificar se já existe no banco
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { google_drive_folder_id: true },
    });
    if (lead?.google_drive_folder_id) return lead.google_drive_folder_id;

    const rootFolder = await this.getSetting('GDRIVE_ROOT_FOLDER_ID');
    if (!rootFolder) throw new Error('GDRIVE_ROOT_FOLDER_ID não configurado');

    const drive = await this.getDriveClient();
    const suffix = leadId.slice(-4);
    const folderName = `${leadName} (${suffix})`;

    // Verificar se pasta já existe no Drive (por nome)
    const existing = await drive.files.list({
      q: `name='${folderName.replace(/'/g, "\\'")}' and '${rootFolder}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id,name)',
      spaces: 'drive',
    });

    let folderId: string;
    if (existing.data.files?.length) {
      folderId = existing.data.files[0].id!;
    } else {
      const res = await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [rootFolder],
        },
        fields: 'id',
      });
      folderId = res.data.id!;
      this.logger.log(`Pasta do lead criada no Drive: ${folderName} (${folderId})`);
    }

    // Salvar no banco
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { google_drive_folder_id: folderId },
    });

    return folderId;
  }

  /**
   * Cria ou retorna a subpasta do caso dentro da pasta do Lead.
   * Formato: "Área Jurídica - Número do Caso"
   */
  async ensureCaseFolder(
    caseId: string,
    leadId: string,
    label: string,
  ): Promise<string> {
    // Verificar se já existe no banco
    const legalCase = await this.prisma.legalCase.findUnique({
      where: { id: caseId },
      select: { google_drive_folder_id: true },
    });
    if (legalCase?.google_drive_folder_id) return legalCase.google_drive_folder_id;

    // Garantir que a pasta do lead existe
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { name: true },
    });
    const leadFolderId = await this.ensureLeadFolder(leadId, lead?.name || 'Lead');

    const drive = await this.getDriveClient();

    // Verificar se subpasta já existe
    const existing = await drive.files.list({
      q: `name='${label.replace(/'/g, "\\'")}' and '${leadFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id,name)',
      spaces: 'drive',
    });

    let folderId: string;
    if (existing.data.files?.length) {
      folderId = existing.data.files[0].id!;
    } else {
      const res = await drive.files.create({
        requestBody: {
          name: label,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [leadFolderId],
        },
        fields: 'id',
      });
      folderId = res.data.id!;
      this.logger.log(`Pasta do caso criada no Drive: ${label} (${folderId})`);
    }

    // Salvar no banco
    await this.prisma.legalCase.update({
      where: { id: caseId },
      data: { google_drive_folder_id: folderId },
    });

    return folderId;
  }

  // ── Google Docs ────────────────────────────────────────────

  /**
   * Cria um Google Doc dentro da pasta especificada.
   * Retorna { docId, docUrl }
   */
  async createDoc(
    title: string,
    folderId: string,
    initialHtml?: string,
  ): Promise<{ docId: string; docUrl: string }> {
    const drive = await this.getDriveClient();

    // Criar Doc vazio no Drive (dentro da pasta)
    const res = await drive.files.create({
      requestBody: {
        name: title,
        mimeType: 'application/vnd.google-apps.document',
        parents: [folderId],
      },
      fields: 'id,webViewLink',
    });

    const docId = res.data.id!;
    const docUrl = res.data.webViewLink!;

    // Se há conteúdo HTML inicial, inserir via Docs API
    if (initialHtml) {
      await this.insertHtmlContent(docId, initialHtml);
    }

    this.logger.log(`Google Doc criado: ${title} (${docId})`);
    return { docId, docUrl };
  }

  /**
   * Insere conteúdo de texto no Google Doc.
   * Converte HTML básico para requests da Docs API.
   */
  private async insertHtmlContent(docId: string, html: string) {
    const docs = await this.getDocsClient();

    // Extrair texto puro do HTML (strip tags simples)
    const plainText = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();

    if (!plainText) return;

    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: plainText,
            },
          },
        ],
      },
    });
  }

  /**
   * Lê o conteúdo de um Google Doc e retorna como texto.
   */
  async getDocContent(docId: string): Promise<string> {
    const docs = await this.getDocsClient();

    const doc = await docs.documents.get({ documentId: docId });
    const body = doc.data.body;
    if (!body?.content) return '';

    // Extrair texto de todos os elementos estruturais
    let text = '';
    for (const element of body.content) {
      if (element.paragraph) {
        for (const el of element.paragraph.elements || []) {
          if (el.textRun?.content) {
            text += el.textRun.content;
          }
        }
      }
    }

    return text.trim();
  }

  /**
   * Exporta Google Doc como PDF (retorna Buffer).
   */
  async exportAsPdf(docId: string): Promise<Buffer> {
    const drive = await this.getDriveClient();

    const res = await drive.files.export(
      { fileId: docId, mimeType: 'application/pdf' },
      { responseType: 'arraybuffer' },
    );

    return Buffer.from(res.data as ArrayBuffer);
  }

  /**
   * Compartilha arquivo/pasta com um email.
   */
  async shareWithEmail(
    fileId: string,
    email: string,
    role: 'reader' | 'writer' | 'commenter' = 'writer',
  ): Promise<void> {
    const drive = await this.getDriveClient();

    await drive.permissions.create({
      fileId,
      requestBody: {
        type: 'user',
        role,
        emailAddress: email,
      },
      sendNotificationEmail: false,
    });

    this.logger.log(`Compartilhado ${fileId} com ${email} (${role})`);
  }

  // ── Teste de Conexão ───────────────────────────────────────

  /**
   * Testa a conexão com Google Drive listando a root folder.
   */
  async testConnection(): Promise<{ ok: boolean; message: string; folderName?: string }> {
    try {
      const rootFolder = await this.getSetting('GDRIVE_ROOT_FOLDER_ID');
      if (!rootFolder) {
        return { ok: false, message: 'GDRIVE_ROOT_FOLDER_ID não configurado' };
      }

      const drive = await this.getDriveClient();
      const res = await drive.files.get({
        fileId: rootFolder,
        fields: 'id,name,mimeType',
      });

      if (res.data.mimeType !== 'application/vnd.google-apps.folder') {
        return { ok: false, message: 'O ID informado não é uma pasta do Google Drive' };
      }

      return {
        ok: true,
        message: `Conexão OK. Pasta raiz: ${res.data.name}`,
        folderName: res.data.name || undefined,
      };
    } catch (err: any) {
      this.logger.error(`Teste de conexão Google Drive falhou: ${err.message}`);
      return { ok: false, message: `Erro: ${err.message}` };
    }
  }
}
