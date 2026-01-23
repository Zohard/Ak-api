import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { CacheService } from '../../../shared/services/cache.service';

@Injectable()
export class CollectionStatisticsService {
    private readonly logger = new Logger(CollectionStatisticsService.name);

    constructor(
        private prisma: PrismaService,
        private cacheService: CacheService,
    ) { }

    // Get ratings distribution for a user's collection (anime or manga)
    async getRatingsDistribution(
        userId: number,
        type: number, // 0 = all types
        mediaType: 'anime' | 'manga',
        currentUserId?: number,
    ) {
        const isOwnCollection = currentUserId === userId;

        const cacheKey = `collection_ratings:${mediaType}:${userId}:${type}:${isOwnCollection ? 'own' : 'public'}`;
        const cached = await this.cacheService.get(cacheKey);
        if (cached) return cached;

        const whereBase: any = { idMembre: userId, ...(isOwnCollection ? {} : { isPublic: true }) };
        if (type && type > 0) {
            whereBase.type = type;
        }

        // Build histogram for integer evaluations (1..10). We also count unrated (0) separately.
        const buckets: Record<number, number> = {};
        for (let i = 1; i <= 10; i++) buckets[i] = 0;
        let unrated = 0;

        if (mediaType === 'anime') {
            const rows = await this.prisma.collectionAnime.groupBy({
                by: ['evaluation'],
                where: whereBase,
                _count: { evaluation: true },
            });
            for (const r of rows) {
                const val = Number(r.evaluation ?? 0);
                if (val <= 0) unrated += r._count.evaluation;
                else if (val >= 1 && val <= 10) buckets[val] = (buckets[val] || 0) + r._count.evaluation;
            }
        } else {
            const rows = await this.prisma.collectionManga.groupBy({
                by: ['evaluation'],
                where: whereBase,
                _count: { evaluation: true },
            });
            for (const r of rows) {
                const val = Number(r.evaluation ?? 0);
                if (val <= 0) unrated += r._count.evaluation;
                else if (val >= 1 && val <= 10) buckets[val] = (buckets[val] || 0) + r._count.evaluation;
            }
        }

        const data = Object.entries(buckets)
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([rating, count]) => ({ rating: Number(rating), count }));

        const result = {
            success: true,
            data,
            meta: {
                userId,
                type,
                mediaType,
                totalRated: data.reduce((s, d) => s + d.count, 0),
                unrated,
            },
        };

        await this.cacheService.set(cacheKey, result, 1200);
        return result;
    }

    // Get collection summary (counts per type) for a user
    async getCollectionSummary(userId: number, currentUserId?: number) {
        // Only show collections if it's the current user or collections are public
        const isOwnCollection = currentUserId === userId;

        const collectionTypes = [
            { type: 1, name: 'Terminé' },
            { type: 2, name: 'En cours' },
            { type: 3, name: 'Planifié' },
            { type: 4, name: 'Abandonné' }
        ];

        // Get counts for each collection type
        const animeCounts = await this.prisma.collectionAnime.groupBy({
            by: ['type'],
            where: {
                idMembre: userId,
                ...(isOwnCollection ? {} : { isPublic: true })
            },
            _count: {
                type: true
            }
        });

        const mangaCounts = await this.prisma.collectionManga.groupBy({
            by: ['type'],
            where: {
                idMembre: userId,
                ...(isOwnCollection ? {} : { isPublic: true })
            },
            _count: {
                type: true
            }
        });

        // Format the response
        const data = collectionTypes.map(ct => {
            const animeCount = animeCounts.find(ac => ac.type === ct.type)?._count?.type || 0;
            const mangaCount = mangaCounts.find(mc => mc.type === ct.type)?._count?.type || 0;

            return {
                type: ct.type,
                name: ct.name,
                anime: {
                    count: animeCount,
                    mediaType: 'anime' as const
                },
                manga: {
                    count: mangaCount,
                    mediaType: 'manga' as const
                },
                totalCount: animeCount + mangaCount
            };
        });

        // Also provide flattened structure for easier consumption
        const summary = [
            {
                mediaType: 'anime' as const,
                totalCount: animeCounts.reduce((sum, ac) => sum + (ac._count?.type || 0), 0)
            },
            {
                mediaType: 'manga' as const,
                totalCount: mangaCounts.reduce((sum, mc) => sum + (mc._count?.type || 0), 0)
            }
        ];

        return {
            data: summary,  // Return the flattened summary as 'data' for the frontend
            details: data    // Keep detailed breakdown as 'details'
        };
    }

    // Get user info with collection summary (optimized for single user)
    async getUserInfo(userId: number, currentUserId?: number) {
        const isOwnCollection = currentUserId === userId;

        // Fetch user info and collection counts in parallel
        const [user, animeCounts, mangaCounts] = await Promise.all([
            this.prisma.smfMember.findUnique({
                where: { idMember: userId },
                select: {
                    idMember: true,
                    memberName: true,
                    emailAddress: true,
                    avatar: true,
                    dateRegistered: true,
                }
            }),
            this.prisma.collectionAnime.groupBy({
                by: ['type'],
                where: {
                    idMembre: userId,
                    ...(isOwnCollection ? {} : { isPublic: true })
                },
                _count: { type: true }
            }),
            this.prisma.collectionManga.groupBy({
                by: ['type'],
                where: {
                    idMembre: userId,
                    ...(isOwnCollection ? {} : { isPublic: true })
                },
                _count: { type: true }
            })
        ]);

        if (!user) {
            throw new NotFoundException('User not found');
        }

        const collectionTypes = [
            { type: 1, name: 'Terminé' },
            { type: 2, name: 'En cours' },
            { type: 3, name: 'Planifié' },
            { type: 4, name: 'Abandonné' }
        ];

        // Calculate collection counts by type
        const collections = collectionTypes.map(ct => {
            const animeCount = animeCounts.find(ac => ac.type === ct.type)?._count?.type || 0;
            const mangaCount = mangaCounts.find(mc => mc.type === ct.type)?._count?.type || 0;

            return {
                type: ct.type,
                name: ct.name,
                animeCount,
                mangaCount,
                totalCount: animeCount + mangaCount,
                hasItems: (animeCount + mangaCount) > 0
            };
        }).filter(c => c.hasItems);

        const totalPublicAnimes = animeCounts.reduce((sum, ac) => sum + (ac._count?.type || 0), 0);
        const totalPublicMangas = mangaCounts.reduce((sum, mc) => sum + (mc._count?.type || 0), 0);

        return {
            id: user.idMember,
            username: user.memberName,
            email: user.emailAddress,
            avatarUrl: user.avatar,
            joinedAt: user.dateRegistered ? new Date(user.dateRegistered * 1000).toISOString() : new Date().toISOString(),
            collections,
            totalPublicAnimes,
            totalPublicMangas,
            totalPublicItems: totalPublicAnimes + totalPublicMangas
        };
    }

    async getStatusCounts(
        userId: number,
        mediaType: 'anime' | 'manga' | 'both',
        collectionType?: number,
    ) {
        const statusCounts = {
            completed: 0,
            watching: 0,
            'plan-to-watch': 0,
            dropped: 0,
            'on-hold': 0,
        };

        // Use single optimized queries with groupBy to reduce connection usage
        const queries: Promise<any[]>[] = [];

        if (mediaType === 'anime' || mediaType === 'both') {
            const animeWhere: any = { idMembre: userId };
            if (collectionType !== undefined) {
                animeWhere.type = collectionType;
            }

            queries.push(
                this.prisma.executeWithRetry(() =>
                    this.prisma.collectionAnime.groupBy({
                        by: ['type'],
                        where: animeWhere,
                        _count: { type: true }
                    })
                ) as any
            );
        } else {
            queries.push(Promise.resolve([]));
        }

        if (mediaType === 'manga' || mediaType === 'both') {
            const mangaWhere: any = { idMembre: userId };
            if (collectionType !== undefined) {
                mangaWhere.type = collectionType;
            }

            queries.push(
                this.prisma.executeWithRetry(() =>
                    this.prisma.collectionManga.groupBy({
                        by: ['type'],
                        where: mangaWhere,
                        _count: { type: true }
                    })
                ) as any
            );
        } else {
            queries.push(Promise.resolve([]));
        }

        const [animeCounts, mangaCounts] = await Promise.all(queries);

        // Process anime counts
        animeCounts.forEach((count: any) => {
            switch (count.type) {
                case 1: statusCounts.completed += count._count.type; break;
                case 2: statusCounts.watching += count._count.type; break;
                case 3: statusCounts['plan-to-watch'] += count._count.type; break;
                case 4: statusCounts.dropped += count._count.type; break;
                case 5: statusCounts['on-hold'] += count._count.type; break;
            }
        });

        // Process manga counts
        mangaCounts.forEach((count: any) => {
            switch (count.type) {
                case 1: statusCounts.completed += count._count.type; break;
                case 2: statusCounts.watching += count._count.type; break;
                case 3: statusCounts['plan-to-watch'] += count._count.type; break;
                case 4: statusCounts.dropped += count._count.type; break;
                case 5: statusCounts['on-hold'] += count._count.type; break;
            }
        });

        return statusCounts;
    }
}
