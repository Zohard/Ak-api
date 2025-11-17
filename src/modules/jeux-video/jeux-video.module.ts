import { Module } from '@nestjs/common';
import { JeuxVideoController } from './jeux-video.controller';
import { JeuxVideoService } from './jeux-video.service';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';

@Module({
  controllers: [JeuxVideoController],
  providers: [JeuxVideoService, PrismaService, CacheService],
  exports: [JeuxVideoService],
})
export class JeuxVideoModule {}
