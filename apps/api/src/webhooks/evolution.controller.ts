import { Controller, Post, Body, HttpCode, UseGuards, Logger } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { EvolutionService } from './evolution.service';
import { HmacGuard } from './guards/hmac.guard';
import { Public } from '../auth/decorators/public.decorator';

type HandlerName =
  | 'handleMessagesUpsert'
  | 'handleMessagesUpdate'
  | 'handleMessagesDelete'
  | 'handleChatsUpsert'
  | 'handleChatsDelete'
  | 'handleContactsUpsert'
  | 'handleContactsUpdate'
  | 'handleConnectionUpdate'
  | 'handlePresenceUpdate';

const EVENT_HANDLERS: Record<string, HandlerName> = {
  'messages.upsert': 'handleMessagesUpsert',
  'send.message':    'handleMessagesUpsert',
  'messages.update': 'handleMessagesUpdate',
  'messages.delete': 'handleMessagesDelete',
  'chats.upsert':    'handleChatsUpsert',
  'chats.set':       'handleChatsUpsert',
  'chats.update':    'handleChatsUpsert',
  'chats.delete':    'handleChatsDelete',
  'contacts.upsert': 'handleContactsUpsert',
  'contacts.update': 'handleContactsUpdate',
  'connection.update': 'handleConnectionUpdate',
  'presence.update':   'handlePresenceUpdate',
};

@Public()
@SkipThrottle()
@UseGuards(HmacGuard)
@Controller('webhooks/evolution')
export class EvolutionController {
  private readonly logger = new Logger(EvolutionController.name);

  constructor(private readonly evolutionService: EvolutionService) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(@Body() payload: any) {
    const handlerName = EVENT_HANDLERS[payload?.event];
    if (!handlerName) return { received: true };

    // Pre-flight: rejeita evento de instância que não pertence a este deployment
    // ANTES de chamar o handler. Esta é a barreira contra vazamento cross-deployment
    // (lustosa/lexcon compartilham o mesmo servidor Evolution).
    const ctx = await this.evolutionService.resolveInstanceOrReject(payload);
    if (!ctx) return { received: true };

    await (this.evolutionService as any)[handlerName](payload);
    return { received: true };
  }
}
