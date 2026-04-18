import {
  Injectable, Logger, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import * as https from 'https';

// ── Chave de configurações no GlobalSetting ────────────────────────────────
const KEY_API_KEYS    = 'integracoes.api_keys';   // JSON: { tenantId: { key, name, created_at } }
const KEY_WEBHOOKS    = 'integracoes.webhooks';   // JSON: { id: { tenantId, url, events, secret, active } }

@Injectable()
export class IntegracoesService {
  private readonly logger = new Logger(IntegracoesService.name);

  constructor(private prisma: PrismaService) {}

  // ── API Keys ───────────────────────────────────────────────────────────────

  async getOrCreateApiKey(tenantId: string): Promise<{ key: string; created_at: string; name: string }> {
    const setting = await this.prisma.globalSetting.findUnique({ where: { key: KEY_API_KEYS } });
    const map: Record<string, { key: string; name: string; created_at: string }> =
      setting ? JSON.parse(setting.value) : {};

    if (map[tenantId]) return map[tenantId];

    // Gera nova API key: lx_live_XXXXX
    const key = `lx_live_${crypto.randomBytes(24).toString('hex')}`;
    map[tenantId] = { key, name: 'API Key Principal', created_at: new Date().toISOString() };

    await this.prisma.globalSetting.upsert({
      where: { key: KEY_API_KEYS },
      update: { value: JSON.stringify(map) },
      create: { key: KEY_API_KEYS, value: JSON.stringify(map) },
    });

    this.logger.log(`Nova API key gerada para tenant ${tenantId}`);
    return map[tenantId];
  }

  async rotateApiKey(tenantId: string): Promise<{ key: string; created_at: string; name: string }> {
    const setting = await this.prisma.globalSetting.findUnique({ where: { key: KEY_API_KEYS } });
    const map: Record<string, { key: string; name: string; created_at: string }> =
      setting ? JSON.parse(setting.value) : {};

    const key = `lx_live_${crypto.randomBytes(24).toString('hex')}`;
    map[tenantId] = { key, name: 'API Key Principal', created_at: new Date().toISOString() };

    await this.prisma.globalSetting.upsert({
      where: { key: KEY_API_KEYS },
      update: { value: JSON.stringify(map) },
      create: { key: KEY_API_KEYS, value: JSON.stringify(map) },
    });

    return map[tenantId];
  }

  async validateApiKey(apiKey: string): Promise<string | null> {
    const setting = await this.prisma.globalSetting.findUnique({ where: { key: KEY_API_KEYS } });
    if (!setting) return null;
    const map: Record<string, { key: string }> = JSON.parse(setting.value);
    const entry = Object.entries(map).find(([, v]) => v.key === apiKey);
    return entry ? entry[0] : null; // retorna tenantId
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  async listWebhooks(tenantId: string) {
    const setting = await this.prisma.globalSetting.findUnique({ where: { key: KEY_WEBHOOKS } });
    const map: Record<string, any> = setting ? JSON.parse(setting.value) : {};
    return Object.entries(map)
      .filter(([, v]) => v.tenantId === tenantId)
      .map(([id, v]) => ({ id, ...v }));
  }

  async createWebhook(
    tenantId: string,
    url: string,
    events: string[],
    name: string,
  ) {
    const setting = await this.prisma.globalSetting.findUnique({ where: { key: KEY_WEBHOOKS } });
    const map: Record<string, any> = setting ? JSON.parse(setting.value) : {};

    const id = crypto.randomBytes(8).toString('hex');
    const secret = `whsec_${crypto.randomBytes(20).toString('hex')}`;
    map[id] = {
      tenantId,
      url,
      events,
      name,
      secret,
      active: true,
      created_at: new Date().toISOString(),
    };

    await this.prisma.globalSetting.upsert({
      where: { key: KEY_WEBHOOKS },
      update: { value: JSON.stringify(map) },
      create: { key: KEY_WEBHOOKS, value: JSON.stringify(map) },
    });

    return { id, secret, ...map[id] };
  }

  async deleteWebhook(id: string, tenantId: string) {
    const setting = await this.prisma.globalSetting.findUnique({ where: { key: KEY_WEBHOOKS } });
    if (!setting) throw new NotFoundException('Webhook não encontrado');
    const map: Record<string, any> = JSON.parse(setting.value);
    if (!map[id] || map[id].tenantId !== tenantId) throw new NotFoundException('Webhook não encontrado');

    delete map[id];
    await this.prisma.globalSetting.update({
      where: { key: KEY_WEBHOOKS },
      data: { value: JSON.stringify(map) },
    });
    return { ok: true };
  }

  async toggleWebhook(id: string, tenantId: string, active: boolean) {
    const setting = await this.prisma.globalSetting.findUnique({ where: { key: KEY_WEBHOOKS } });
    if (!setting) throw new NotFoundException('Webhook não encontrado');
    const map: Record<string, any> = JSON.parse(setting.value);
    if (!map[id] || map[id].tenantId !== tenantId) throw new NotFoundException('Webhook não encontrado');

    map[id].active = active;
    await this.prisma.globalSetting.update({
      where: { key: KEY_WEBHOOKS },
      data: { value: JSON.stringify(map) },
    });
    return { id, active };
  }

  /** Dispara evento para todos os webhooks registrados para o tenant. */
  async dispararEvento(tenantId: string, event: string, payload: unknown) {
    const hooks = await this.listWebhooks(tenantId);
    const ativos = hooks.filter(h => h.active && h.events.includes(event));

    for (const hook of ativos) {
      try {
        const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
        const sig = crypto.createHmac('sha256', hook.secret).update(body).digest('hex');
        const url = new URL(hook.url);

        await new Promise<void>((resolve) => {
          const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
              'X-Lexcon-Signature': `sha256=${sig}`,
              'X-Lexcon-Event': event,
            },
          };
          const req = https.request(options, (res) => {
            this.logger.log(`Webhook ${hook.id} → ${event}: HTTP ${res.statusCode}`);
            resolve();
          });
          req.on('error', (e) => {
            this.logger.warn(`Webhook ${hook.id} erro: ${e.message}`);
            resolve();
          });
          req.setTimeout(5000, () => { req.destroy(); resolve(); });
          req.write(body);
          req.end();
        });
      } catch (e) {
        this.logger.warn(`Erro ao disparar webhook ${hook.id}: ${e}`);
      }
    }

    return { disparados: ativos.length };
  }

  // ── Export de dados ────────────────────────────────────────────────────────

  async exportClientes(tenantId: string, format: 'json' | 'csv' | 'dominio' | 'alterdata') {
    const clientes = await this.prisma.clienteContabil.findMany({
      where: { tenant_id: tenantId, archived: false },
      include: { lead: { select: { name: true, phone: true, email: true, cpf_cnpj: true } } },
      orderBy: { created_at: 'asc' },
    });

    const rows = clientes.map(c => ({
      id: c.id,
      nome: c.lead?.name ?? '',
      cpf_cnpj: c.cpf_cnpj ?? c.lead?.cpf_cnpj ?? '',
      phone: c.lead?.phone ?? '',
      email: c.lead?.email ?? '',
      service_type: c.service_type,
      regime_tributario: c.regime_tributario ?? '',
      stage: c.stage,
      cep: c.cep ?? '',
      cidade: c.cidade ?? '',
      estado: c.estado ?? '',
      created_at: c.created_at,
    }));

    if (format === 'csv' || format === 'dominio' || format === 'alterdata') {
      return { csv: this.buildCsv(rows), filename: `clientes-${format}.csv` };
    }
    return rows;
  }

  async exportObrigacoes(tenantId: string, format: 'json' | 'csv') {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const obrigacoes = await this.prisma.obrigacaoFiscal.findMany({
      where: { tenant_id: tenantId, due_at: { gte: startOfMonth, lte: endOfMonth } },
      include: {
        cliente: { include: { lead: { select: { name: true } } } },
        responsavel: { select: { name: true } },
      },
      orderBy: { due_at: 'asc' },
    });

    const rows = obrigacoes.map(o => ({
      id: o.id,
      titulo: o.titulo,
      tipo: o.tipo,
      cliente_nome: o.cliente?.lead?.name ?? '',
      responsavel: o.responsavel?.name ?? '',
      due_at: o.due_at.toLocaleDateString('pt-BR'),
      completed: o.completed ? 'SIM' : 'NÃO',
      completed_at: o.completed_at ? o.completed_at.toLocaleDateString('pt-BR') : '',
    }));

    if (format === 'csv') {
      return { csv: this.buildCsv(rows), filename: 'obrigacoes-mes.csv' };
    }
    return rows;
  }

  async exportFaturamento(tenantId: string, format: 'json' | 'csv') {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const parcelas = await this.prisma.honorarioParcela.findMany({
      where: {
        due_date: { gte: startOfMonth, lte: endOfMonth },
        honorario: { tenant_id: tenantId },
      },
      include: {
        honorario: {
          include: { cliente: { include: { lead: { select: { name: true } } } } },
        },
      },
      orderBy: { due_date: 'asc' },
    });

    const rows = parcelas.map(p => ({
      cliente: p.honorario.cliente?.lead?.name ?? '',
      tipo_honorario: p.honorario.tipo,
      valor: Number(p.amount).toFixed(2).replace('.', ','),
      vencimento: p.due_date.toLocaleDateString('pt-BR'),
      status: p.status,
      pago_em: p.paid_at ? p.paid_at.toLocaleDateString('pt-BR') : '',
      forma_pagamento: p.payment_method ?? '',
    }));

    if (format === 'csv') {
      return { csv: this.buildCsv(rows), filename: 'faturamento-mes.csv' };
    }
    return rows;
  }

  // ── API Pública ────────────────────────────────────────────────────────────

  async publicGetClientes(apiKey: string) {
    const tenantId = await this.validateApiKey(apiKey);
    if (!tenantId) throw new UnauthorizedException('API key inválida');
    return this.exportClientes(tenantId, 'json');
  }

  async publicGetObrigacoes(apiKey: string) {
    const tenantId = await this.validateApiKey(apiKey);
    if (!tenantId) throw new UnauthorizedException('API key inválida');
    return this.exportObrigacoes(tenantId, 'json');
  }

  // ── Helper CSV ─────────────────────────────────────────────────────────────
  private buildCsv(rows: Record<string, unknown>[]): string {
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(';'),
      ...rows.map(r =>
        headers.map(h => {
          const v = r[h];
          if (v == null) return '';
          const str = String(v);
          return str.includes(';') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"` : str;
        }).join(';'),
      ),
    ];
    return '\uFEFF' + lines.join('\r\n');
  }
}
