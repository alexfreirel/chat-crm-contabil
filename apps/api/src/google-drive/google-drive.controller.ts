import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { GoogleDriveService } from './google-drive.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { encryptValue, isSensitiveKey } from '../common/utils/crypto.util';

@UseGuards(JwtAuthGuard)
@Controller('google-drive')
export class GoogleDriveController {
  constructor(
    private readonly driveService: GoogleDriveService,
    private readonly prisma: PrismaService,
  ) {}

  /** GET /google-drive/config — status da configuração (acessível a todos autenticados) */
  @Get('config')
  getConfig() {
    return this.driveService.getConfig();
  }

  /** POST /google-drive/config — salvar service account + root folder */
  @Post('config')
  @Roles('ADMIN')
  async saveConfig(
    @Body() body: { serviceAccountJson?: string; rootFolderId?: string },
  ) {
    if (body.serviceAccountJson) {
      // Validar que é JSON válido
      try {
        const parsed = JSON.parse(body.serviceAccountJson);
        if (!parsed.client_email || !parsed.private_key) {
          throw new BadRequestException(
            'JSON da service account deve conter client_email e private_key',
          );
        }
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException('JSON da service account inválido');
      }

      // Converter para base64 e salvar
      const b64 = Buffer.from(body.serviceAccountJson).toString('base64');
      const encryptedValue = isSensitiveKey('GDRIVE_SERVICE_ACCOUNT_B64')
        ? encryptValue(b64)
        : b64;

      await this.prisma.globalSetting.upsert({
        where: { key: 'GDRIVE_SERVICE_ACCOUNT_B64' },
        update: { value: encryptedValue },
        create: { key: 'GDRIVE_SERVICE_ACCOUNT_B64', value: encryptedValue },
      });
    }

    if (body.rootFolderId) {
      await this.prisma.globalSetting.upsert({
        where: { key: 'GDRIVE_ROOT_FOLDER_ID' },
        update: { value: body.rootFolderId },
        create: { key: 'GDRIVE_ROOT_FOLDER_ID', value: body.rootFolderId },
      });
    }

    return this.driveService.getConfig();
  }

  /** POST /google-drive/test — testar conexão */
  @Post('test')
  @Roles('ADMIN')
  testConnection() {
    return this.driveService.testConnection();
  }
}
