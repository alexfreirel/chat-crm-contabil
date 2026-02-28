import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@crm/shared';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    this.logger.log('Iniciando serviço de Banco de Dados. Aguardando conexão com VPS...');
    let connected = false;
    let attempts = 0;

    while (!connected) {
      try {
        attempts++;
        this.logger.log(`Tentativa ${attempts} de conectar ao Banco de Dados (69.62.93.186:45432)...`);
        
        // Timeout de conexão curto para falhar rápido e tentar de novo
        await this.$connect();
        
        connected = true;
        this.logger.log('✅ CONECTADO ao Banco de Dados (VPS) com sucesso!');
      } catch (err) {
        this.logger.error(
          `❌ Erro na tentativa ${attempts}: ${err.message}. Nova tentativa em 5 segundos...`,
        );
        // Espera 5 segundos antes da próxima tentativa
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }
}
