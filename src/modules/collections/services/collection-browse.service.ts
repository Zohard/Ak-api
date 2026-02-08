import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { CacheService } from '../../../shared/services/cache.service';
import { CollectionStatisticsService } from './collection-statistics.service';

@Injectable()
export class CollectionBrowseService {
    constructor(
        private prisma: PrismaService,
        private cacheService: CacheService,
        private collectionStatisticsService: CollectionStatisticsService,
    ) { }

    // Browse all users with public collections
    async browseUserCollections(
        page: number = 1,
        limit: number = 20,
        search?: string,
        sortBy?: string,
        currentUserId?: number,
    ) {
        const skip = (page - 1) * limit;

        // Build where clause for user search
        const userWhereClause = search ? {
            pseudo: {
                contains: search,
                mode: 'insensitive' as any
            }
        } : {};

        // Build sort clause
        let orderBy: any = { memberName: 'asc' };
        if (sortBy) {
            switch (sortBy) {
                case 'username':
                    orderBy = { memberName: 'asc' };
                    break;
                case '-username':
                    orderBy = { memberName: 'desc' };
                    break;
                case 'totalItems':
                    orderBy = { idMember: 'desc' }; // We'll sort by total items in memory
                    break;
                case '-totalItems':
                    orderBy = { idMember: 'asc' }; // We'll sort by total items in memory
                    break;
                default:
                    orderBy = { memberName: 'asc' };
            }
        }

        // Get users who have at least one public collection item
        const usersWithPublicCollections = await this.prisma.smfMember.findMany({
            where: {
                ...userWhereClause,
                OR: [
                    {
                        animeCollections: {
                            some: {
                                isPublic: true
                            }
                        }
                    },
                    {
                        mangaCollections: {
                            some: {
                                isPublic: true
                            }
                        }
                    }
                ]
            },
            select: {
                idMember: true,
                memberName: true,
                emailAddress: true,
                avatar: true,
                dateRegistered: true,
                _count: {
                    select: {
                        animeCollections: {
                            where: { isPublic: true }
                        },
                        mangaCollections: {
                            where: { isPublic: true }
                        }
                    }
                }
            },
            orderBy,
            skip,
            take: limit
        });

        // Get total count
        const totalUsers = await this.prisma.smfMember.count({
            where: {
                ...userWhereClause,
                OR: [
                    {
                        animeCollections: {
                            some: {
                                isPublic: true
                            }
                        },
                    },
                    {
                        mangaCollections: {
                            some: {
                                isPublic: true
                            }
                        }
                    }
                ]
            }
        });

        // Transform data to include collection summaries
        // OPTIMIZED: Batch query all user collection counts at once to avoid N+1
        const userIds = usersWithPublicCollections.map(u => u.idMember);

        // Batch fetch all anime and manga counts for all users in parallel
        const [animeCountsAll, mangaCountsAll] = await Promise.all([
            this.prisma.collectionAnime.groupBy({
                by: ['idMembre', 'type'],
                where: {
                    idMembre: { in: userIds },
                    isPublic: true
                },
                _count: {
                    type: true
                }
            }),
            this.prisma.collectionManga.groupBy({
                by: ['idMembre', 'type'],
                where: {
                    idMembre: { in: userIds },
                    isPublic: true
                },
                _count: {
                    type: true
                }
            })
        ]);

        // Create lookup maps for O(1) access
        const animeCountMap = new Map<number, Map<number, number>>();
        animeCountsAll.forEach(item => {
            if (!animeCountMap.has(item.idMembre)) {
                animeCountMap.set(item.idMembre, new Map());
            }
            animeCountMap.get(item.idMembre)!.set(item.type, item._count.type);
        });

        const mangaCountMap = new Map<number, Map<number, number>>();
        mangaCountsAll.forEach(item => {
            if (!mangaCountMap.has(item.idMembre)) {
                mangaCountMap.set(item.idMembre, new Map());
            }
            mangaCountMap.get(item.idMembre)!.set(item.type, item._count.type);
        });

        const collectionTypes = [
            { type: 1, name: 'Terminé' },
            { type: 2, name: 'En cours' },
            { type: 3, name: 'Planifié' },
            { type: 4, name: 'Abandonné' }
        ];

        // Map users with their collection data (now O(n) instead of O(n²))
        const users = usersWithPublicCollections.map((user: any) => {
            const userAnimeCounts = animeCountMap.get(user.idMember) || new Map();
            const userMangaCounts = mangaCountMap.get(user.idMember) || new Map();

            const collections = collectionTypes.map(collectionType => {
                const animeCount = userAnimeCounts.get(collectionType.type) || 0;
                const mangaCount = userMangaCounts.get(collectionType.type) || 0;
                const totalCount = animeCount + mangaCount;

                return {
                    type: collectionType.type,
                    name: collectionType.name,
                    animeCount,
                    mangaCount,
                    totalCount,
                    hasItems: totalCount > 0
                };
            }).filter(c => c.hasItems); // Only include collections with items

            return {
                id: user.idMember,
                username: user.memberName,
                avatarUrl: user.avatar,
                joinedAt: user.dateRegistered ? new Date(user.dateRegistered * 1000).toISOString() : new Date().toISOString(),
                collections,
                totalPublicAnimes: user._count.animeCollections,
                totalPublicMangas: user._count.mangaCollections,
                totalPublicItems: user._count.animeCollections + user._count.mangaCollections
            };
        });

        // Sort by total items if requested
        if (sortBy === 'totalItems') {
            users.sort((a, b) => b.totalPublicItems - a.totalPublicItems);
        } else if (sortBy === '-totalItems') {
            users.sort((a, b) => a.totalPublicItems - b.totalPublicItems);
        }

        const totalPages = Math.ceil(totalUsers / limit);

        return {
            data: users,
            meta: {
                total: totalUsers,
                page,
                limit,
                totalPages,
                hasMore: page < totalPages
            }
        };
    }

    // Get all collections for a user (virtual collections based on type)
    async findUserCollections(userId: number, currentUserId?: number) {
        // Only show collections if it's the current user or collections are public
        const isOwnCollection = currentUserId === userId;

        // Create cache key - different keys for own vs public view, with version for separate anime/manga sample images
        const cacheKey = `find_user_collections:v3:${userId}:${isOwnCollection ? 'own' : 'public'}`;

        // Try to get from cache
        const cached = await this.cacheService.get(cacheKey);
        if (cached) {
            return cached;
        }

        // Get from database
        const result = await this.findUserCollectionsFromDB(userId, currentUserId);

        // Cache for 40 minutes (longer since this data changes less frequently)
        await this.cacheService.set(cacheKey, result, 2400);

        return result;
    }

    private async findUserCollectionsFromDB(userId: number, currentUserId?: number) {
        // Only show collections if it's the current user or collections are public
        const isOwnCollection = currentUserId === userId;

        const collectionTypes = [
            { type: 1, name: 'Terminé', description: 'Completed items' },
            { type: 2, name: 'En cours', description: 'Currently watching/reading items' },
            { type: 3, name: 'Planifié', description: 'Items planned to be watched/read' },
            { type: 4, name: 'Abandonné', description: 'Dropped items' }
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

        // Get sample images for each collection type that has items (separate for anime and manga)
        const typesWithItems = collectionTypes
            .map(ct => ct.type)
            .filter(type => {
                const animeCount = animeCounts.find(ac => ac.type === type)?._count?.type || 0;
                const mangaCount = mangaCounts.find(mc => mc.type === type)?._count?.type || 0;
                return animeCount > 0 || mangaCount > 0;
            });

        // OPTIMIZATION: Batch fetch all sample images at once instead of per type
        const [animeSamples, mangaSamples] = await Promise.all([
            this.prisma.collectionAnime.findMany({
                where: {
                    idMembre: userId,
                    type: { in: typesWithItems },
                    ...(isOwnCollection ? {} : { isPublic: true }),
                    anime: {
                        image: {
                            not: null
                        }
                    }
                },
                include: { anime: { select: { image: true } } },
                orderBy: { idCollection: 'desc' },
                // Get one sample per type by taking first N items
                take: typesWithItems.length * 2 // Allow up to 2 per type to ensure we get one for each
            }),
            this.prisma.collectionManga.findMany({
                where: {
                    idMembre: userId,
                    type: { in: typesWithItems },
                    ...(isOwnCollection ? {} : { isPublic: true }),
                    manga: {
                        image: {
                            not: null
                        }
                    }
                },
                include: { manga: { select: { image: true } } },
                orderBy: { idCollection: 'desc' },
                take: typesWithItems.length * 2
            })
        ]);

        // Map samples by type (get first anime and manga for each type)
        const sampleImages = typesWithItems.map((type) => {
            const animeItem = animeSamples.find(item => item.type === type);
            const mangaItem = mangaSamples.find(item => item.type === type);

            return {
                type,
                animeImage: animeItem?.anime?.image || null,
                mangaImage: mangaItem?.manga?.image || null
            };
        });

        const animeImageMap = new Map(sampleImages.map(item => [item.type, item.animeImage]));
        const mangaImageMap = new Map(sampleImages.map(item => [item.type, item.mangaImage]));

        // Create collection objects
        const collections = collectionTypes.map(collectionType => {
            const animeCount = animeCounts.find(ac => ac.type === collectionType.type)?._count?.type || 0;
            const mangaCount = mangaCounts.find(mc => mc.type === collectionType.type)?._count?.type || 0;

            return {
                id: `${userId}-${collectionType.type}`,
                userId: userId,
                type: collectionType.type,
                name: collectionType.name,
                description: collectionType.description,
                isPublic: true,
                animeCount,
                mangaCount,
                totalCount: animeCount + mangaCount,
                sampleImage: animeImageMap.get(collectionType.type) || mangaImageMap.get(collectionType.type) || null,
                animeSampleImage: animeImageMap.get(collectionType.type) || null,
                mangaSampleImage: mangaImageMap.get(collectionType.type) || null
            };
        });

        // Calculate overall status counts
        const statusCounts = await this.collectionStatisticsService.getStatusCounts(userId, 'both');
        const overallTotalCount = collections.reduce((sum, col) => sum + col.totalCount, 0);

        return {
            data: collections,
            meta: {
                total: collections.length,
                totalCount: overallTotalCount,
                statusCounts,
                page: 1,
                limit: collections.length,
                totalPages: 1,
                hasMore: false
            }
        };
    }

    // Get collection details by type
    async findCollectionByType(userId: number, type: number, currentUserId?: number) {
        const isOwnCollection = currentUserId === userId;

        const collectionTypes = {
            1: { name: 'Terminé', description: 'Completed items' },
            2: { name: 'En cours', description: 'Currently watching/reading items' },
            3: { name: 'Planifié', description: 'Items planned to be watched/read' },
            4: { name: 'Abandonné', description: 'Dropped items' }
        };

        const collectionInfo = collectionTypes[type];
        if (!collectionInfo) {
            throw new NotFoundException('Collection type not found');
        }

        // Get counts
        const animeCount = await this.prisma.collectionAnime.count({
            where: {
                idMembre: userId,
                type: type,
                ...(isOwnCollection ? {} : { isPublic: true })
            }
        });

        const mangaCount = await this.prisma.collectionManga.count({
            where: {
                idMembre: userId,
                type: type,
                ...(isOwnCollection ? {} : { isPublic: true })
            }
        });

        return {
            collection: {
                id: `${userId}-${type}`,
                userId: userId,
                type: type,
                name: collectionInfo.name,
                description: collectionInfo.description,
                isPublic: true,
                animeCount,
                mangaCount,
                totalCount: animeCount + mangaCount
            }
        };
    }

    /**
     * Get users who have this anime/manga in their collection with their evaluations
     */
    async getUsersWithMedia(
        mediaType: 'anime' | 'manga',
        mediaId: number,
        page: number = 1,
        limit: number = 20,
        currentUserId?: number,
        friendsOnly: boolean = false
    ) {
        // OPTIMIZATION: Cache users with media to reduce DB load
        const cacheKey = `media_collections_users:${mediaType}:${mediaId}:${page}:${limit}:${friendsOnly ? 'friends' : 'all'}${currentUserId ? `:user${currentUserId}` : ''}`;
        const cached = await this.cacheService.get(cacheKey);
        if (cached) {
            return cached;
        }

        const skip = (page - 1) * limit;

        // Get current user's friends list if friendsOnly is true
        let friendIds: number[] = [];
        if (friendsOnly && currentUserId) {
            const currentUser = await this.prisma.smfMember.findUnique({
                where: { idMember: currentUserId },
                select: { buddyList: true }
            });

            if (currentUser?.buddyList) {
                // Parse comma-separated buddy list
                friendIds = currentUser.buddyList
                    .split(',')
                    .map(id => parseInt(id.trim()))
                    .filter(id => !isNaN(id));
            }
        }

        // If friends only but no friends, return empty
        if (friendsOnly && friendIds.length === 0) {
            return {
                data: [],
                meta: {
                    totalCount: 0,
                    friendsCount: 0,
                    page,
                    limit,
                    hasMore: false
                }
            };
        }

        // Query based on media type (separate queries for TypeScript type safety)
        let collections: any[];
        let totalCount: number;
        let friendsCount: number = 0;

        if (mediaType === 'anime') {
            const where: any = {
                idAnime: mediaId,
                isPublic: true,
                idMembre: { gt: 0 }, // Exclude orphaned collections
            };

            // Query for main data
            const queryWhere = { ...where };
            if (friendsOnly && friendIds.length > 0) {
                queryWhere.idMembre = { in: friendIds };
            }

            const promises: any[] = [
                this.prisma.collectionAnime.findMany({
                    where: queryWhere,
                    skip,
                    take: limit,
                    select: {
                        idMembre: true,
                        type: true,
                        evaluation: true,
                        user: {
                            select: {
                                idMember: true,
                                memberName: true,
                                avatar: true,
                            }
                        }
                    },
                    orderBy: [
                        { evaluation: 'desc' },
                        { user: { memberName: 'asc' } }
                    ]
                }),
                this.prisma.collectionAnime.count({ where: queryWhere })
            ];

            // If not filtering by friends but user is logged in, calculate friends count separately
            if (!friendsOnly && currentUserId && friendIds.length > 0) {
                promises.push(this.prisma.collectionAnime.count({
                    where: {
                        ...where,
                        idMembre: { in: friendIds }
                    }
                }));
            }

            const results = await Promise.all(promises);
            collections = results[0];
            totalCount = results[1];

            if (friendsOnly) {
                friendsCount = totalCount;
            } else if (results.length > 2) {
                friendsCount = results[2];
            } else {
                friendsCount = 0;
            }
        } else {
            const where: any = {
                idManga: mediaId,
                isPublic: true,
                idMembre: { gt: 0 }, // Exclude orphaned collections
            };

            // Query for main data
            const queryWhere = { ...where };
            if (friendsOnly && friendIds.length > 0) {
                queryWhere.idMembre = { in: friendIds };
            }

            const promises: any[] = [
                this.prisma.collectionManga.findMany({
                    where: queryWhere,
                    skip,
                    take: limit,
                    select: {
                        idMembre: true,
                        type: true,
                        evaluation: true,
                        user: {
                            select: {
                                idMember: true,
                                memberName: true,
                                avatar: true,
                            }
                        }
                    },
                    orderBy: [
                        { evaluation: 'desc' },
                        { user: { memberName: 'asc' } }
                    ]
                }),
                this.prisma.collectionManga.count({ where: queryWhere })
            ];

            // If not filtering by friends but user is logged in, calculate friends count separately
            if (!friendsOnly && currentUserId && friendIds.length > 0) {
                promises.push(this.prisma.collectionManga.count({
                    where: {
                        ...where,
                        idMembre: { in: friendIds }
                    }
                }));
            }

            const results = await Promise.all(promises);
            collections = results[0];
            totalCount = results[1];

            if (friendsOnly) {
                friendsCount = totalCount;
            } else if (results.length > 2) {
                friendsCount = results[2];
            } else {
                friendsCount = 0;
            }
        }

        // Map collection type to status label
        const getStatusLabel = (type: number): string => {
            const statusMap: Record<number, string> = {
                1: 'Terminé',
                2: 'En cours',
                3: 'Wishlist',
                4: 'Abandonné',
                5: 'En pause'
            };
            return statusMap[type] || 'Inconnu';
        };

        // Format the response
        const users = collections.map(collection => ({
            userId: collection.idMembre,
            pseudo: collection.user.memberName,
            avatar: collection.user.avatar,
            status: getStatusLabel(collection.type),
            statusCode: collection.type,
            evaluation: collection.evaluation || 0,
            isCurrentUser: currentUserId === collection.idMembre
        }));

        const result = {
            data: users,
            meta: {
                totalCount,
                friendsCount,
                page,
                limit,
                hasMore: skip + collections.length < totalCount
            }
        };

        // OPTIMIZATION: Cache for 5 minutes
        await this.cacheService.set(cacheKey, result, 300);

        return result;
    }
}
