import { Module } from '@nestjs/common';
import { JeuxVideoController } from './jeux-video.controller';
import { JeuxVideoService } from './jeux-video.service';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
  controllers: [JeuxVideoController],
  providers: [JeuxVideoService, PrismaService],
  exports: [JeuxVideoService],
})
export class JeuxVideoModule {}
