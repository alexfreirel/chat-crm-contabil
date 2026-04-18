import { Controller, Get, Patch, Post, Body, Param, Request, UseGuards } from '@nestjs/common';
import { FichaContabilService } from './ficha-contabil.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';

@UseGuards(JwtAuthGuard)
@Controller('ficha-contabil')
export class FichaContabilController {
  constructor(private readonly service: FichaContabilService) {}

  @Get(':leadId')
  findByLead(@Param('leadId') leadId: string) {
    return this.service.findByLeadId(leadId);
  }

  @Patch(':leadId')
  upsert(
    @Param('leadId') leadId: string,
    @Body() body: Record<string, any>,
    @Request() req: any,
  ) {
    const filledBy = req.user?.id ? 'manual' : 'ai';
    return this.service.upsert(leadId, body, filledBy);
  }

  @Post(':leadId/finalizar')
  markFinalizado(@Param('leadId') leadId: string) {
    return this.service.markFinalizado(leadId);
  }

  // ── Endpoints públicos (formulário do cliente via WhatsApp) ─────────────────

  @Public()
  @Get('publico/:leadId')
  publicGet(@Param('leadId') leadId: string) {
    return this.service.findByLeadId(leadId);
  }

  @Public()
  @Post('publico/:leadId')
  publicSubmit(
    @Param('leadId') leadId: string,
    @Body() body: Record<string, any>,
  ) {
    return this.service.upsert(leadId, body, 'cliente');
  }
}
