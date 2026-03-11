import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  Req,
  Res,
  HttpCode,
  UseGuards,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { ClicksignService } from './clicksign.service';
import { ContratoVariaveis } from '../contracts/contracts.service';

// ─── DTO ──────────────────────────────────────────────────────────────────────

class RequestSignatureDto {
  conversationId: string;
  variaveis: ContratoVariaveis;
}

// ─── Controller autenticado (operadores) ──────────────────────────────────────

@UseGuards(JwtAuthGuard)
@Controller('contracts/clicksign')
export class ClicksignController {
  private readonly logger = new Logger(ClicksignController.name);

  constructor(private readonly clicksign: ClicksignService) {}

  /**
   * POST /contracts/clicksign/request
   * Gera o contrato, faz upload no Clicksign, cria signatário e envia link via WhatsApp.
   */
  @Post('request')
  async requestSignature(@Body() body: RequestSignatureDto) {
    if (!body.conversationId) throw new BadRequestException('conversationId obrigatório');
    if (!body.variaveis) throw new BadRequestException('variaveis obrigatório');
    return this.clicksign.requestSignature({
      conversationId: body.conversationId,
      variaveis: body.variaveis,
    });
  }

  /**
   * GET /contracts/clicksign/status/:conversationId
   * Retorna o status do ContractSignature mais recente da conversa.
   */
  @Get('status/:conversationId')
  async getStatus(@Param('conversationId') conversationId: string) {
    return this.clicksign['prisma'].contractSignature.findFirst({
      where: { conversation_id: conversationId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        status: true,
        signing_url: true,
        signed_at: true,
        created_at: true,
      },
    });
  }

  /**
   * GET /contracts/clicksign/signed-pdf/:signatureId
   * Serve o PDF assinado armazenado no S3 (para encaminhar ao WhatsApp).
   */
  @Get('signed-pdf/:signatureId')
  async serveSignedPdf(@Param('signatureId') signatureId: string, @Res() res: any) {
    const { stream, contentType, contentLength } =
      await this.clicksign.getSignedPdfStream(signatureId);

    const headers: Record<string, string | number> = {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="contrato_assinado_${signatureId}.pdf"`,
    };
    if (contentLength) headers['Content-Length'] = contentLength;
    res.set(headers);
    stream.pipe(res);
  }
}

// ─── Controller público (webhook do Clicksign) ────────────────────────────────

@Public()
@SkipThrottle()
@Controller('webhooks/clicksign')
export class ClicksignWebhookController {
  private readonly logger = new Logger(ClicksignWebhookController.name);

  constructor(private readonly clicksign: ClicksignService) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Body() payload: any,
    @Headers('x-clicksign-hmac-sha256') hmacHeader: string,
    @Req() req: any,
  ) {
    // Validar assinatura HMAC quando configurada
    const rawBody =
      typeof req.rawBody === 'string'
        ? req.rawBody
        : JSON.stringify(payload);
    const signature = hmacHeader ?? '';

    if (signature && !this.clicksign.verifyWebhookSignature(rawBody, signature)) {
      this.logger.warn('[Clicksign] Assinatura HMAC inválida no webhook — rejeitado');
      throw new UnauthorizedException('Webhook signature inválida');
    }

    await this.clicksign.handleWebhookEvent(payload);
    return { ok: true };
  }
}
