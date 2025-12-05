import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaModule } from '../../shared/modules/prisma.module';
import { CacheModule } from '../../shared/modules/cache.module';

@Module({
  imports: [PrismaModule, CacheModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
