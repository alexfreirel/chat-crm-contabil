import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { ClientesContabilService } from './clientes-contabil.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard)
@Controller('clientes-contabil')
export class ClientesContabilController {
  constructor(private readonly service: ClientesContabilService) {}

  @Get('stages')
  getStages() { return this.service.getStages(); }

  @Get('service-types')
  getServiceTypes() { return this.service.getServiceTypes(); }

  @Get()
  findAll(
    @Request() req: any,
    @Query('stage') stage?: string,
    @Query('archived') archived?: string,
    @Query('accountantId') accountantId?: string,
    @Query('leadId') leadId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      tenantId: req.user?.tenant_id,
      stage,
      archived: archived === 'true' ? true : archived === 'false' ? false : undefined,
      accountantId,
      leadId,
      search,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get(':id/workspace')
  getWorkspace(@Param('id') id: string, @Request() req: any) {
    return this.service.getWorkspaceData(id, req.user?.tenant_id);
  }

  @Get(':id/events')
  findEvents(@Param('id') id: string, @Request() req: any) {
    return this.service.findEvents(id, req.user?.tenant_id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.service.findOne(id, req.user?.tenant_id);
  }

  @Post()
  @Roles('ADMIN', 'CONTADOR')
  create(
    @Body() body: {
      lead_id: string;
      conversation_id?: string;
      service_type: string;
      regime_tributario?: string;
      cpf_cnpj?: string;
      tipo_pessoa?: string;
      nome_empresa?: string;
      notes?: string;
      priority?: string;
    },
    @Request() req: any,
  ) {
    return this.service.create({
      ...body,
      accountant_id: req.user?.role === 'CONTADOR' ? req.user?.id : undefined,
      tenant_id: req.user?.tenant_id,
    });
  }

  @Post('from-lead/:leadId')
  @Roles('ADMIN', 'CONTADOR', 'OPERADOR', 'ASSISTENTE')
  createFromLead(
    @Param('leadId') leadId: string,
    @Body() body: { service_type: string; conversation_id?: string; regime_tributario?: string; nome_empresa?: string; cpf_cnpj?: string },
    @Request() req: any,
  ) {
    return this.service.createFromLead(leadId, {
      ...body,
      accountant_id: req.user?.role === 'CONTADOR' ? req.user?.id : undefined,
      tenant_id: req.user?.tenant_id,
    });
  }

  @Post(':id/events')
  addEvent(
    @Param('id') id: string,
    @Body() body: { type: string; title: string; description?: string; event_date?: string },
    @Request() req: any,
  ) {
    return this.service.addEvent(id, body, req.user?.tenant_id);
  }

  @Patch(':id/stage')
  updateStage(@Param('id') id: string, @Body('stage') stage: string, @Request() req: any) {
    return this.service.updateStage(id, stage, req.user?.tenant_id);
  }

  @Patch(':id/details')
  updateDetails(
    @Param('id') id: string,
    @Body() body: {
      lead_id?: string;
      service_type?: string;
      regime_tributario?: string;
      nome_empresa?: string;
      competencia_inicio?: string;
      data_encerramento?: string;
      notes?: string;
      priority?: string;
      accountant_id?: string;
      cpf_cnpj?: string;
      tipo_pessoa?: string;
      cep?: string;
      logradouro?: string;
      numero?: string;
      complemento?: string;
      bairro?: string;
      cidade?: string;
      estado?: string;
      google_drive_folder_id?: string;
    },
    @Request() req: any,
  ) {
    return this.service.updateDetails(id, body, req.user?.tenant_id);
  }

  @Patch(':id/archive')
  @Roles('ADMIN', 'CONTADOR')
  archive(@Param('id') id: string, @Body('reason') reason: string, @Request() req: any) {
    return this.service.archive(id, reason, req.user?.tenant_id);
  }

  @Patch(':id/unarchive')
  @Roles('ADMIN', 'CONTADOR')
  unarchive(@Param('id') id: string, @Request() req: any) {
    return this.service.unarchive(id, req.user?.tenant_id);
  }

  @Post('admin/migrar-leads-normalizados')
  @Roles('ADMIN')
  migrarLeadsNormalizados(@Request() req: any) {
    return this.service.migrarLeadsNormalizados(req.user?.tenant_id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(id, req.user?.tenant_id);
  }
}
