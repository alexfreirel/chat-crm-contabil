import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FichaTrabalhistaService } from './ficha-trabalhista.service';
import { UpdateFichaDto } from './dto/update-ficha.dto';

@Controller('ficha-trabalhista')
export class FichaTrabalhistaController {
  constructor(private readonly service: FichaTrabalhistaService) {}

  // ─── Endpoints autenticados (painel admin) ────────────────────

  @UseGuards(JwtAuthGuard)
  @Get(':leadId')
  async findOrCreate(@Param('leadId') leadId: string) {
    return this.service.findOrCreate(leadId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':leadId')
  async updatePartial(
    @Param('leadId') leadId: string,
    @Body() dto: UpdateFichaDto,
  ) {
    return this.service.updatePartial(leadId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':leadId/finalize')
  async finalize(@Param('leadId') leadId: string) {
    return this.service.finalize(leadId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':leadId/fill-from-memory')
  async fillFromMemory(@Param('leadId') leadId: string) {
    return this.service.fillFromMemory(leadId);
  }

  // ─── Endpoints públicos (formulário externo via link WhatsApp) ─

  @Get(':leadId/public')
  async publicGet(@Param('leadId') leadId: string) {
    const ficha = await this.service.findOrCreate(leadId);
    // Retornar dados mínimos necessários para o formulário público
    return {
      id: ficha.id,
      lead_id: ficha.lead_id,
      data: ficha.data,
      finalizado: ficha.finalizado,
      completion_pct: ficha.completion_pct,
    };
  }

  @Patch(':leadId/public')
  async publicUpdate(
    @Param('leadId') leadId: string,
    @Body() dto: UpdateFichaDto,
  ) {
    return this.service.updatePartial(leadId, dto, 'lead');
  }

  @Post(':leadId/public/finalize')
  async publicFinalize(@Param('leadId') leadId: string) {
    return this.service.finalize(leadId);
  }
}
