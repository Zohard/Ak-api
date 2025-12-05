import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService, PrismaService, CacheService],
  exports: [HealthService],
})
export class HealthModule {}
