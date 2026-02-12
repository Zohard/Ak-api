import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { CacheService } from '../../../shared/services/cache.service';
import { AddJeuxVideoToCollectionDto } from '../dto/add-jeuxvideo-to-collection.dto';
import { UpdateJeuxVideoCollectionDto } from '../dto/update-jeuxvideo-collection.dto';

@Injectable()
export class VideoGameCollectionService {
    private readonly logger = new Logger(VideoGameCollectionService.name);

    constructor(
        private prisma: PrismaService,
        private cacheService: CacheService,
    ) { }

    async addJeuxVideoToCollection(userId: number, type: number, dto: AddJeuxVideoToCollectionDto, currentUserId: number) {
        // Check authorization
        if (userId !== currentUserId) {
            throw new ForbiddenException('You can only modify your own collection');
        }

        // Check if game exists
        const game = await this.prisma.akJeuxVideo.findUnique({
            where: { idJeu: dto.gameId }
        });
        if (!game) {
            throw new NotFoundException('Game not found');
        }

        // Check for existing entry
        const existing = await this.prisma.collectionJeuxVideo.findFirst({
            where: {
                idMembre: userId,
                idJeu: dto.gameId,
                type
            }
        });

        let collection;

        if (existing) {
            // Update existing entry
            collection = await this.prisma.collectionJeuxVideo.update({
                where: { idCollection: existing.idCollection },
                data: {
                    evaluation: dto.rating || 0,
                    notes: dto.notes,
                    platformPlayed: dto.platformPlayed,
                    physicalPlatform: dto.physicalPlatform,
                    startedDate: dto.startedDate ? new Date(dto.startedDate) : null,
                    finishedDate: dto.finishedDate ? new Date(dto.finishedDate) : null,
                    liked: dto.liked ?? false,
                    mastered: dto.mastered ?? false,
                    isReplay: dto.isReplay ?? false,
                    logTitle: dto.logTitle || 'Log',
                    timePlayedHours: dto.timePlayedHours || 0,
                    timePlayedMinutes: dto.timePlayedMinutes || 0,
                    ownershipType: dto.ownershipType,
                    storefront: dto.storefront,
                    containsSpoilers: dto.containsSpoilers ?? false,
                },
                include: {
                    jeuxVideo: true
                }
            });
        } else {
            // Create new collection entry
            collection = await this.prisma.collectionJeuxVideo.create({
                data: {
                    idMembre: userId,
                    idJeu: dto.gameId,
                    type,
                    evaluation: dto.rating || 0,
                    notes: dto.notes,
                    platformPlayed: dto.platformPlayed,
                    physicalPlatform: dto.physicalPlatform,
                    startedDate: dto.startedDate ? new Date(dto.startedDate) : null,
                    finishedDate: dto.finishedDate ? new Date(dto.finishedDate) : null,
                    liked: dto.liked ?? false,
                    mastered: dto.mastered ?? false,
                    isReplay: dto.isReplay ?? false,
                    logTitle: dto.logTitle || 'Log',
                    timePlayedHours: dto.timePlayedHours || 0,
                    timePlayedMinutes: dto.timePlayedMinutes || 0,
                    ownershipType: dto.ownershipType,
                    storefront: dto.storefront,
                    containsSpoilers: dto.containsSpoilers ?? false,
                },
                include: {
                    jeuxVideo: true
                }
            });
        }

        // Invalidate cache
        await this.invalidateUserCollectionCache(userId);

        // OPTIMIZATION: Invalidate collection check cache
        const cacheKey = `user_collection_check:${userId}:jeu-video:${dto.gameId}`;
        await this.cacheService.del(cacheKey);

        // Invalidate media collections users cache
        await Promise.all([
            this.cacheService.del(`media_collections_users:jeu-video:${dto.gameId}:1:20`),
            this.cacheService.del(`media_collections_users:jeu-video:${dto.gameId}:1:50`),
        ]);

        // Invalidate game cache as ratings may have changed
        await this.cacheService.invalidateGame(dto.gameId);

        return collection;
    }

    async updateJeuxVideoInCollection(userId: number, collectionId: number, dto: UpdateJeuxVideoCollectionDto, currentUserId: number) {
        // Debug logging - log all parameters
        this.logger.debug('updateJeuxVideoInCollection called with:', {
            userId,
            collectionId,
            currentUserId,
            dto
        });

        // Check authorization
        if (Number(userId) !== Number(currentUserId)) {
            console.error('Authorization check failed - userId !== currentUserId:', {
                userId,
                userIdType: typeof userId,
                currentUserId,
                currentUserIdType: typeof currentUserId,
                userIdNum: Number(userId),
                currentUserIdNum: Number(currentUserId),
                areEqual: Number(userId) === Number(currentUserId)
            });
            throw new ForbiddenException('You can only modify your own collection');
        }

        // Check if entry exists and belongs to user
        const existing = await this.prisma.collectionJeuxVideo.findUnique({
            where: { idCollection: collectionId }
        });

        if (!existing) {
            throw new NotFoundException('Collection entry not found');
        }

        // Ensure type consistency for comparison
        if (Number(existing.idMembre) !== Number(userId)) {
            console.error('Ownership check failed:', {
                existingIdMembre: existing.idMembre,
                existingIdMembreType: typeof existing.idMembre,
                userId: userId,
                userIdType: typeof userId,
                collectionId: collectionId
            });
            throw new ForbiddenException('This collection entry does not belong to you');
        }

        // Update
        const updated = await this.prisma.collectionJeuxVideo.update({
            where: { idCollection: collectionId },
            data: {
                ...(dto.type !== undefined && { type: dto.type }),
                ...(dto.rating !== undefined && { evaluation: dto.rating }),
                ...(dto.notes !== undefined && { notes: dto.notes }),
                ...(dto.platformPlayed !== undefined && { platformPlayed: dto.platformPlayed }),
                ...(dto.physicalPlatform !== undefined && { physicalPlatform: dto.physicalPlatform }),
                ...(dto.startedDate !== undefined && { startedDate: dto.startedDate ? new Date(dto.startedDate) : null }),
                ...(dto.finishedDate !== undefined && { finishedDate: dto.finishedDate ? new Date(dto.finishedDate) : null }),
                ...(dto.liked !== undefined && { liked: dto.liked }),
                ...(dto.mastered !== undefined && { mastered: dto.mastered }),
                ...(dto.isReplay !== undefined && { isReplay: dto.isReplay }),
                ...(dto.logTitle !== undefined && { logTitle: dto.logTitle }),
                ...(dto.timePlayedHours !== undefined && { timePlayedHours: dto.timePlayedHours }),
                ...(dto.timePlayedMinutes !== undefined && { timePlayedMinutes: dto.timePlayedMinutes }),
                ...(dto.ownershipType !== undefined && { ownershipType: dto.ownershipType }),
                ...(dto.storefront !== undefined && { storefront: dto.storefront }),
                ...(dto.containsSpoilers !== undefined && { containsSpoilers: dto.containsSpoilers }),
                dateModified: new Date()
            },
            include: {
                jeuxVideo: true
            }
        });

        // Invalidate cache
        await this.invalidateUserCollectionCache(userId);

        // OPTIMIZATION: Invalidate collection check cache
        if (existing?.idJeu) {
            const cacheKey = `user_collection_check:${userId}:jeu-video:${existing.idJeu}`;
            await this.cacheService.del(cacheKey);

            // Invalidate media collections users cache
            await Promise.all([
                this.cacheService.del(`media_collections_users:jeu-video:${existing.idJeu}:1:20`),
                this.cacheService.del(`media_collections_users:jeu-video:${existing.idJeu}:1:50`),
            ]);

            // Invalidate game cache as ratings may have changed
            await this.cacheService.invalidateGame(existing.idJeu);
        }

        return updated;
    }

    async removeJeuxVideoFromCollection(userId: number, collectionId: number, currentUserId: number) {
        // Check authorization
        if (Number(userId) !== Number(currentUserId)) {
            throw new ForbiddenException('You can only modify your own collection');
        }

        // Check if entry exists and belongs to user
        const existing = await this.prisma.collectionJeuxVideo.findUnique({
            where: { idCollection: collectionId }
        });

        if (!existing) {
            throw new NotFoundException('Collection entry not found');
        }

        // Ensure type consistency for comparison
        if (Number(existing.idMembre) !== Number(userId)) {
            throw new ForbiddenException('This collection entry does not belong to you');
        }

        // Delete
        await this.prisma.collectionJeuxVideo.delete({
            where: { idCollection: collectionId }
        });

        // Invalidate cache
        await this.invalidateUserCollectionCache(userId);

        // OPTIMIZATION: Invalidate collection check cache
        if (existing?.idJeu) {
            const cacheKey = `user_collection_check:${userId}:jeu-video:${existing.idJeu}`;
            await this.cacheService.del(cacheKey);

            // Invalidate media collections users cache
            await Promise.all([
                this.cacheService.del(`media_collections_users:jeu-video:${existing.idJeu}:1:20`),
                this.cacheService.del(`media_collections_users:jeu-video:${existing.idJeu}:1:50`),
            ]);

            // Invalidate game cache as ratings may have changed
            await this.cacheService.invalidateGame(existing.idJeu);
        }

        return { message: 'Game removed from collection' };
    }

    async getJeuxVideoCollection(
        userId: number,
        type?: number,
        currentUserId?: number,
        page: number = 1,
        limit: number = 20,
        year?: number,
        sortBy?: string,
        sortOrder: 'asc' | 'desc' = 'desc'
    ) {
        // Cache key based on all query params
        const cacheKey = `collection_jeuxvideo:${userId}:t${type ?? 'all'}:p${page}:l${limit}:y${year ?? 'all'}:s${sortBy ?? 'default'}:${sortOrder}`;
        const cached = await this.cacheService.get(cacheKey);
        if (cached) {
            return cached;
        }

        const where: any = { idMembre: userId };
        if (type !== undefined) {
            where.type = type;
        }

        if (year) {
            where.jeuxVideo = {
                annee: year
            };
        }

        // Determine orderBy
        let orderBy: any = { dateCreated: 'desc' };
        const order = sortOrder || 'desc';

        if (sortBy === 'rating') {
            orderBy = { evaluation: order };
        } else if (sortBy === 'title') {
            orderBy = { jeuxVideo: { titre: order } };
        } else if (sortBy === 'updatedAt') {
            orderBy = { dateModified: order };
        } else if (sortBy === 'createdAt') {
            orderBy = { dateCreated: order };
        }

        const skip = (page - 1) * limit;

        // Get total count and paginated data in parallel
        const [collection, totalCount] = await Promise.all([
            this.prisma.collectionJeuxVideo.findMany({
                where,
                skip,
                take: limit,
                include: {
                    jeuxVideo: {
                        include: {
                            platforms: {
                                include: {
                                    platform: true
                                }
                            },
                            genres: {
                                include: {
                                    genre: true
                                }
                            }
                        }
                    }
                },
                orderBy
            }),
            this.prisma.collectionJeuxVideo.count({ where })
        ]);

        const result = {
            data: collection,
            meta: {
                totalCount,
                page,
                limit,
                hasMore: skip + collection.length < totalCount
            }
        };

        await this.cacheService.set(cacheKey, result, 10800); // 3 hours
        return result;
    }

    // Helper method to invalidate all collection-related cache for a user
    private async invalidateUserCollectionCache(userId: number): Promise<void> {
        try {
            // Invalidate various cache patterns for the user
            await Promise.all([
                // User collection lists cache
                this.cacheService.delByPattern(`user_collections:${userId}:*`),
                this.cacheService.delByPattern(`user_collections:v2:${userId}:*`),
                // Collection items cache
                this.cacheService.delByPattern(`collection_items:${userId}:*`),
                // Video game collection cache
                this.cacheService.delByPattern(`collection_jeuxvideo:${userId}:*`),
                this.cacheService.delByPattern(`collection_games:${userId}:*`),
                // Ratings distribution cache
                this.cacheService.delByPattern(`collection_ratings:*:${userId}:*`),
                // Find user collections cache (both own and public views)
                this.cacheService.del(`find_user_collections:${userId}:own`),
                this.cacheService.del(`find_user_collections:${userId}:public`),
            ]);
        } catch (error) {
            // Log error but don't throw to avoid breaking the main operation
            this.logger.error('Cache invalidation error for user', userId, error);
        }
    }
}
