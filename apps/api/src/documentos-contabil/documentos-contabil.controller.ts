import { Controller, Get, Post, Delete, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { DocumentosContabilService } from './documentos-contabil.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

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

  @Post()
  create(@Body() body: {
    cliente_id: string; folder: string; name: string;
    original_name: string; s3_key: string;
    mime_type?: string; size?: number; description?: string;
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
