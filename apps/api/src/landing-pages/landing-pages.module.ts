import { Module } from '@nestjs/common';
import { LandingPagesController } from './landing-pages.controller';
import { LandingPagesService } from './landing-pages.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LandingPagesController],
  providers: [LandingPagesService],
})
export class LandingPagesModule {}
