import {
  Controller, Get, Post, Delete, Body, Param, Query,
  Request, UseGuards, UseInterceptors, UploadedFile, Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { DocumentosContabilService } from './documentos-contabil.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const FIFTY_MB = 50 * 1024 * 1024;

@UseGuards(JwtAuthGuard)
@Controller('documentos-contabil')
export class DocumentosContabilController {
  constructor(private readonly service: DocumentosContabilService) {}

  @Get('folders')
  getFolders() { return this.service.getFolders(); }

  @Get('cliente/:clienteId')
  findByCliente(
    @Param('clienteId') clienteId: string,
    @Query('folder') folder?: string,
    @Request() req?: any,
  ) {
    return this.service.findByCliente(clienteId, folder, req?.user?.tenant_id);
  }

  @Get('cliente/:clienteId/checklist')
  getChecklist(@Param('clienteId') clienteId: string) {
    return this.service.getChecklist(clienteId);
  }

  /** Upload de arquivo: multipart/form-data */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: FIFTY_MB },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { cliente_id: string; folder?: string; description?: string; competencia?: string },
    @Request() req: any,
  ) {
    return this.service.upload(file, {
      ...body,
      uploaded_by_id: req.user?.id,
      tenant_id: req.user?.tenant_id,
    });
  }

  /** Download direto de um documento */
  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const { buffer, contentType, filename } = await this.service.getDownload(id, req.user?.tenant_id);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  /** URL de download (para compartilhamento) — retorna a URL da API */
  @Post(':id/share')
  async share(@Param('id') id: string, @Request() req: any) {
    // Em produção, gerar um token temporário. Por ora retornar a URL da API.
    const baseUrl = process.env.API_URL || `http://localhost:44001/api`;
    const downloadUrl = `${baseUrl}/documentos-contabil/${id}/download`;
    return { url: downloadUrl, expires_in: '24h' };
  }

  @Post()
  create(@Body() body: {
    cliente_id: string; folder: string; name: string;
    original_name: string; s3_key: string;
    mime_type?: string; size?: number; description?: string; competencia?: string;
  }, @Request() req: any) {
    return this.service.create({
      ...body,
      uploaded_by_id: req.user?.id,
      tenant_id: req.user?.tenant_id,
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(id, req.user?.tenant_id);
  }
}
