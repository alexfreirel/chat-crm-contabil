import { Controller, Get, Post, Patch, Delete, Body, Param, Request, ForbiddenException } from '@nestjs/common';
import { AutomationsService } from './automations.service';

@Controller('automations')
export class AutomationsController {
  constructor(private readonly automationsService: AutomationsService) {}

  @Get()
  findAll(@Request() req: any) {
    return this.automationsService.findAll(req.user.tenantId);
  }

  @Post()
  create(@Request() req: any, @Body() body: { name: string; trigger: string; action: string; action_value: string }) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException('Apenas administradores');
    return this.automationsService.create({ ...body, tenant_id: req.user.tenantId });
  }

  @Patch(':id')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { name?: string; trigger?: string; action?: string; action_value?: string; enabled?: boolean },
  ) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException('Apenas administradores');
    return this.automationsService.update(id, body);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException('Apenas administradores');
    return this.automationsService.remove(id);
  }
}
