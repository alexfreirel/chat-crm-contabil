import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLandingPageDto } from './dto/create-landing-page.dto';
import { TrackEventDto } from './dto/track-event.dto';

@Injectable()
export class LandingPagesService {
  constructor(private prisma: PrismaService) {}

  findAll(tenant_id?: string) {
    return this.prisma.landingPage.findMany({
      where: tenant_id ? { tenant_id } : undefined,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        title: true,
        slug: true,
        is_published: true,
        whatsapp_number: true,
        gtm_id: true,
        views_count: true,
        clicks_count: true,
        tenant_id: true,
        created_at: true,
        updated_at: true,
      },
    });
  }

  async findOne(id: string) {
    const page = await this.prisma.landingPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Landing page não encontrada');
    return page;
  }

  async findBySlug(slug: string) {
    const page = await this.prisma.landingPage.findUnique({
      where: { slug },
      select: {
        id: true,
        title: true,
        slug: true,
        is_published: true,
        content: true,
        whatsapp_number: true,
        gtm_id: true,
      },
    });
    if (!page || !page.is_published) throw new NotFoundException('Página não encontrada');
    return page;
  }

  create(dto: CreateLandingPageDto, tenant_id?: string) {
    const { content, ...rest } = dto;
    return this.prisma.landingPage.create({
      data: {
        ...rest,
        content: content as object,
        tenant_id: tenant_id || null,
      },
    });
  }

  async update(id: string, dto: Partial<CreateLandingPageDto>) {
    await this.findOne(id);
    const { content, ...rest } = dto;
    return this.prisma.landingPage.update({
      where: { id },
      data: {
        ...rest,
        ...(content !== undefined && { content: content as object }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.landingPage.delete({ where: { id } });
  }

  async trackEvent(id: string, dto: TrackEventDto) {
    // Insert event
    await this.prisma.lpEvent.create({
      data: {
        landing_page_id: id,
        event_type: dto.event_type,
        visitor_id: dto.visitor_id,
        utm_source: dto.utm_source,
        utm_medium: dto.utm_medium,
        utm_campaign: dto.utm_campaign,
        utm_term: dto.utm_term,
        utm_content: dto.utm_content,
        gclid: dto.gclid,
        referrer: dto.referrer,
      },
    });

    // Atomic counter increment
    if (dto.event_type === 'view') {
      await this.prisma.$executeRaw`
        UPDATE "LandingPage" SET views_count = views_count + 1 WHERE id = ${id}
      `;
    } else if (dto.event_type === 'whatsapp_click') {
      await this.prisma.$executeRaw`
        UPDATE "LandingPage" SET clicks_count = clicks_count + 1 WHERE id = ${id}
      `;
    }

    return { ok: true };
  }

  async getAnalytics(id: string) {
    const page = await this.findOne(id);

    // Last 30 days events
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const events = await this.prisma.lpEvent.findMany({
      where: { landing_page_id: id, created_at: { gte: thirtyDaysAgo } },
      select: {
        event_type: true,
        utm_source: true,
        utm_medium: true,
        utm_campaign: true,
        gclid: true,
        created_at: true,
      },
      orderBy: { created_at: 'asc' },
    });

    const views = events.filter((e) => e.event_type === 'view');
    const clicks = events.filter((e) => e.event_type === 'whatsapp_click');

    // Group by source
    const sourceMap: Record<string, { views: number; clicks: number }> = {};
    for (const e of events) {
      const source = e.gclid
        ? 'google_ads'
        : e.utm_source
          ? e.utm_source
          : 'organico';
      const medium = e.utm_medium || (e.gclid ? 'cpc' : null);
      const key = `${source}|${medium || ''}|${e.utm_campaign || ''}`;
      if (!sourceMap[key]) sourceMap[key] = { views: 0, clicks: 0 };
      if (e.event_type === 'view') sourceMap[key].views++;
      else sourceMap[key].clicks++;
    }

    const by_source = Object.entries(sourceMap).map(([key, counts]) => {
      const [source, medium, campaign] = key.split('|');
      return { source, medium: medium || null, campaign: campaign || null, ...counts };
    });

    // Group by day (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentEvents = events.filter((e) => e.created_at >= sevenDaysAgo);

    const dayMap: Record<string, { views: number; clicks: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dayMap[d.toISOString().slice(0, 10)] = { views: 0, clicks: 0 };
    }
    for (const e of recentEvents) {
      const day = e.created_at.toISOString().slice(0, 10);
      if (dayMap[day]) {
        if (e.event_type === 'view') dayMap[day].views++;
        else dayMap[day].clicks++;
      }
    }
    const by_day = Object.entries(dayMap).map(([date, counts]) => ({ date, ...counts }));

    const conversionRate =
      page.views_count > 0
        ? ((page.clicks_count / page.views_count) * 100).toFixed(1) + '%'
        : '0%';

    return {
      total_views: page.views_count,
      total_clicks: page.clicks_count,
      conversion_rate: conversionRate,
      by_source,
      by_day,
    };
  }
}
