import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@crm/shared';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    let retries = 5;
    while (retries > 0) {
      try {
        await this.$connect();
        break;
      } catch (err) {
        retries--;
        console.error(`Falha ao conectar ao Banco de Dados (VPS). Tentando novamente em 5s... (${retries} tentativas restando)`);
        if (retries === 0) throw err;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
}
