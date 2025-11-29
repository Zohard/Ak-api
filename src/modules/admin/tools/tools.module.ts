import { Module } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { CacheService } from '../../../shared/services/cache.service';
import { GenresController } from './controllers/genres.controller';
import { PlatformsController } from './controllers/platforms.controller';
import { TagsController } from './controllers/tags.controller';

@Module({
  controllers: [GenresController, PlatformsController, TagsController],
  providers: [PrismaService, CacheService],
})
export class ToolsModule {}
