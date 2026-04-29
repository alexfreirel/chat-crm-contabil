import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AppService.name);

  constructor(private prisma: PrismaService) {}

  // Migração pontual: garante is_client=true em todos os leads com ClienteContabil ativo.
  // Roda uma vez no boot; idempotente — leads já corretos não são tocados.
  async onApplicationBootstrap() {
    try {
      const rows = await this.prisma.clienteContabil.findMany({
        where: { archived: false },
        select: { lead_id: true },
        distinct: ['lead_id'],
      });
      const leadIds = rows.map((r) => r.lead_id);
      if (leadIds.length === 0) return;

      const result = await this.prisma.lead.updateMany({
        where: { id: { in: leadIds }, is_client: false },
        data: { is_client: true, became_client_at: new Date() },
      });

      if (result.count > 0) {
        this.logger.log(`[BOOT-MIGRATE] ${result.count} lead(s) marcados como is_client=true (clientes contábeis existentes).`);
      }
    } catch (err) {
      this.logger.warn(`[BOOT-MIGRATE] Falha na migração de is_client: ${(err as any)?.message}`);
    }
  }

  getHello(): string {
    return 'Hello World!';
  }
}
