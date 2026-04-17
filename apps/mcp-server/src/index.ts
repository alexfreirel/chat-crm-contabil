#!/usr/bin/env node
/**
 * Servidor MCP — CRM Contábil
 * Protocolo: Model Context Protocol (MCP) via stdio
 *
 * Variáveis de ambiente necessárias:
 *   CRM_BASE_URL   — URL base da API (padrão: http://localhost:3005)
 *   CRM_EMAIL      — E-mail do usuário (requerido se CRM_JWT_TOKEN não for informado)
 *   CRM_PASSWORD   — Senha do usuário (requerido se CRM_JWT_TOKEN não for informado)
 *   CRM_JWT_TOKEN  — JWT pré-gerado (alternativa a email+senha)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { CrmClient } from './crm-client.js';

const crm = new CrmClient();

const server = new McpServer({
  name: 'crm-juridico',
  version: '1.0.0',
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function err(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text' as const, text: `Erro: ${msg}` }],
    isError: true,
  };
}

// ─── Clientes / Contatos ───────────────────────────────────────────────────────

server.tool(
  'buscar_cliente',
  'Busca um cliente/contato no CRM por nome, telefone, e-mail ou ID. ' +
    'Use `id` para busca direta ou `query` para busca por texto.',
  {
    id: z.string().optional().describe('ID interno do cliente (UUID)'),
    query: z
      .string()
      .optional()
      .describe('Nome, telefone ou e-mail para busca textual'),
  },
  async ({ id, query }) => {
    try {
      if (id) {
        const result = await crm.getCliente(id);
        return ok(result);
      }
      if (query) {
        const result = await crm.listarClientes({ search: query, limit: 10 });
        return ok(result);
      }
      return err('Informe `id` ou `query` para buscar um cliente.');
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'listar_clientes',
  'Lista clientes/contatos do CRM com paginação e filtros opcionais.',
  {
    page: z.number().int().positive().optional().default(1).describe('Número da página'),
    limit: z.number().int().positive().max(100).optional().default(20).describe('Itens por página (máx 100)'),
    search: z.string().optional().describe('Filtrar por nome ou telefone'),
    stage: z
      .string()
      .optional()
      .describe('Filtrar por etapa do lead (ex: NOVO, QUALIFICADO, CONVERTIDO)'),
  },
  async (params) => {
    try {
      const result = await crm.listarClientes(params);
      return ok(result);
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'criar_cliente',
  'Cria um novo cliente/contato no CRM.',
  {
    name: z.string().describe('Nome completo do cliente'),
    phone: z.string().describe('Telefone com DDI, sem símbolos (ex: 5511999999999)'),
    email: z.string().email().optional().describe('Endereço de e-mail'),
    inbox_id: z
      .string()
      .optional()
      .describe('ID do inbox ao qual o lead será associado'),
  },
  async (data) => {
    try {
      const result = await crm.criarCliente(data);
      return ok(result);
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'atualizar_cliente',
  'Atualiza dados de um cliente/contato existente no CRM.',
  {
    id: z.string().describe('ID do cliente (UUID)'),
    name: z.string().optional().describe('Nome completo'),
    email: z.string().email().optional().describe('E-mail'),
    phone: z.string().optional().describe('Telefone'),
    stage: z
      .string()
      .optional()
      .describe('Etapa do lead (ex: NOVO, QUALIFICADO, CONVERTIDO, PERDIDO)'),
    legal_area: z.string().optional().describe('Área jurídica de interesse'),
    notes: z.string().optional().describe('Observações internas'),
  },
  async ({ id, ...rest }) => {
    try {
      const result = await crm.atualizarCliente(id, rest as Record<string, unknown>);
      return ok(result);
    } catch (e) {
      return err(e);
    }
  },
);

// ─── Processos / Casos ─────────────────────────────────────────────────────────

server.tool(
  'buscar_processo',
  'Busca um processo/caso jurídico pelo ID interno ou pelo número do processo judicial.',
  {
    id: z.string().optional().describe('ID interno do processo (UUID)'),
    numero_processo: z
      .string()
      .optional()
      .describe('Número do processo judicial (ex: 0001234-56.2024.5.02.0001)'),
  },
  async ({ id, numero_processo }) => {
    try {
      if (id) {
        const result = await crm.getProcesso(id);
        return ok(result);
      }
      if (numero_processo) {
        const result = await crm.listarProcessos({ caseNumber: numero_processo });
        return ok(result);
      }
      return err('Informe `id` ou `numero_processo`.');
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'listar_processos_do_cliente',
  'Lista todos os processos/casos jurídicos associados a um cliente específico.',
  {
    lead_id: z.string().describe('ID do cliente/lead (UUID)'),
    stage: z
      .string()
      .optional()
      .describe('Filtrar por etapa (ex: VIABILIDADE, PREPARACAO, PROTOCOLO, ACOMPANHAMENTO)'),
    archived: z.boolean().optional().describe('Incluir somente arquivados (true) ou ativos (false)'),
  },
  async ({ lead_id, stage, archived }) => {
    try {
      const result = await crm.listarProcessos({ leadId: lead_id, stage, archived });
      return ok(result);
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'atualizar_status_processo',
  'Atualiza a etapa/status de um processo jurídico.',
  {
    id: z.string().describe('ID do processo (UUID)'),
    stage: z
      .enum(['VIABILIDADE', 'PREPARACAO', 'PROTOCOLO', 'ACOMPANHAMENTO'])
      .describe('Nova etapa do processo'),
  },
  async ({ id, stage }) => {
    try {
      const result = await crm.atualizarStageProcesso(id, stage);
      return ok(result);
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'criar_processo',
  'Cria um novo processo/caso jurídico vinculado a um cliente.',
  {
    lead_id: z.string().describe('ID do cliente (UUID)'),
    legal_area: z
      .string()
      .optional()
      .describe('Área jurídica (ex: TRABALHISTA, CIVEL, CRIMINAL, PREVIDENCIARIO, FAMILIA)'),
    action_type: z.string().optional().describe('Tipo de ação (ex: Reclamação Trabalhista)'),
    claim_value: z.number().positive().optional().describe('Valor da causa em reais'),
    opposing_party: z.string().optional().describe('Nome da parte contrária'),
    notes: z.string().optional().describe('Observações e fatos relevantes do caso'),
  },
  async (data) => {
    try {
      const result = await crm.criarProcesso(data);
      return ok(result);
    } catch (e) {
      return err(e);
    }
  },
);

// ─── Documentos Contábeis ─────────────────────────────────────────────────────

server.tool(
  'listar_documentos_do_cliente',
  'Lista todos os documentos contábeis de um cliente (pastas: FISCAL, CONTABIL, PESSOAL, PAYROLL, CONTRATO, OUTROS).',
  {
    cliente_id: z.string().describe('ID do cliente contábil (UUID)'),
    folder: z.string().optional().describe('Filtrar por pasta (ex: FISCAL, CONTABIL, PESSOAL)'),
  },
  async ({ cliente_id, folder }) => {
    try {
      const result = await crm.listarDocumentosContabil(cliente_id, folder);
      return ok(result);
    } catch (e) {
      return err(e);
    }
  },
);

// ─── Financeiro / Honorários Contábeis ────────────────────────────────────────

server.tool(
  'consultar_honorarios_do_cliente',
  'Consulta todos os honorários e parcelas de pagamento de um cliente contábil.',
  {
    cliente_id: z.string().describe('ID do cliente contábil (UUID)'),
  },
  async ({ cliente_id }) => {
    try {
      const result = await crm.getHonorariosContabil(cliente_id);
      return ok(result);
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'listar_pagamentos_pendentes',
  'Lista todas as parcelas de honorários com status PENDENTE ou ATRASADO de um cliente.',
  {
    cliente_id: z.string().describe('ID do cliente contábil (UUID)'),
  },
  async ({ cliente_id }) => {
    try {
      const honorarios = (await crm.getHonorariosContabil(cliente_id)) as Array<{
        parcelas?: Array<{ status: string }>;
      }>;
      const pendentes = Array.isArray(honorarios)
        ? honorarios.flatMap((h) =>
            (h.parcelas ?? []).filter(
              (p) => p.status === 'PENDENTE' || p.status === 'ATRASADO',
            ),
          )
        : [];
      return ok(pendentes);
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  'registrar_pagamento',
  'Registra uma parcela de honorário como PAGO no sistema.',
  {
    parcela_id: z.string().describe('ID da parcela (UUID)'),
  },
  async ({ parcela_id }) => {
    try {
      const result = await crm.marcarParcelaPaga(parcela_id);
      return ok(result);
    } catch (e) {
      return err(e);
    }
  },
);

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
