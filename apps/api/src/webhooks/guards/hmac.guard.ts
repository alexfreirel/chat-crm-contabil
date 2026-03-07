import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { SettingsService } from '../../settings/settings.service';

/**
 * Verifica assinatura HMAC-SHA256 dos webhooks da Evolution API.
 * Header esperado: `x-webhook-signature` ou `x-signature`.
 * Se a apiKey nao estiver configurada no banco, permite passagem (compatibilidade).
 */
@Injectable()
export class HmacGuard implements CanActivate {
  private readonly logger = new Logger(HmacGuard.name);

  constructor(private readonly settings: SettingsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    const { apiKey } = await this.settings.getWhatsAppConfig();
    if (!apiKey) {
      // Sem apiKey configurada — desabilitar verificacao para compatibilidade
      return true;
    }

    const signature =
      req.headers['x-webhook-signature'] ||
      req.headers['x-signature'] ||
      '';

    if (!signature) {
      // Evolution API nao envia assinatura por padrao — permitir passagem
      // Quando um proxy/gateway adicionar assinatura, ela sera verificada
      return true;
    }

    // O body ja foi parseado pelo NestJS; recalcular HMAC sobre o JSON stringificado
    const rawBody = JSON.stringify(req.body);
    const expected = crypto
      .createHmac('sha256', apiKey)
      .update(rawBody)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      this.logger.warn('[HMAC] Assinatura invalida no webhook — rejeitado');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}
