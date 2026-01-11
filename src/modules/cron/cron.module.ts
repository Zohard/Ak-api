import { Module } from '@nestjs/common';
import { CronController } from './cron.controller';
import { CronService } from './cron.service';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';

@Module({
  controllers: [CronController],
  providers: [CronService, PrismaService, CacheService],
  exports: [CronService],
})
export class CronModule {}
