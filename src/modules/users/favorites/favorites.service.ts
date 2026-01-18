import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { ReorderFavoritesDto } from './dto/reorder-favorites.dto';
import { CacheService } from '../../../shared/services/cache.service';

@Injectable()
export class FavoritesService {
    private readonly CACHE_TTL = 3600; // 1 hour cache

    constructor(
        private prisma: PrismaService,
        private cacheService: CacheService,
    ) { }

    private getCacheKey(userId: number): string {
        return `user:${userId}:favorites`;
    }

    async getFavorites(userId: number) {
        const cacheKey = this.getCacheKey(userId);

        // Try to get from cache first
        const cached = await this.cacheService.get(cacheKey);
        if (cached) {
            return cached;
        }

        const favorites = await this.prisma.akUserFavorite.findMany({
            where: { userId },
            orderBy: { order: 'asc' },
            include: {
                anime: {
                    select: { idAnime: true, titre: true, image: true, niceUrl: true }
                },
                manga: {
                    select: { idManga: true, titre: true, image: true, niceUrl: true }
                },
                jeuVideo: {
                    select: { idJeu: true, titre: true, image: true, niceUrl: true }
                },
                business: {
                    select: { idBusiness: true, denomination: true, image: true, niceUrl: true }
                }
            }
        });

        // Store in cache
        await this.cacheService.set(cacheKey, favorites, this.CACHE_TTL);

        return favorites;
    }

    private async invalidateFavoritesCache(userId: number): Promise<void> {
        const cacheKey = this.getCacheKey(userId);
        await this.cacheService.del(cacheKey);
    }

    async addFavorite(userId: number, dto: CreateFavoriteDto) {
        const { type, idContent } = dto;

        // Check if already exists
        const existing = await this.prisma.akUserFavorite.findFirst({
            where: {
                userId,
                type,
                OR: [
                    { animeId: type === 'anime' ? idContent : undefined },
                    { mangaId: type === 'manga' ? idContent : undefined },
                    { jeuId: type === 'jeu-video' ? idContent : undefined },
                    { businessId: type === 'business' ? idContent : undefined },
                ]
            }
        });

        if (existing) {
            throw new BadRequestException('Already in favorites');
        }

        // Get max order
        const maxOrder = await this.prisma.akUserFavorite.aggregate({
            where: { userId, type },
            _max: { order: true }
        });
        const newOrder = (maxOrder._max.order || 0) + 1;

        // Create
        const favorite = await this.prisma.akUserFavorite.create({
            data: {
                userId,
                type,
                order: newOrder,
                animeId: type === 'anime' ? idContent : null,
                mangaId: type === 'manga' ? idContent : null,
                jeuId: type === 'jeu-video' ? idContent : null,
                businessId: type === 'business' ? idContent : null,
            }
        });

        // Invalidate cache
        await this.invalidateFavoritesCache(userId);

        return favorite;
    }

    async removeFavorite(userId: number, favoriteId: number) {
        const fav = await this.prisma.akUserFavorite.findUnique({
            where: { id: favoriteId }
        });

        if (!fav || fav.userId !== userId) {
            throw new NotFoundException('Favorite not found');
        }

        await this.prisma.akUserFavorite.delete({ where: { id: favoriteId } });

        // Invalidate cache
        await this.invalidateFavoritesCache(userId);

        // We don't necessarily need to reorder immediately, gaps are fine for simple ordering
        return { success: true };
    }

    async reorderFavorites(userId: number, dto: ReorderFavoritesDto) {
        // Transactional update for order
        const ops = dto.ids.map((id, index) =>
            this.prisma.akUserFavorite.updateMany({
                where: { id, userId },
                data: { order: index + 1 }
            })
        );

        await this.prisma.$transaction(ops);

        // Invalidate cache
        await this.invalidateFavoritesCache(userId);

        return { success: true };
    }
}
