import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { LandingPagesService } from './landing-pages.service';
import { CreateLandingPageDto } from './dto/create-landing-page.dto';
import { TrackEventDto } from './dto/track-event.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('landing-pages')
export class LandingPagesController {
  constructor(private readonly service: LandingPagesService) {}

  // ── Public endpoints (no auth) ───────────────────────────────────

  @Get('public/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }

  @Post(':id/track')
  trackEvent(@Param('id') id: string, @Body() dto: TrackEventDto) {
    return this.service.trackEvent(id, dto);
  }

  // ── Auth-protected endpoints ─────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Request() req: any) {
    return this.service.findAll(req.user?.tenant_id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() dto: CreateLandingPageDto, @Request() req: any) {
    return this.service.create(dto, req.user?.tenant_id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateLandingPageDto>) {
    return this.service.update(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/analytics')
  getAnalytics(@Param('id') id: string) {
    return this.service.getAnalytics(id);
  }
}
