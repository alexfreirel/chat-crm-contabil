import { Module } from '@nestjs/common';
import { PetitionsController } from './petitions.controller';
import { PetitionsService } from './petitions.service';
import { PetitionAiService } from './petition-ai.service';

@Module({
  controllers: [PetitionsController],
  providers: [PetitionsService, PetitionAiService],
  exports: [PetitionsService],
})
export class PetitionsModule {}
