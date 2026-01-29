import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { JikanService } from '../jikan/jikan.service';
import { CollectionStatisticsService } from './services/collection-statistics.service';
import { AddAnimeToCollectionDto } from './dto/add-anime-to-collection.dto';
import { AddMangaToCollectionDto } from './dto/add-manga-to-collection.dto';
import { AddJeuxVideoToCollectionDto } from './dto/add-jeuxvideo-to-collection.dto';
import { UpdateJeuxVideoCollectionDto } from './dto/update-jeuxvideo-collection.dto';
import { AddToCollectionDto } from './dto/add-to-collection.dto';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { CollectionQueryDto } from './dto/collection-query.dto';


@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);

  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
    private jikanService: JikanService,
    private collectionStatisticsService: CollectionStatisticsService,
  ) { }

  async createCollection(userId: number, createCollectionDto: CreateCollectionDto) {
    // This method isn't really applicable with the existing table structure
    // Return a mock response since collections are created automatically
    return {
      id: Date.now(),
      name: createCollectionDto.name,
      description: createCollectionDto.description,
      isPublic: createCollectionDto.isPublic ?? true,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async getUserCollections(userId: number, query: CollectionQueryDto) {
    const { page = 1, limit = 10, search } = query;

    // Skip cache for search queries
    if (search) {
      return this.getUserCollectionsFromDB(userId, query);
    }

    // Create cache key with version for sample images
    const cacheKey = `user_collections:v2:${userId}:${page}:${limit}`;

    // Try to get from cache
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Get from database
    const result = await this.getUserCollectionsFromDB(userId, query);

    // Cache for 20 minutes
    await this.cacheService.set(cacheKey, result, 1200);

    return result;
  }

  private async getUserCollectionsFromDB(userId: number, query: CollectionQueryDto) {
    const { page = 1, limit = 10, search } = query;
    const skip = (page - 1) * limit;

    // Use optimized groupBy queries to get counts for all types in one query each
    const [animeCounts, mangaCounts] = await Promise.all([
      this.prisma.collectionAnime.groupBy({
        by: ['type'],
        where: { idMembre: userId },
        _count: { type: true }
      }),
      this.prisma.collectionManga.groupBy({
        by: ['type'],
        where: { idMembre: userId },
        _count: { type: true }
      })
    ]);

    const collections: Array<{
      id: number;
      name: string;
      type: number;
      isPublic: boolean;
      userId: number;
      animeCount: number;
      mangaCount: number;
      totalCount: number;
      sampleImage: string | null;
      createdAt: Date;
      updatedAt: Date;
    }> = [];
    const typeNames = this.getCollectionTypeNames();

    // Create maps for fast lookup
    const animeCountMap = new Map(animeCounts.map(item => [item.type, item._count.type]));
    const mangaCountMap = new Map(mangaCounts.map(item => [item.type, item._count.type]));

    // Get all unique types from both collections
    const allTypes = new Set([
      ...animeCounts.map(c => c.type),
      ...mangaCounts.map(c => c.type)
    ]);

    // Get status counts for meta
    const statusCounts = {
      completed: 0,
      watching: 0,
      'plan-to-watch': 0,
      dropped: 0,
      'on-hold': 0,
    };

    let totalCount = 0;

    // Get sample images for each collection type
    const sampleImages = await Promise.all(
      Array.from(allTypes).map(async (type) => {
        // Try to get an anime first, then manga
        const animeItem = await this.prisma.collectionAnime.findFirst({
          where: {
            idMembre: userId,
            type,
            anime: {
              image: {
                not: null
              }
            }
          },
          include: { anime: { select: { image: true } } },
          orderBy: { idCollection: 'desc' }
        });

        if (animeItem?.anime?.image) {
          return { type, image: animeItem.anime.image };
        }

        const mangaItem = await this.prisma.collectionManga.findFirst({
          where: {
            idMembre: userId,
            type,
            manga: {
              image: {
                not: null
              }
            }
          },
          include: { manga: { select: { image: true } } },
          orderBy: { idCollection: 'desc' }
        });

        return { type, image: mangaItem?.manga?.image || null };
      })
    );

    const imageMap = new Map(sampleImages.map(item => [item.type, item.image]));

    for (const type of allTypes) {
      const animeCount = animeCountMap.get(type) || 0;
      const mangaCount = mangaCountMap.get(type) || 0;
      const typeTotal = animeCount + mangaCount;
      totalCount += typeTotal;

      // Map type to status name for counts
      switch (type) {
        case 1:
          statusCounts.completed = typeTotal;
          break;
        case 2:
          statusCounts.watching = typeTotal;
          break;
        case 3:
          statusCounts['plan-to-watch'] = typeTotal;
          break;
        case 4:
          statusCounts.dropped = typeTotal;
          break;
        case 5:
          statusCounts['on-hold'] = typeTotal;
          break;
      }

      collections.push({
        id: type,
        name: typeNames[type] || 'Collection personnalisée',
        type,
        isPublic: true,
        userId,
        animeCount,
        mangaCount,
        totalCount: typeTotal,
        sampleImage: imageMap.get(type) || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const totalCollectionTypes = collections.length;
    const paginatedCollections = collections.slice(skip, skip + limit);

    return {
      data: paginatedCollections,
      meta: {
        totalCount,
        statusCounts,
      },
      pagination: {
        page,
        limit,
        total: totalCollectionTypes,
        totalPages: Math.ceil(totalCollectionTypes / limit),
      },
    };
  }

  async addToCollection(userId: number, addToCollectionDto: AddToCollectionDto) {
    const { mediaId, mediaType, type, rating, notes, nbChapitresLu } = addToCollectionDto;
    const collectionType = this.getCollectionTypeFromName(type);

    // Normalize rating to 0-5 range (supports 0.5 increments for half-stars)
    const normalizedRating = Math.max(0, Math.min(5, rating ?? 0));

    let result: any;

    try {
      if (mediaType === 'anime') {
        // Verify media exists
        const anime = await this.prisma.executeWithRetry(() =>
          this.prisma.akAnime.findUnique({ where: { idAnime: mediaId } })
        );
        if (!anime) {
          throw new NotFoundException('Anime not found');
        }

        // Check if already in collection for this user+media (any type)
        const existingAny = await this.prisma.executeWithRetry(() =>
          this.prisma.collectionAnime.findFirst({
            where: { idMembre: userId, idAnime: mediaId },
          })
        );
        if (existingAny) {
          await this.prisma.executeWithRetry(() =>
            this.prisma.collectionAnime.updateMany({
              where: { idMembre: userId, idAnime: mediaId },
              data: {
                type: collectionType,
                evaluation: normalizedRating,
                notes: notes || null,
                isPublic: true,
                updatedAt: new Date(),
              },
            })
          );
          result = await this.prisma.executeWithRetry(() =>
            this.prisma.collectionAnime.findFirst({
              where: { idMembre: userId, idAnime: mediaId },
              include: {
                anime: {
                  select: { idAnime: true, titre: true, image: true, annee: true, moyenneNotes: true },
                },
              },
            })
          );
        } else {
          result = await this.prisma.executeWithRetry(() =>
            this.prisma.collectionAnime.create({
              data: {
                idMembre: userId,
                idAnime: mediaId,
                type: collectionType,
                evaluation: normalizedRating,
                notes: notes || null,
                isPublic: true,
              },
              include: {
                anime: {
                  select: { idAnime: true, titre: true, image: true, annee: true, moyenneNotes: true, nbEp: true },
                },
              },
            })
          );
        }
      } else if (mediaType === 'manga') {
        // mediaType === 'manga'
        const manga = await this.prisma.executeWithRetry(() =>
          this.prisma.akManga.findUnique({ where: { idManga: mediaId } })
        );
        if (!manga) {
          throw new NotFoundException('Manga not found');
        }

        const existingAny = await this.prisma.executeWithRetry(() =>
          this.prisma.collectionManga.findFirst({
            where: { idMembre: userId, idManga: mediaId },
          })
        );
        if (existingAny) {
          await this.prisma.executeWithRetry(() =>
            this.prisma.collectionManga.updateMany({
              where: { idMembre: userId, idManga: mediaId },
              data: {
                type: collectionType,
                evaluation: normalizedRating,
                notes: notes || null,
                nbChapitresLu: nbChapitresLu || 0,
                isPublic: true,
                updatedAt: new Date(),
              },
            })
          );
          result = await this.prisma.executeWithRetry(() =>
            this.prisma.collectionManga.findFirst({
              where: { idMembre: userId, idManga: mediaId },
              include: {
                manga: {
                  select: { idManga: true, titre: true, image: true, annee: true, moyenneNotes: true, nbVol: true },
                },
              },
            })
          );
        } else {
          result = await this.prisma.executeWithRetry(() =>
            this.prisma.collectionManga.create({
              data: {
                idMembre: userId,
                idManga: mediaId,
                type: collectionType,
                evaluation: normalizedRating,
                notes: notes || null,
                nbChapitresLu: nbChapitresLu || 0,
                isPublic: true,
              },
              include: {
                manga: {
                  select: { idManga: true, titre: true, image: true, annee: true, moyenneNotes: true, nbVol: true },
                },
              },
            })
          );
        }
      }
    } catch (err: any) {
      // Map known Prisma errors to proper HTTP errors; log for debugging
      const code = err?.code;
      if (code === 'P2003') {
        // Foreign key constraint failed (invalid user or media id)
        throw new NotFoundException('Related resource not found');
      }
      if (code === 'P2002') {
        // Unique constraint hit (DB enforces one row per user+media). Perform update instead.
        if (mediaType === 'anime') {
          await this.prisma.collectionAnime.updateMany({
            where: { idMembre: userId, idAnime: mediaId },
            data: {
              type: collectionType,
              evaluation: normalizedRating,
              notes: notes || null,
              isPublic: true,
              updatedAt: new Date(),
            },
          });
          result = await this.prisma.collectionAnime.findFirst({
            where: { idMembre: userId, idAnime: mediaId },
            include: {
              anime: {
                select: { idAnime: true, titre: true, image: true, annee: true, moyenneNotes: true },
              },
            },
          });
        } else {
          await this.prisma.collectionManga.updateMany({
            where: { idMembre: userId, idManga: mediaId },
            data: {
              type: collectionType,
              evaluation: normalizedRating,
              notes: notes || null,
              nbChapitresLu: nbChapitresLu || 0,
              isPublic: true,
              updatedAt: new Date(),
            },
          });
          result = await this.prisma.collectionManga.findFirst({
            where: { idMembre: userId, idManga: mediaId },
            include: {
              manga: {
                select: { idManga: true, titre: true, image: true, annee: true, moyenneNotes: true, nbVol: true },
              },
            },
          });
        }
      }
      // Re-throw known HTTP exceptions
      if (err?.status && err?.response) {
        throw err;
      }
      // Log unexpected errors and fail gracefully instead of generic 500
      this.logger.error('addToCollection unexpected error', {
        userId,
        mediaId,
        mediaType,
        collectionType,
        err: { message: err?.message, code: err?.code },
      });
      throw new BadRequestException('Unable to add to collection');
    } finally {
      // CRITICAL: Invalidate cache BEFORE returning response to prevent race condition
      // where client checks collection status before cache is invalidated
      this.logger.debug(`🗑️ [addToCollection] Starting cache invalidation for userId=${userId}, ${mediaType}=${mediaId}`);

      // Invalidate user's collection cache after any add operation
      await this.invalidateUserCollectionCache(userId);

      // OPTIMIZATION: Invalidate collection check cache
      const cacheKey = `user_collection_check:${userId}:${mediaType}:${mediaId}`;
      this.logger.debug(`🗑️ [addToCollection] Invalidating cache key: ${cacheKey}`);
      await this.cacheService.del(cacheKey);
      this.logger.debug(`✅ [addToCollection] Cache invalidated for key: ${cacheKey}`);

      // OPTIMIZED: Delete known pagination keys instead of SCAN
      // Media collections users cache has short TTL, delete first pages only
      await Promise.all([
        this.cacheService.del(`media_collections_users:${mediaType}:${mediaId}:1:20`),
        this.cacheService.del(`media_collections_users:${mediaType}:${mediaId}:1:50`),
      ]);

      // Invalidate anime/manga cache as ratings may have changed
      if (mediaType === 'anime') {
        await this.cacheService.invalidateAnime(mediaId);
      } else if (mediaType === 'manga') {
        await this.cacheService.invalidateManga(mediaId);
      }

      this.logger.debug(`✅ [addToCollection] All cache invalidation complete for userId=${userId}, ${mediaType}=${mediaId}`);
    }

    return result;
  }

  async getCollectionItems(userId: number, query: CollectionQueryDto) {
    const { page = 1, limit = 20, mediaType, type, search } = query;

    // Skip cache for search queries
    if (search) {
      return this.getCollectionItemsFromDB(userId, query);
    }

    // Create cache key including all relevant parameters
    const collectionType = type ? this.getCollectionTypeFromName(type) : 'all';
    const { year, sortBy, sortOrder } = query;
    const cacheKey = `collection_items:${userId}:${mediaType || 'all'}:${collectionType}:${page}:${limit}:${year || 'all'}:${sortBy || 'def'}:${sortOrder || 'def'}`;

    // Try to get from cache
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Get from database
    const result = await this.getCollectionItemsFromDB(userId, query);

    // Cache for 20 minutes
    await this.cacheService.set(cacheKey, result, 1200);

    return result;
  }

  private async getCollectionItemsFromDB(userId: number, query: CollectionQueryDto) {
    const { page = 1, limit = 20, mediaType, type, search, year, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;

    const collectionType = type ? this.getCollectionTypeFromName(type) : undefined;

    // Helper to determine orderBy for Prisma
    const getOrderBy = (mType: 'anime' | 'manga') => {
      const order: 'asc' | 'desc' = sortOrder === 'asc' ? 'asc' : 'desc';
      if (sortBy === 'rating') return { evaluation: order };
      if (sortBy === 'title' || sortBy === 'name') return mType === 'anime' ? { anime: { titre: order } } : { manga: { titre: order } };
      if (sortBy === 'updatedAt') return { updatedAt: order };
      // Default to createdAt
      return { createdAt: order };
    };

    if (!mediaType || mediaType === 'anime') {
      const animeWhere: any = {
        idMembre: userId,
      };

      if (collectionType !== undefined) {
        animeWhere.type = collectionType;
      }

      const hasAnimeFilter = search || year;
      if (hasAnimeFilter) {
        animeWhere.anime = {};
        if (search) {
          animeWhere.anime.OR = [
            { titre: { contains: search, mode: 'insensitive' } },
            { titreOrig: { contains: search, mode: 'insensitive' } },
            { titresAlternatifs: { contains: search, mode: 'insensitive' } },
          ];
        }
        if (year) {
          animeWhere.anime.annee = year;
        }
      }

      const [animes, animeTotal] = await this.prisma.executeWithRetry(async () => {
        return Promise.all([
          this.prisma.collectionAnime.findMany({
            where: animeWhere,
            skip: mediaType === 'anime' ? skip : 0,
            take: mediaType === 'anime' ? limit : undefined,
            orderBy: getOrderBy('anime'),
            include: {
              anime: {
                select: {
                  idAnime: true,
                  titre: true,
                  image: true,
                  annee: true,
                  moyenneNotes: true,
                  synopsis: true,
                  nbEp: true,
                },
              },
            },
          }),
          this.prisma.collectionAnime.count({ where: animeWhere }),
        ]);
      });

      if (mediaType === 'anime') {
        // Calculate status counts for anime
        const statusCounts = await this.prisma.executeWithRetry(async () => {
          return this.collectionStatisticsService.getStatusCounts(userId, 'anime', collectionType);
        });

        // Enrich anime data with season information
        const enrichedAnimes = await this.enrichAnimesWithSeasons(animes);

        return {
          data: enrichedAnimes.map(a => ({
            ...a,
            mediaType: 'anime',
          })),
          meta: {
            totalCount: animeTotal,
            statusCounts,
          },
          pagination: {
            page,
            limit,
            total: animeTotal,
            totalPages: Math.ceil(animeTotal / limit),
          },
        };
      }
    }

    if (!mediaType || mediaType === 'manga') {
      const mangaWhere: any = {
        idMembre: userId,
      };

      if (collectionType !== undefined) {
        mangaWhere.type = collectionType;
      }

      const hasMangaFilter = search || year;
      if (hasMangaFilter) {
        mangaWhere.manga = {};
        if (search) {
          mangaWhere.manga.OR = [
            { titre: { contains: search, mode: 'insensitive' } },
            { titreOrig: { contains: search, mode: 'insensitive' } },
            { titresAlternatifs: { contains: search, mode: 'insensitive' } },
          ];
        }
        if (year) {
          mangaWhere.manga.annee = String(year); // manga.annee is varchar
        }
      }

      const [mangas, mangaTotal] = await this.prisma.executeWithRetry(async () => {
        return Promise.all([
          this.prisma.collectionManga.findMany({
            where: mangaWhere,
            skip: mediaType === 'manga' ? skip : 0,
            take: mediaType === 'manga' ? limit : undefined,
            orderBy: getOrderBy('manga'),
            include: {
              manga: {
                select: {
                  idManga: true,
                  titre: true,
                  image: true,
                  annee: true,
                  moyenneNotes: true,
                  synopsis: true,
                  nbVol: true,
                },
              },
            },
          }),
          this.prisma.collectionManga.count({ where: mangaWhere }),
        ]);
      });

      if (mediaType === 'manga') {
        // Calculate status counts for manga
        const statusCounts = await this.prisma.executeWithRetry(async () => {
          return this.collectionStatisticsService.getStatusCounts(userId, 'manga', collectionType);
        });

        return {
          data: mangas.map(m => ({
            ...m,
            mediaType: 'manga',
          })),
          meta: {
            totalCount: mangaTotal,
            statusCounts,
          },
          pagination: {
            page,
            limit,
            total: mangaTotal,
            totalPages: Math.ceil(mangaTotal / limit),
          },
        };
      }
    }

    // Return both if no specific mediaType
    const animeWhere: any = { idMembre: userId };
    const mangaWhere: any = { idMembre: userId };

    if (collectionType !== undefined) {
      animeWhere.type = collectionType;
      mangaWhere.type = collectionType;
    }

    if (search || year) {
      animeWhere.anime = {};
      mangaWhere.manga = {};
      if (search) {
        animeWhere.anime.OR = [
          { titre: { contains: search, mode: 'insensitive' } },
          { titreOrig: { contains: search, mode: 'insensitive' } },
          { titresAlternatifs: { contains: search, mode: 'insensitive' } },
        ];
        mangaWhere.manga.OR = [
          { titre: { contains: search, mode: 'insensitive' } },
          { titreOrig: { contains: search, mode: 'insensitive' } },
          { titresAlternatifs: { contains: search, mode: 'insensitive' } },
        ];
      }
      if (year) {
        animeWhere.anime.annee = year;
        mangaWhere.manga.annee = String(year); // manga.annee is varchar
      }
    }

    const [animes, mangas] = await this.prisma.executeWithRetry(async () => {
      return Promise.all([
        this.prisma.collectionAnime.findMany({
          where: animeWhere,
          orderBy: getOrderBy('anime'),
          include: {
            anime: {
              select: {
                idAnime: true,
                titre: true,
                image: true,
                annee: true,
                moyenneNotes: true,
                synopsis: true,
                nbEp: true,
              },
            },
          },
        }),
        this.prisma.collectionManga.findMany({
          where: mangaWhere,
          orderBy: getOrderBy('manga'),
          include: {
            manga: {
              select: {
                idManga: true,
                titre: true,
                image: true,
                annee: true,
                moyenneNotes: true,
                synopsis: true,
                nbVol: true,
              },
            },
          },
        }),
      ]);
    });

    const combined = [
      ...animes.map(a => ({ ...a, mediaType: 'anime' })),
      ...mangas.map(m => ({ ...m, mediaType: 'manga' })),
    ].sort((a: any, b: any) => {
      // In-memory sort needed for mixed results
      const order = sortOrder === 'asc' ? 1 : -1;

      if (sortBy === 'rating') {
        return ((a.evaluation || 0) - (b.evaluation || 0)) * order;
      }
      if (sortBy === 'title' || sortBy === 'name') {
        const titleA = a.mediaType === 'anime' ? a.anime?.titre : a.manga?.titre;
        const titleB = b.mediaType === 'anime' ? b.anime?.titre : b.manga?.titre;
        return (titleA || '').localeCompare(titleB || '') * order;
      }
      if (sortBy === 'updatedAt') {
        return (new Date(a.updatedAt || 0).getTime() - new Date(b.updatedAt || 0).getTime()) * order;
      }
      // Default createdAt
      return (new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()) * order;
    });

    const paginatedData = combined.slice(skip, skip + limit);

    // Calculate status counts for combined data
    const statusCounts = await this.prisma.executeWithRetry(async () => {
      return this.collectionStatisticsService.getStatusCounts(userId, 'both', collectionType);
    });

    return {
      data: paginatedData,
      meta: {
        totalCount: combined.length,
        statusCounts,
      },
      pagination: {
        page,
        limit,
        total: combined.length,
        totalPages: Math.ceil(combined.length / limit),
      },
    };
  }

  async removeFromCollection(userId: number, mediaId: number, mediaType: 'anime' | 'manga') {
    if (mediaType === 'anime') {
      const deleted = await this.prisma.collectionAnime.deleteMany({
        where: {
          idMembre: userId,
          idAnime: mediaId,
        },
      });

      if (deleted.count === 0) {
        throw new NotFoundException('Anime not found in any collection');
      }
    } else {
      const deleted = await this.prisma.collectionManga.deleteMany({
        where: {
          idMembre: userId,
          idManga: mediaId,
        },
      });

      if (deleted.count === 0) {
        throw new NotFoundException('Manga not found in any collection');
      }
    }

    // Invalidate user's collection cache after removal
    await this.invalidateUserCollectionCache(userId);

    // OPTIMIZATION: Invalidate collection check cache
    const cacheKey = `user_collection_check:${userId}:${mediaType}:${mediaId}`;
    await this.cacheService.del(cacheKey);

    // OPTIMIZATION: Invalidate media collections users cache
    // OPTIMIZED: Delete known keys instead of SCAN
      await Promise.all([
        this.cacheService.del(`media_collections_users:${mediaType}:${mediaId}:1:20`),
        this.cacheService.del(`media_collections_users:${mediaType}:${mediaId}:1:50`),
      ]);

    // Invalidate anime/manga/game cache as ratings may have changed
    if (mediaType === 'anime') {
      await this.cacheService.invalidateAnime(mediaId);
    } else if (mediaType === 'manga') {
      await this.cacheService.invalidateManga(mediaId);
    } else if (mediaType === 'game') {
      await this.cacheService.invalidateGame(mediaId);
    }

    return { success: true };
  }

  async updateRating(userId: number, mediaId: number, mediaType: 'anime' | 'manga' | 'game', rating: number) {
    // Validate rating (allow 0.5 increments)
    if (rating < 0 || rating > 5) {
      throw new BadRequestException('Rating must be between 0 and 5');
    }

    // Validate that rating is in 0.5 increments
    if (rating % 0.5 !== 0) {
      throw new BadRequestException('Rating must be in 0.5 increments (e.g., 3.5, 4.0, 4.5)');
    }

    if (mediaType === 'anime') {
      const updated = await this.prisma.collectionAnime.updateMany({
        where: {
          idMembre: userId,
          idAnime: mediaId,
        },
        data: {
          evaluation: rating,
        },
      });

      if (updated.count === 0) {
        throw new NotFoundException('Anime not found in any collection');
      }
    } else if (mediaType === 'manga') {
      const updated = await this.prisma.collectionManga.updateMany({
        where: {
          idMembre: userId,
          idManga: mediaId,
        },
        data: {
          evaluation: rating,
        },
      });

      if (updated.count === 0) {
        throw new NotFoundException('Manga not found in any collection');
      }
    } else if (mediaType === 'game') {
      const updated = await this.prisma.collectionJeuxVideo.updateMany({
        where: {
          idMembre: userId,
          idJeu: mediaId,
        },
        data: {
          evaluation: rating,
        },
      });

      if (updated.count === 0) {
        throw new NotFoundException('Game not found in any collection');
      }
    }

    // Invalidate user's collection cache after update
    await this.invalidateUserCollectionCache(userId);

    // OPTIMIZATION: Invalidate collection check cache
    const cacheKey = `user_collection_check:${userId}:${mediaType}:${mediaId}`;
    await this.cacheService.del(cacheKey);

    // OPTIMIZATION: Invalidate media collections users cache
    // OPTIMIZED: Delete known keys instead of SCAN
      await Promise.all([
        this.cacheService.del(`media_collections_users:${mediaType}:${mediaId}:1:20`),
        this.cacheService.del(`media_collections_users:${mediaType}:${mediaId}:1:50`),
      ]);

    // Invalidate anime/manga/game cache as ratings may have changed
    if (mediaType === 'anime') {
      await this.cacheService.invalidateAnime(mediaId);
    } else if (mediaType === 'manga') {
      await this.cacheService.invalidateManga(mediaId);
    } else if (mediaType === 'game') {
      await this.cacheService.invalidateGame(mediaId);
    }

    return { success: true, rating };
  }

  async isInCollection(userId: number, mediaId: number, mediaType: 'anime' | 'manga' | 'jeu-video') {
    // OPTIMIZATION: Cache collection check to avoid DB query on every page load
    const cacheKey = `user_collection_check:${userId}:${mediaType}:${mediaId}`;

    this.logger.debug(`🔍 [isInCollection] Starting check for ${cacheKey}`);

    try {
      // Add timeout to cache get to prevent hanging
      const cached = await Promise.race([
        this.cacheService.get(cacheKey),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Cache get timeout')), 5000))
      ]);

      // Check for both null and undefined - cache.get() returns undefined when key doesn't exist
      if (cached !== null && cached !== undefined) {
        this.logger.debug(`🔍 [isInCollection] Cache HIT for ${cacheKey}`, cached);
        return cached;
      }
    } catch (error) {
      this.logger.error(`⚠️ [isInCollection] Cache get failed or timed out for ${cacheKey}:`, error.message);
      // Continue to database query
    }

    this.logger.debug(`🔍 [isInCollection] Cache MISS, querying database for ${cacheKey}`);

    // Fallback to database query
    return await this.prisma.executeWithRetry(async () => {
      this.logger.debug(`🔍 [isInCollection] Cache MISS - Using RAW SQL - userId: ${userId}, mediaId: ${mediaId}, mediaType: ${mediaType}`);
      let collections: any[] = [];

      if (mediaType === 'anime') {
        collections = await this.prisma.$queryRaw<any[]>`
          SELECT type, evaluation, notes, NULL as id_collection
          FROM collection_animes
          WHERE id_membre = ${userId} AND id_anime = ${mediaId}
        `;
        this.logger.debug(`🔍 [isInCollection] Anime RAW SQL - Found ${collections.length} rows: ${JSON.stringify(collections)}`);
      } else if (mediaType === 'manga') {
        collections = await this.prisma.$queryRaw<any[]>`
          SELECT type, evaluation, notes, chapters_read, NULL as id_collection
          FROM collection_mangas
          WHERE id_membre = ${userId} AND id_manga = ${mediaId}
        `;
        this.logger.debug(`🔍 [isInCollection] Manga RAW SQL - Found ${collections.length} rows: ${JSON.stringify(collections)}`);
      } else if (mediaType === 'jeu-video') {
        collections = await this.prisma.$queryRaw<any[]>`
          SELECT id_collection, type, evaluation, notes, platform_played, started_date, finished_date
          FROM collection_jeuxvideo
          WHERE id_membre = ${userId} AND id_jeu = ${mediaId}
        `;
        this.logger.debug(`🔍 [isInCollection] Game RAW SQL - Found ${collections.length} rows:`, JSON.stringify(collections));
      }

      const inCollection = collections.length > 0;
      this.logger.debug(`🔍 [isInCollection] Final result - inCollection: ${inCollection}, count: ${collections.length}`);

      const result = {
        inCollection,
        collections: collections.map(c => {
          // Convert rating: database stores Decimal(3,1), may contain 0-10 scale ratings
          // Convert to 0-5 scale if rating > 5
          let rating = c.evaluation ? Number(c.evaluation) : 0;
          if (rating > 5) {
            rating = rating / 2; // Convert from 0-10 to 0-5 scale
          }

          return {
            type: c.type,
            name: this.getCollectionNameByTypeId(c.type),
            rating,
            notes: c.notes,
            chaptersRead: c.chapters_read || undefined,
            collectionId: c.id_collection || undefined,
            platformPlayed: c.platform_played || undefined,
            startedDate: c.started_date || undefined,
            finishedDate: c.finished_date || undefined,
          };
        }),
      };

      // Cache for 5 minutes (balance between freshness and performance)
      await this.cacheService.set(cacheKey, result, 300);
      this.logger.debug(`🔍 [isInCollection] Cached result for ${cacheKey}`);

      return result;
    });
  }

  async checkBulkInCollection(userId: number, mediaType: 'anime' | 'manga', mediaIds: number[]) {
    if (!mediaIds.length) {
      return { foundIds: [] };
    }

    this.logger.debug(`🔍 [checkBulkInCollection] userId: ${userId}, mediaType: ${mediaType}, ids: ${mediaIds.length}`);

    // Direct DB query for efficiency
    let foundIds: number[] = [];

    await this.prisma.executeWithRetry(async () => {
      if (mediaType === 'anime') {
        const results = await this.prisma.collectionAnime.findMany({
          where: {
            idMembre: userId,
            idAnime: { in: mediaIds }
          },
          select: { idAnime: true }
        });
        foundIds = results.map(r => r.idAnime);
      } else if (mediaType === 'manga') {
        const results = await this.prisma.collectionManga.findMany({
          where: {
            idMembre: userId,
            idManga: { in: mediaIds }
          },
          select: { idManga: true }
        });
        foundIds = results.map(r => r.idManga);
      }
    });

    return {
      userId,
      mediaType,
      foundIds
    };
  }

  // Get user info with collection summary (optimized for single user)
  // getUserInfo moved to CollectionStatisticsService

  // Get collection summary (counts per type) for a user
  // getCollectionSummary moved to CollectionStatisticsService

  // Get all collections for a user (virtual collections based on type)
  // findUserCollections, findUserCollectionsFromDB, browseUserCollections moved to CollectionBrowseService

  // Get collection details by type
  // findCollectionByType moved to CollectionBrowseService

  // Optimized anime collections fetch with efficient queries
  async getCollectionAnimes(
    userId: number,
    type: number,
    page: number = 1,
    limit: number = 20,
    currentUserId?: number,
    year?: number,
    sortBy?: string,
    sortOrder: 'asc' | 'desc' = 'desc'
  ) {
    const isOwnCollection = currentUserId === userId;

    // Create cache key for this specific request
    const cacheKey = `collection_animes:${userId}:${type}:${page}:${limit}:${isOwnCollection ? 'own' : 'public'}:${year || 'all'}:${sortBy || 'def'}:${sortOrder}`;

    // Try to get from cache first
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Build where clause with year filter
    const whereClause: any = {
      idMembre: userId,
      ...(type !== undefined && type !== null && type !== 0 ? { type: type } : {}),
      ...(isOwnCollection ? {} : { isPublic: true })
    };

    // Add year filter on the anime relation
    if (year) {
      whereClause.anime = {
        annee: year
      };
    }

    // Determine orderBy based on sortBy parameter
    const order: 'asc' | 'desc' = sortOrder || 'desc';
    let orderBy: any = { createdAt: order };

    if (sortBy === 'rating') {
      orderBy = { evaluation: order };
    } else if (sortBy === 'title') {
      orderBy = { anime: { titre: order } };
    } else if (sortBy === 'updatedAt') {
      orderBy = { updatedAt: order };
    } else if (sortBy === 'notes') {
      orderBy = { notes: order };
    } else if (sortBy === 'createdAt') {
      orderBy = { createdAt: order };
    }

    const [total, animeItems, statusCounts] = await Promise.all([
      this.prisma.collectionAnime.count({ where: whereClause }),
      this.prisma.collectionAnime.findMany({
        where: whereClause,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        include: {
          anime: {
            select: {
              idAnime: true,
              titre: true,
              titreOrig: true,
              annee: true,
              nbEp: true,
              image: true,
              synopsis: true,
              moyenneNotes: true,
              niceUrl: true
            }
          }
        }
      }),
      // Get all status counts
      this.collectionStatisticsService.getStatusCounts(userId, 'anime', type)
    ]);

    // Note: Previous code grouped by type to get counts, but getStatusCounts does that too.
    // However, the original code returned a grouped result directly.
    // Let's adapt to what getStatusCounts returns OR just use the service.
    // Original code:
    // this.prisma.collectionAnime.groupBy({ by: ['type'], ... })
    // getStatusCounts returns { completed: number, watching: number ... }
    // But we need the raw counts or the mapped object?
    // Down below (line 1616) it maps the raw 'statusCounts' (which was an array of groupBys).
    // Now 'statusCounts' is the object { completed: X, watching: Y ... } from the service.
    // So we don't need to loop and switch anymore!
    // We can just use it directly.
    // BUT wait, Promise.all returns an array.
    // Let's fix the variable assignment.
    // The original code returned [total, animeItems, statusCounts (groupBy result)].

    // Let's refactor this part to be cleaner.
    // Use the result from Promise.all directly
    const statusCountsMap = statusCounts;
    statusCountsMap['all'] = Object.values(statusCountsMap).reduce((a: any, b: any) => a + Number(b), 0);

    const transformedItems = await this.enrichAnimesWithSeasons(animeItems.map(item => ({
      id: item.idCollection,
      animeId: item.idAnime,
      addedAt: item.createdAt?.toISOString() || new Date().toISOString(),
      type: item.type,
      notes: item.notes,
      rating: Number(item.evaluation) > 0 ? Number(item.evaluation) : null,
      anime: item.anime
    })));

    const result = {
      success: true,
      data: transformedItems,
      meta: {
        total,
        totalCount: total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page < Math.ceil(total / limit),
        statusCounts: statusCountsMap
      }
    };

    // Cache for 40 minutes
    await this.cacheService.set(cacheKey, result, 2400);

    return result;
  }

  // Add anime to collection
  async addAnimeToCollection(userId: number, type: number, addAnimeDto: AddAnimeToCollectionDto, currentUserId: number) {
    if (userId !== currentUserId) {
      throw new ForbiddenException('You can only add items to your own collections');
    }

    // Check if anime exists
    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: addAnimeDto.animeId }
    });

    if (!anime) {
      throw new NotFoundException('Anime not found');
    }

    // Check if already in collection
    const existing = await this.prisma.collectionAnime.findFirst({
      where: {
        idMembre: userId,
        idAnime: addAnimeDto.animeId,
        type: type
      }
    });

    if (existing) {
      throw new ConflictException('Anime already in this collection type');
    }

    const collectionItem = await this.prisma.collectionAnime.create({
      data: {
        type: type,
        idMembre: userId,
        idAnime: addAnimeDto.animeId,
        evaluation: addAnimeDto.rating || 0,
        notes: addAnimeDto.notes || null,
        isPublic: true
      },
      include: {
        anime: true
      }
    });

    const result = {
      id: collectionItem.idCollection,
      animeId: collectionItem.idAnime,
      addedAt: collectionItem.createdAt?.toISOString() || new Date().toISOString(),
      notes: collectionItem.notes,
      rating: Number(collectionItem.evaluation) > 0 ? Number(collectionItem.evaluation) : null,
      anime: {
        id: collectionItem.anime.idAnime,
        titre: collectionItem.anime.titre,
        titreOrig: collectionItem.anime.titreOrig,
        annee: collectionItem.anime.annee,
        nbEp: collectionItem.anime.nbEp,
        image: collectionItem.anime.image,
        synopsis: collectionItem.anime.synopsis,
        moyenneNotes: collectionItem.anime.moyenneNotes,
        niceUrl: collectionItem.anime.niceUrl
      }
    };

    // Invalidate user's collection cache after adding
    await this.invalidateUserCollectionCache(userId);

    // Invalidate anime cache as ratings may have changed
    await this.cacheService.invalidateAnime(addAnimeDto.animeId);

    return result;
  }

  // Remove anime from collection
  async removeAnimeFromCollection(userId: number, type: number, animeId: number, currentUserId: number) {
    if (userId !== currentUserId) {
      throw new ForbiddenException('You can only remove items from your own collections');
    }

    const collectionItem = await this.prisma.collectionAnime.findFirst({
      where: {
        idMembre: userId,
        idAnime: animeId,
        type: type
      }
    });

    if (!collectionItem) {
      throw new NotFoundException('Anime not found in this collection');
    }

    await this.prisma.collectionAnime.delete({
      where: {
        idCollection: collectionItem.idCollection
      }
    });

    // Invalidate user's collection cache after removal
    await this.invalidateUserCollectionCache(userId);

    // Invalidate anime cache as ratings may have changed
    await this.cacheService.invalidateAnime(animeId);

    return { message: 'Anime removed from collection successfully' };
  }

  // Optimized manga collections fetch with efficient queries
  async getCollectionMangas(
    userId: number,
    type: number,
    page: number = 1,
    limit: number = 20,
    currentUserId?: number,
    year?: number,
    sortBy?: string,
    sortOrder: 'asc' | 'desc' = 'desc'
  ) {
    const isOwnCollection = currentUserId === userId;

    // Create cache key for this specific request
    const cacheKey = `collection_mangas:${userId}:${type}:${page}:${limit}:${isOwnCollection ? 'own' : 'public'}:${year || 'all'}:${sortBy || 'def'}:${sortOrder}`;

    // Try to get from cache first
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Build where clause with year filter
    const whereClause: any = {
      idMembre: userId,
      ...(type !== undefined && type !== null && type !== 0 ? { type: type } : {}),
      ...(isOwnCollection ? {} : { isPublic: true })
    };

    // Add year filter on the manga relation (manga.annee is varchar)
    if (year) {
      whereClause.manga = {
        annee: String(year)
      };
    }

    // Determine orderBy based on sortBy parameter
    const order: 'asc' | 'desc' = sortOrder || 'desc';
    let orderBy: any = { createdAt: order };

    if (sortBy === 'rating') {
      orderBy = { evaluation: order };
    } else if (sortBy === 'title') {
      orderBy = { manga: { titre: order } };
    } else if (sortBy === 'updatedAt') {
      orderBy = { updatedAt: order };
    } else if (sortBy === 'notes') {
      orderBy = { notes: order };
    } else if (sortBy === 'createdAt') {
      orderBy = { createdAt: order };
    }

    const [total, mangaItems, statusCounts] = await Promise.all([
      this.prisma.collectionManga.count({ where: whereClause }),
      this.prisma.collectionManga.findMany({
        where: whereClause,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        include: {
          manga: {
            select: {
              idManga: true,
              titre: true,
              auteur: true,
              annee: true,
              image: true,
              synopsis: true,
              moyenneNotes: true,
              niceUrl: true,
              origine: true,
              nbVol: true
            }
          }
        }
      }),
      this.collectionStatisticsService.getStatusCounts(userId, 'manga', type)
    ]);

    // Use the result from Promise.all
    const statusCountsMap = statusCounts;
    statusCountsMap['all'] = Object.values(statusCountsMap).reduce((a: any, b: any) => a + Number(b), 0);

    const transformedItems = mangaItems.map(item => ({
      id: item.idCollection,
      mangaId: item.idManga,
      addedAt: item.createdAt?.toISOString() || new Date().toISOString(),
      type: item.type,
      notes: item.notes,
      rating: Number(item.evaluation) > 0 ? Number(item.evaluation) : null,
      manga: {
        id: item.manga.idManga,
        titre: item.manga.titre,
        auteur: item.manga.auteur,
        annee: item.manga.annee,
        image: item.manga.image,
        synopsis: item.manga.synopsis,
        moyenneNotes: item.manga.moyenneNotes,
        niceUrl: item.manga.niceUrl,
        origine: item.manga.origine,
        nbVol: item.manga.nbVol
      }
    }));

    // Transform status counts for frontend
    // Status counts map is now obtained from service

    const result = {
      success: true,
      data: transformedItems,
      meta: {
        total,
        totalCount: total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page < Math.ceil(total / limit),
        statusCounts: statusCountsMap
      }
    };

    // Cache for 40 minutes
    await this.cacheService.set(cacheKey, result, 2400);

    return result;
  }

  // Add manga to collection
  async addMangaToCollection(userId: number, type: number, addMangaDto: AddMangaToCollectionDto, currentUserId: number) {
    if (userId !== currentUserId) {
      throw new ForbiddenException('You can only add items to your own collections');
    }

    // Check if manga exists
    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: addMangaDto.mangaId }
    });

    if (!manga) {
      throw new NotFoundException('Manga not found');
    }

    // Check if already in ANY collection type
    const existing = await this.prisma.collectionManga.findFirst({
      where: {
        idMembre: userId,
        idManga: addMangaDto.mangaId
      }
    });

    let collectionItem;
    if (existing) {
      // Update existing entry if changing collection type
      if (existing.type === type) {
        throw new ConflictException('Manga already in this collection type');
      }

      // Update the collection type
      collectionItem = await this.prisma.collectionManga.update({
        where: {
          idCollection: existing.idCollection
        },
        data: {
          type: type,
          evaluation: addMangaDto.rating !== undefined ? addMangaDto.rating : existing.evaluation,
          notes: addMangaDto.notes !== undefined ? addMangaDto.notes : existing.notes,
          updatedAt: new Date()
        },
        include: {
          manga: true
        }
      });
    } else {
      // Create new collection entry
      collectionItem = await this.prisma.collectionManga.create({
        data: {
          type: type,
          idMembre: userId,
          idManga: addMangaDto.mangaId,
          evaluation: addMangaDto.rating || 0,
          notes: addMangaDto.notes || null,
          isPublic: true
        },
        include: {
          manga: true
        }
      });
    }

    const result = {
      id: collectionItem.idCollection,
      mangaId: collectionItem.idManga,
      addedAt: collectionItem.createdAt?.toISOString() || new Date().toISOString(),
      notes: collectionItem.notes,
      rating: collectionItem.evaluation > 0 ? collectionItem.evaluation : null,
      manga: {
        id: collectionItem.manga.idManga,
        titre: collectionItem.manga.titre,
        auteur: collectionItem.manga.auteur,
        annee: collectionItem.manga.annee,
        image: collectionItem.manga.image,
        synopsis: collectionItem.manga.synopsis,
        moyenneNotes: collectionItem.manga.moyenneNotes,
        niceUrl: collectionItem.manga.niceUrl,
        origine: collectionItem.manga.origine,
        nbVol: collectionItem.manga.nbVol
      }
    };

    // Invalidate user's collection cache after adding
    await this.invalidateUserCollectionCache(userId);

    // Invalidate manga cache as ratings may have changed
    await this.cacheService.invalidateManga(addMangaDto.mangaId);

    return result;
  }

  // Remove manga from collection
  async removeMangaFromCollection(userId: number, type: number, mangaId: number, currentUserId: number) {
    if (userId !== currentUserId) {
      throw new ForbiddenException('You can only remove items from your own collections');
    }

    const collectionItem = await this.prisma.collectionManga.findFirst({
      where: {
        idMembre: userId,
        idManga: mangaId,
        type: type
      }
    });

    if (!collectionItem) {
      throw new NotFoundException('Manga not found in this collection');
    }

    await this.prisma.collectionManga.delete({
      where: {
        idCollection: collectionItem.idCollection
      }
    });

    // Invalidate user's collection cache after removal
    await this.invalidateUserCollectionCache(userId);

    // Invalidate manga cache as ratings may have changed
    await this.cacheService.invalidateManga(mangaId);

    return { message: 'Manga removed from collection successfully' };
  }

  // Get ratings distribution for a user's collection (anime or manga)
  // getRatingsDistribution moved to CollectionStatisticsService

  private getCollectionNameByType(type: string): string {
    const typeMap: Record<string, string> = {
      'completed': 'Terminé',
      'watching': 'En cours',
      'planned': 'Planifié',
      'dropped': 'Abandonné',
    };

    return typeMap[type] || 'Ma collection';
  }

  private getCollectionTypeFromName(type: string): number {
    const typeMap: Record<string, number> = {
      'completed': 1,
      'watching': 2,
      'plan-to-watch': 3,
      'dropped': 4,
      'on-hold': 5,
    };

    return typeMap[type] || 0;
  }

  private getCollectionNameByTypeId(typeId: number): string {
    const typeMap: Record<number, string> = {
      0: 'Ma collection',
      1: 'Terminé',
      2: 'En cours',
      3: 'Planifié',
      4: 'Abandonné',
      5: 'En pause',
    };

    return typeMap[typeId] || 'Ma collection';
  }

  private getCollectionTypeNames(): Record<number, string> {
    return {
      0: 'Ma collection',
      1: 'Terminé',
      2: 'En cours',
      3: 'Planifié',
      4: 'Abandonné',
      5: 'En pause',
    };
  }

  private getCollectionName(type: number): string {
    switch (type) {
      case 1: return 'Terminé';
      case 2: return 'En cours';
      case 3: return 'Planifié';
      case 4: return 'Abandonné';
      case 5: return 'En pause';
      default: return 'Unknown';
    }
  }

  // Import from MAL (client-parsed XML -> JSON items)




  /**
   * Enrich anime collection items with season information
   */


  /**
   * Enrich anime collection items with season information
   */
  private async enrichAnimesWithSeasons(animes: any[]) {
    if (!animes || animes.length === 0) {
      return animes;
    }

    // Extract anime IDs from the collection items
    const animeIds = animes
      .filter(a => a.anime?.idAnime)
      .map(a => a.anime.idAnime);

    if (animeIds.length === 0) {
      return animes;
    }

    // Fetch all seasons
    const seasons = await this.prisma.akAnimesSaisons.findMany({
      select: {
        idSaison: true,
        saison: true,
        annee: true,
        jsonData: true,
      },
    });

    // Build a map of animeId -> season info
    const animeSeasonMap = new Map<number, { season: number; year: number; id: number }>();

    for (const season of seasons) {
      try {
        const jsonData = typeof season.jsonData === 'string'
          ? JSON.parse(season.jsonData)
          : season.jsonData;

        let seasonAnimeIds: number[] = [];

        // Handle different possible JSON structures
        if (Array.isArray(jsonData)) {
          seasonAnimeIds = jsonData;
        } else if (jsonData.animes && Array.isArray(jsonData.animes)) {
          seasonAnimeIds = jsonData.animes;
        } else if (jsonData.anime_ids && Array.isArray(jsonData.anime_ids)) {
          seasonAnimeIds = jsonData.anime_ids;
        }

        // Map each anime ID in this season to the season info
        for (const animeId of seasonAnimeIds) {
          if (animeIds.includes(animeId)) {
            animeSeasonMap.set(animeId, {
              season: season.saison,
              year: season.annee,
              id: season.idSaison,
            });
          }
        }
      } catch (error) {
        // Skip seasons with invalid JSON
        continue;
      }
    }

    // Enrich the anime data with season information
    return animes.map(item => {
      if (item.anime?.idAnime) {
        const seasonInfo = animeSeasonMap.get(item.anime.idAnime);
        if (seasonInfo) {
          return {
            ...item,
            anime: {
              ...item.anime,
              season: seasonInfo,
            },
          };
        }
      }
      return item;
    });
  }

  // Helper method to invalidate all collection-related cache for a user
  // OPTIMIZED: Delete known keys instead of expensive SCAN operations
  private async invalidateUserCollectionCache(userId: number): Promise<void> {
    try {
      // Delete known common cache keys - others will expire via TTL (5 min)
      const types = ['anime', 'manga', 'jeu-video'];
      const statuses = ['all', 'watching', 'completed', 'plantowatch', 'onhold', 'dropped'];

      const deletions: Promise<void>[] = [
        this.cacheService.del(`find_user_collections:${userId}:own`),
        this.cacheService.del(`find_user_collections:${userId}:public`),
      ];

      // Only delete most common collection cache keys
      for (const type of types) {
        for (const status of statuses) {
          deletions.push(this.cacheService.del(`user_collections:${userId}:${type}:${status}`));
        }
      }

      await Promise.all(deletions);
    } catch (error) {
      // Log error but don't throw to avoid breaking the main operation
      this.logger.error('Cache invalidation error for user', userId, error);
    }
  }




}
