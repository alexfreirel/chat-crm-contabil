import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { LeadsModule } from './leads/leads.module';
import { ConversationsModule } from './conversations/conversations.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { MessagesModule } from './messages/messages.module';
import { GatewayModule } from './gateway/gateway.module';
import { TasksModule } from './tasks/tasks.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { SettingsModule } from './settings/settings.module';
import { InboxesModule } from './inboxes/inboxes.module';
import { SectorsModule } from './sectors/sectors.module';
import { MediaModule } from './media/media.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { TransferAudioModule } from './transfer-audio/transfer-audio.module';
import { CalendarModule } from './calendar/calendar.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ClicksignModule } from './clicksign/clicksign.module';
import { S3Module } from './s3/s3.module';
import { McpModule } from './mcp/mcp.module';
import { AutomationsModule } from './automations/automations.module';
import { FollowupModule } from './followup/followup.module';
import { GoogleDriveModule } from './google-drive/google-drive.module';
import { InternModule } from './intern/intern.module';
import { AdminBotModule } from './admin-bot/admin-bot.module';
import { FinanceiroModule } from './financeiro/financeiro.module';
import { PaymentGatewayModule } from './payment-gateway/payment-gateway.module';
import { NotaFiscalModule } from './nota-fiscal/nota-fiscal.module';

// ─── Módulos Contábeis ────────────────────────
import { ClientesContabilModule } from './clientes-contabil/clientes-contabil.module';
import { FichaContabilModule } from './ficha-contabil/ficha-contabil.module';
import { ObrigacoesModule } from './obrigacoes/obrigacoes.module';
import { DocumentosContabilModule } from './documentos-contabil/documentos-contabil.module';
import { HonorariosContabilModule } from './honorarios-contabil/honorarios-contabil.module';
import { TemplatesContabilModule } from './templates-contabil/templates-contabil.module';

import { HealthController } from './common/controllers/health.controller';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      useFactory: () => ({
        prefix: process.env.BULL_PREFIX || 'bull',
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          retryStrategy(times) {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
        },
      }),
    }),
    // ─── Core ────────────────────────────────────
    PrismaModule,
    S3Module,
    UsersModule,
    AuthModule,
    LeadsModule,
    ConversationsModule,
    WebhooksModule,
    MessagesModule,
    GatewayModule,
    TasksModule,
    WhatsappModule,
    SettingsModule,
    InboxesModule,
    SectorsModule,
    MediaModule,
    AnalyticsModule,
    TransferAudioModule,
    CalendarModule,
    DashboardModule,
    ClicksignModule,
    // ─── IA / Automações ─────────────────────────
    McpModule,
    AutomationsModule,
    FollowupModule,
    InternModule,
    AdminBotModule,
    // ─── Módulos Contábeis ───────────────────────
    ClientesContabilModule,
    FichaContabilModule,
    ObrigacoesModule,
    DocumentosContabilModule,
    HonorariosContabilModule,
    TemplatesContabilModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: PrismaExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
