import { Controller, Post, Body, Headers, HttpCode } from '@nestjs/common';
import { EvolutionService } from './evolution.service';

@Controller('webhooks/evolution')
export class EvolutionController {
  constructor(private readonly evolutionService: EvolutionService) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(@Body() payload: any, @Headers() headers: any) {
    // Basic support for different event types
    const eventType = payload.event;
    
    if (eventType === 'messages.upsert') {
      await this.evolutionService.handleMessagesUpsert(payload);
    }
    // Ack the webhook quickly
    return { received: true };
  }
}
