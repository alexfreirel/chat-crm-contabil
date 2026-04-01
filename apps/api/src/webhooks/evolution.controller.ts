import { Controller, Post, Body, HttpCode, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { EvolutionService } from './evolution.service';
import { HmacGuard } from './guards/hmac.guard';
import { Public } from '../auth/decorators/public.decorator';

@Public()
@SkipThrottle()
@UseGuards(HmacGuard)
@Controller('webhooks/evolution')
export class EvolutionController {
  constructor(private readonly evolutionService: EvolutionService) {}

  @Post()
  @HttpCode(200)
  handleWebhook(@Body() payload: any) {
    // Responde imediatamente para evitar timeout na Evolution (60s)
    // O processamento ocorre em background via setImmediate
    const eventType = payload.event as string;

    setImmediate(() => {
      if (eventType === 'messages.upsert' || eventType === 'send.message') {
        this.evolutionService.handleMessagesUpsert(payload).catch(() => {});
      } else if (eventType === 'messages.update') {
        this.evolutionService.handleMessagesUpdate(payload).catch(() => {});
      } else if (eventType === 'contacts.upsert') {
        this.evolutionService.handleContactsUpsert(payload).catch(() => {});
      } else if (eventType === 'chats.upsert' || eventType === 'chats.set') {
        this.evolutionService.handleChatsUpsert(payload).catch(() => {});
      } else if (eventType === 'chats.update') {
        this.evolutionService.handleChatsUpsert(payload).catch(() => {});
      } else if (eventType === 'chats.delete') {
        this.evolutionService.handleChatsDelete(payload).catch(() => {});
      } else if (eventType === 'messages.delete') {
        this.evolutionService.handleMessagesDelete(payload).catch(() => {});
      } else if (eventType === 'contacts.update') {
        this.evolutionService.handleContactsUpdate(payload).catch(() => {});
      } else if (eventType === 'connection.update') {
        this.evolutionService.handleConnectionUpdate(payload).catch(() => {});
      } else if (eventType === 'presence.update') {
        this.evolutionService.handlePresenceUpdate(payload).catch(() => {});
      }
    });

    return { received: true };
  }
}
