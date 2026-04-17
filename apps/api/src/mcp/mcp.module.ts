import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { McpController } from './mcp.controller';
import { McpToolsService } from './mcp-tools.service';
import { LeadsModule } from '../leads/leads.module';
import { ClientesContabilModule } from '../clientes-contabil/clientes-contabil.module';
import { DocumentosContabilModule } from '../documentos-contabil/documentos-contabil.module';
import { HonorariosContabilModule } from '../honorarios-contabil/honorarios-contabil.module';

@Module({
  imports: [
    JwtModule.register({ secret: process.env.JWT_SECRET || 'fallback-secret' }),
    LeadsModule,
    ClientesContabilModule,
    DocumentosContabilModule,
    HonorariosContabilModule,
  ],
  controllers: [McpController],
  providers: [McpToolsService],
})
export class McpModule {}
