import { Module } from '@nestjs/common';
import { CronController } from './cron.controller';
import { CronService } from './cron.service';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
  controllers: [CronController],
  providers: [CronService, PrismaService],
  exports: [CronService],
})
export class CronModule {}
