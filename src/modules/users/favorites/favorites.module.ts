import { Module } from '@nestjs/common';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';
import { PrismaService } from '../../../shared/services/prisma.service';
import { CacheService } from '../../../shared/services/cache.service';

@Module({
    imports: [],
    controllers: [FavoritesController],
    providers: [FavoritesService, PrismaService, CacheService],
    exports: [FavoritesService],
})
export class FavoritesModule { }
