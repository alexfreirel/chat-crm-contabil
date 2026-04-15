import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { TemplatesContabilService } from './templates-contabil.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard)
@Controller('templates-contabil')
export class TemplatesContabilController {
  constructor(private readonly service: TemplatesContabilService) {}

  @Get('tipos')
  getTipos() { return this.service.getTipos(); }

  @Get()
  findAll(@Request() req: any, @Query('tipo') tipo?: string) {
    return this.service.findAll(req.user?.tenant_id, tipo);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() body: { name: string; tipo: string; description?: string; content_json?: any; variables?: string[]; is_global?: boolean }, @Request() req: any) {
    return this.service.create({
      ...body,
      tenant_id: req.user?.tenant_id,
      created_by_id: req.user?.id,
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { name?: string; tipo?: string; description?: string; content_json?: any; variables?: string[] }) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/use')
  incrementUsage(@Param('id') id: string) {
    return this.service.incrementUsage(id);
  }
}
