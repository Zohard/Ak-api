import { Module } from '@nestjs/common';
import { LegacyCollectionsController } from './legacy-collections.controller';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
  controllers: [LegacyCollectionsController],
  providers: [PrismaService],
})
export class LegacyModule {}

