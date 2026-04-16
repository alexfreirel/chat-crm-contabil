import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TemplatesContabilService } from '../templates-contabil/templates-contabil.service';

// ─── Variáveis disponíveis no template de contrato contábil ──────────────────
export interface ContratoVariaveis {
  /** Razão social ou nome do contratante */
  NOME_CONTRATANTE?: string;
  /** CPF ou CNPJ do contratante */
  DOCUMENTO_CONTRATANTE?: string;
  /** Endereço completo do contratante */
  ENDERECO_CONTRATANTE?: string;
  /** Tipo de serviço contábil contratado */
  SERVICO?: string;
  /** Valor mensal do honorário */
  VALOR_HONORARIO?: string;
  /** Dia de vencimento da mensalidade */
  DIA_VENCIMENTO?: string;
  /** Regime tributário da empresa */
  REGIME_TRIBUTARIO?: string;
  /** Data de início dos serviços */
  DATA_INICIO?: string;
  /** Cidade para foro do contrato */
  CIDADE_FORO?: string;
  /** Data de assinatura por extenso */
  DATA_ASSINATURA?: string;
  /** Outros campos dinâmicos */
  [key: string]: string | undefined;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplatesContabilService,
  ) {}

  /**
   * Gera um buffer PDF/DOCX do contrato de serviços contábeis
   * preenchendo as variáveis no template ativo.
   */
  async generateBuffer(variaveis: ContratoVariaveis): Promise<Buffer> {
    // Busca o template padrão de contrato de serviço
    const template = await this.prisma.templateContabil.findFirst({
      where: { tipo: 'CONTRATO_SERVICO', is_global: true },
      orderBy: { usage_count: 'desc' },
    });

    if (template?.content_json) {
      // Template estruturado: substitui variáveis no conteúdo JSON
      let content = JSON.stringify(template.content_json);
      for (const [key, value] of Object.entries(variaveis)) {
        if (value !== undefined) {
          content = content.replaceAll(`{{${key}}}`, value);
        }
      }
      // Incrementa contador de uso
      await this.prisma.templateContabil.update({
        where: { id: template.id },
        data: { usage_count: { increment: 1 } },
      });
      // Retorna como buffer UTF-8 (consumidor converte para PDF se necessário)
      return Buffer.from(content, 'utf-8');
    }

    // Fallback: gera HTML mínimo do contrato
    const html = this.buildDefaultHtml(variaveis);
    return Buffer.from(html, 'utf-8');
  }

  // ── HTML padrão quando não há template cadastrado ─────────────────────────

  private buildDefaultHtml(v: ContratoVariaveis): string {
    const dataHoje = v.DATA_ASSINATURA ?? new Date().toLocaleDateString('pt-BR');
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Contrato de Serviços Contábeis</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#333;line-height:1.6}
h1{text-align:center;margin-bottom:32px}p{margin-bottom:12px}.assinaturas{margin-top:60px;display:flex;justify-content:space-between}
.assinatura{text-align:center;width:45%}.linha{border-top:1px solid #333;margin-top:40px;padding-top:8px}</style>
</head>
<body>
<h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS CONTÁBEIS</h1>
<p><strong>CONTRATANTE:</strong> ${v.NOME_CONTRATANTE ?? '______________________'}</p>
<p><strong>CPF/CNPJ:</strong> ${v.DOCUMENTO_CONTRATANTE ?? '______________________'}</p>
<p><strong>ENDEREÇO:</strong> ${v.ENDERECO_CONTRATANTE ?? '______________________'}</p>
<p><strong>SERVIÇO CONTRATADO:</strong> ${v.SERVICO ?? 'Serviços Contábeis'}</p>
<p><strong>REGIME TRIBUTÁRIO:</strong> ${v.REGIME_TRIBUTARIO ?? '______________________'}</p>
<p><strong>HONORÁRIO MENSAL:</strong> R$ ${v.VALOR_HONORARIO ?? '______________________'}</p>
<p><strong>VENCIMENTO:</strong> Todo dia ${v.DIA_VENCIMENTO ?? '__'} de cada mês</p>
<p><strong>INÍCIO DOS SERVIÇOS:</strong> ${v.DATA_INICIO ?? '______________________'}</p>
<p>O presente contrato é firmado em conformidade com as normas do CFC (Conselho Federal de Contabilidade)
e demais legislações aplicáveis. As partes elegem o foro da comarca de
${v.CIDADE_FORO ?? '______________________'} para dirimir eventuais litígios.</p>
<div class="assinaturas">
  <div class="assinatura">
    <div class="linha">Contratante</div>
    <p>${v.NOME_CONTRATANTE ?? '______________________'}</p>
  </div>
  <div class="assinatura">
    <div class="linha">Escritório Contábil</div>
    <p>Responsável Técnico</p>
  </div>
</div>
<p style="text-align:center;margin-top:40px">${v.CIDADE_FORO ?? ''}, ${dataHoje}</p>
</body></html>`;
  }
}
