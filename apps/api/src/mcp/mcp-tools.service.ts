import { Injectable } from '@nestjs/common';
import { LeadsService } from '../leads/leads.service';
import { ClientesContabilService } from '../clientes-contabil/clientes-contabil.service';
import { DocumentosContabilService } from '../documentos-contabil/documentos-contabil.service';
import { HonorariosContabilService } from '../honorarios-contabil/honorarios-contabil.service';

@Injectable()
export class McpToolsService {
  constructor(
    private leads: LeadsService,
    private clientesContabil: ClientesContabilService,
    private documentosContabil: DocumentosContabilService,
    private honorariosContabil: HonorariosContabilService,
  ) {}

  async callTool(name: string, args: Record<string, any>, user: any): Promise<unknown> {
    const tenantId = user?.tenant_id;
    const userId = user?.sub;
    const role = user?.role;
    const accountantId = role === 'ADMIN' ? undefined : userId;

    switch (name) {
      // ─── Clientes ─────────────────────────────────────────────
      case 'buscar_cliente': {
        if (args.id) return this.leads.findOne(args.id, tenantId);
        return this.leads.findAll(tenantId, undefined, 1, 10, args.query);
      }

      case 'listar_clientes': {
        return this.leads.findAll(
          tenantId,
          args.inboxId,
          args.page ?? 1,
          args.limit ?? 20,
          args.search,
          args.stage,
        );
      }

      case 'criar_cliente': {
        return this.leads.create({
          name: args.name,
          phone: args.phone,
          email: args.email,
          tenant_id: tenantId,
        } as any);
      }

      case 'atualizar_cliente': {
        const { id, name, email, tags } = args;
        return this.leads.update(id, { name, email, tags }, tenantId);
      }

      // ─── Clientes Contábeis ───────────────────────────────────
      case 'buscar_cliente_contabil': {
        if (args.id) return this.clientesContabil.findOne(args.id, tenantId);
        return this.clientesContabil.findAll({ accountantId, tenantId, page: 1, limit: 10 });
      }

      case 'listar_clientes_contabeis_do_lead': {
        return this.clientesContabil.findAll({
          accountantId,
          stage: args.stage,
          archived: args.archived,
          tenantId,
          leadId: args.lead_id,
        });
      }

      case 'atualizar_status_cliente_contabil': {
        return this.clientesContabil.updateStage(args.id, args.stage, tenantId);
      }

      case 'criar_cliente_contabil': {
        return this.clientesContabil.create({
          lead_id: args.lead_id,
          accountant_id: userId,
          service_type: args.service_type,
          tenant_id: tenantId,
        });
      }

      // ─── Documentos ───────────────────────────────────────────
      case 'listar_documentos_do_cliente': {
        return this.documentosContabil.findByCliente(args.cliente_id, tenantId);
      }

      case 'buscar_documento': {
        const docs = await this.documentosContabil.findByCliente(args.cliente_id, tenantId) as any[];
        if (args.doc_id) {
          return docs.find((d: any) => d.id === args.doc_id) ?? null;
        }
        return docs;
      }

      case 'vincular_documento_ao_cliente': {
        // update not available — return findByCliente for the client
        return this.documentosContabil.findByCliente(args.cliente_id, undefined, tenantId);
      }

      // ─── Honorários ───────────────────────────────────────────
      case 'consultar_honorarios_do_cliente': {
        return this.honorariosContabil.findByCliente(args.cliente_id, tenantId);
      }

      case 'listar_parcelas_pendentes': {
        const honorarios = await this.honorariosContabil.findByCliente(args.cliente_id, tenantId) as any[];
        return honorarios.flatMap((h: any) =>
          (h.parcelas ?? []).filter((p: any) => p.status === 'PENDENTE' || p.status === 'ATRASADO'),
        );
      }

      case 'registrar_pagamento': {
        return this.honorariosContabil.markPaid(args.parcela_id, args.payment_method);
      }

      default:
        throw new Error(`Ferramenta desconhecida: ${name}`);
    }
  }
}
