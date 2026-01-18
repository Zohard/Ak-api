import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { PrismaService } from '../../../../shared/services/prisma.service';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { ReorderFavoritesDto } from './dto/reorder-favorites.dto';
import { CacheService } from '../../../../shared/services/cache.service';

@Injectable()
export class FavoritesService {
    constructor(
        private prisma: PrismaService,
        private cacheService: CacheService,
    ) { }

    async getFavorites(userId: number) {
        // Cache key for user favorites
        // We can cache this, but invalidation is needed on add/remove/order
        // For now, no strict caching or short TTL

        return this.prisma.akUserFavorite.findMany({
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
        return this.prisma.akUserFavorite.create({
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
    }

    async removeFavorite(userId: number, favoriteId: number) {
        const fav = await this.prisma.akUserFavorite.findUnique({
            where: { id: favoriteId }
        });

        if (!fav || fav.userId !== userId) {
            throw new NotFoundException('Favorite not found');
        }

        await this.prisma.akUserFavorite.delete({ where: { id: favoriteId } });

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
        return { success: true };
    }
}
