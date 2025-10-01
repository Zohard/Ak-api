import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { AddAnimeToCollectionDto } from './dto/add-anime-to-collection.dto';
import { AddMangaToCollectionDto } from './dto/add-manga-to-collection.dto';
import { AddToCollectionDto } from './dto/add-to-collection.dto';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { CollectionQueryDto } from './dto/collection-query.dto';
import { ImportMalItemDto } from './dto/import-mal.dto';

@Injectable()
export class CollectionsService {
  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) {}

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
    const { mediaId, mediaType, type, rating, notes } = addToCollectionDto;
    const collectionType = this.getCollectionTypeFromName(type);

    // Normalize rating to 0-5 integer
    const normalizedRating = Math.max(0, Math.min(5, Math.round((rating ?? 0))));

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
          return await this.prisma.executeWithRetry(() =>
            this.prisma.collectionAnime.findFirst({
              where: { idMembre: userId, idAnime: mediaId },
              include: {
                anime: {
                  select: { idAnime: true, titre: true, image: true, annee: true, moyenneNotes: true },
                },
              },
            })
          );
        }

        return await this.prisma.executeWithRetry(() =>
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
              isPublic: true,
              updatedAt: new Date(),
            },
          })
        );
        return await this.prisma.executeWithRetry(() =>
          this.prisma.collectionManga.findFirst({
            where: { idMembre: userId, idManga: mediaId },
            include: {
              manga: {
                select: { idManga: true, titre: true, image: true, annee: true, moyenneNotes: true, nbVol: true },
              },
            },
          })
        );
      }

      return await this.prisma.executeWithRetry(() =>
        this.prisma.collectionManga.create({
          data: {
            idMembre: userId,
            idManga: mediaId,
            type: collectionType,
            evaluation: normalizedRating,
            notes: notes || null,
            isPublic: true,
          },
          include: {
            manga: {
              select: { idManga: true, titre: true, image: true, annee: true, moyenneNotes: true, nbVol: true },
            },
          },
        })
      );
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
          return await this.prisma.collectionAnime.findFirst({
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
              isPublic: true,
              updatedAt: new Date(),
            },
          });
          return await this.prisma.collectionManga.findFirst({
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
      // eslint-disable-next-line no-console
      console.error('addToCollection unexpected error', {
        userId,
        mediaId,
        mediaType,
        collectionType,
        err: { message: err?.message, code: err?.code },
      });
      throw new BadRequestException('Unable to add to collection');
    } finally {
      // Invalidate user's collection cache after any add operation
      await this.invalidateUserCollectionCache(userId);
    }
  }

  async getCollectionItems(userId: number, query: CollectionQueryDto) {
    const { page = 1, limit = 20, mediaType, type, search } = query;

    // Skip cache for search queries
    if (search) {
      return this.getCollectionItemsFromDB(userId, query);
    }

    // Create cache key including all relevant parameters
    const collectionType = type ? this.getCollectionTypeFromName(type) : 'all';
    const cacheKey = `collection_items:${userId}:${mediaType || 'all'}:${collectionType}:${page}:${limit}`;
    
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
    const { page = 1, limit = 20, mediaType, type, search } = query;
    const skip = (page - 1) * limit;
    
    const collectionType = type ? this.getCollectionTypeFromName(type) : undefined;

    if (!mediaType || mediaType === 'anime') {
      const animeWhere: any = {
        idMembre: userId,
      };

      if (collectionType !== undefined) {
        animeWhere.type = collectionType;
      }

      if (search) {
        animeWhere.anime = {
          titre: {
            contains: search,
            mode: 'insensitive',
          },
        };
      }

      const [animes, animeTotal] = await this.prisma.executeWithRetry(async () => {
        return Promise.all([
          this.prisma.collectionAnime.findMany({
            where: animeWhere,
            skip: mediaType === 'anime' ? skip : 0,
            take: mediaType === 'anime' ? limit : undefined,
            orderBy: { createdAt: 'desc' },
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
          return this.getStatusCounts(userId, 'anime', collectionType);
        });

        return {
          data: animes.map(a => ({
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

      if (search) {
        mangaWhere.manga = {
          titre: {
            contains: search,
            mode: 'insensitive',
          },
        };
      }

      const [mangas, mangaTotal] = await this.prisma.executeWithRetry(async () => {
        return Promise.all([
          this.prisma.collectionManga.findMany({
            where: mangaWhere,
            skip: mediaType === 'manga' ? skip : 0,
            take: mediaType === 'manga' ? limit : undefined,
            orderBy: { createdAt: 'desc' },
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
          return this.getStatusCounts(userId, 'manga', collectionType);
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

    const [animes, mangas] = await this.prisma.executeWithRetry(async () => {
      return Promise.all([
        this.prisma.collectionAnime.findMany({
          where: animeWhere,
          orderBy: { createdAt: 'desc' },
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
          orderBy: { createdAt: 'desc' },
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
    ].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    const paginatedData = combined.slice(skip, skip + limit);

    // Calculate status counts for combined data
    const statusCounts = await this.prisma.executeWithRetry(async () => {
      return this.getStatusCounts(userId, 'both', collectionType);
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

    return { success: true };
  }

  async isInCollection(userId: number, mediaId: number, mediaType: 'anime' | 'manga') {
    return await this.prisma.executeWithRetry(async () => {
      let inCollection = false;
      let collections: any[] = [];

      if (mediaType === 'anime') {
        collections = await this.prisma.collectionAnime.findMany({
          where: {
            idMembre: userId,
            idAnime: mediaId,
          },
          select: {
            type: true,
            evaluation: true,
            notes: true,
          },
        });
        inCollection = collections.length > 0;
      } else {
        collections = await this.prisma.collectionManga.findMany({
          where: {
            idMembre: userId,
            idManga: mediaId,
          },
          select: {
            type: true,
            evaluation: true,
            notes: true,
          },
        });
        inCollection = collections.length > 0;
      }

      return {
        inCollection,
        collections: collections.map(c => ({
          type: c.type,
          name: this.getCollectionNameByTypeId(c.type),
          rating: c.evaluation,
          notes: c.notes,
        })),
      };
    });
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

    const sampleImages = await Promise.all(
      typesWithItems.map(async (type) => {
        // Get anime sample image
        const animeItem = await this.prisma.collectionAnime.findFirst({
          where: {
            idMembre: userId,
            type,
            ...(isOwnCollection ? {} : { isPublic: true }),
            anime: {
              image: {
                not: null
              }
            }
          },
          include: { anime: { select: { image: true } } },
          orderBy: { idCollection: 'desc' }
        });

        // Get manga sample image
        const mangaItem = await this.prisma.collectionManga.findFirst({
          where: {
            idMembre: userId,
            type,
            ...(isOwnCollection ? {} : { isPublic: true }),
            manga: {
              image: {
                not: null
              }
            }
          },
          include: { manga: { select: { image: true } } },
          orderBy: { idCollection: 'desc' }
        });

        return {
          type,
          animeImage: animeItem?.anime?.image || null,
          mangaImage: mangaItem?.manga?.image || null
        };
      })
    );

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
    const statusCounts = await this.getStatusCounts(userId, 'both');
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
      }
    });

    // Transform data to include collection summaries
    const users = await Promise.all(
      usersWithPublicCollections.map(async (user: any) => {
        // Get collection type counts
        const animeCounts = await this.prisma.collectionAnime.groupBy({
          by: ['type'],
          where: {
            idMembre: user.id,
            isPublic: true
          },
          _count: {
            type: true
          }
        });

        const mangaCounts = await this.prisma.collectionManga.groupBy({
          by: ['type'],
          where: {
            idMembre: user.id,
            isPublic: true
          },
          _count: {
            type: true
          }
        });

        const collectionTypes = [
          { type: 1, name: 'Terminé' },
          { type: 2, name: 'En cours' },
          { type: 3, name: 'Planifié' },
          { type: 4, name: 'Abandonné' }
        ];

        const collections = collectionTypes.map(collectionType => {
          const animeCount = animeCounts.find(ac => ac.type === collectionType.type)?._count?.type || 0;
          const mangaCount = mangaCounts.find(mc => mc.type === collectionType.type)?._count?.type || 0;
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
          id: user.id,
          username: user.pseudo,
          avatarUrl: user.avatarUrl,
          joinedAt: user.createdAt,
          collections,
          totalPublicAnimes: user._count.animeCollections,
          totalPublicMangas: user._count.mangaCollections,
          totalPublicItems: user._count.animeCollections + user._count.mangaCollections
        };
      })
    );

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

  // Optimized anime collections fetch with efficient queries
  async getCollectionAnimes(userId: number, type: number, page: number = 1, limit: number = 20, currentUserId?: number) {
    const isOwnCollection = currentUserId === userId;
    
    // Create cache key for this specific request
    const cacheKey = `collection_animes:${userId}:${type}:${page}:${limit}:${isOwnCollection ? 'own' : 'public'}`;
    
    // Try to get from cache first
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Use Promise.all for parallel queries
    const whereClause = {
      idMembre: userId,
      type: type,
      ...(isOwnCollection ? {} : { isPublic: true })
    };

    const [total, animeItems, statusCounts] = await Promise.all([
      this.prisma.collectionAnime.count({ where: whereClause }),
      this.prisma.collectionAnime.findMany({
        where: whereClause,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
      // Get all status counts in a single efficient query
      this.prisma.collectionAnime.groupBy({
        by: ['type'],
        where: { idMembre: userId, ...(isOwnCollection ? {} : { isPublic: true }) },
        _count: { type: true }
      })
    ]);

    const transformedItems = animeItems.map(item => ({
      id: item.idCollection,
      animeId: item.idAnime,
      addedAt: item.createdAt?.toISOString() || new Date().toISOString(),
      notes: item.notes,
      rating: item.evaluation > 0 ? item.evaluation : null,
      anime: {
        id: item.anime.idAnime,
        titre: item.anime.titre,
        titreOrig: item.anime.titreOrig,
        annee: item.anime.annee,
        nbEp: item.anime.nbEp,
        image: item.anime.image,
        synopsis: item.anime.synopsis,
        moyenneNotes: item.anime.moyenneNotes,
        niceUrl: item.anime.niceUrl
      }
    }));

    // Transform status counts for frontend
    const statusCountsMap = {
      watching: 0,
      completed: 0,
      'plan-to-watch': 0,
      dropped: 0,
      'on-hold': 0
    };

    statusCounts.forEach(count => {
      switch (count.type) {
        case 1: statusCountsMap.completed = count._count.type; break;
        case 2: statusCountsMap.watching = count._count.type; break;
        case 3: statusCountsMap['plan-to-watch'] = count._count.type; break;
        case 4: statusCountsMap.dropped = count._count.type; break;
        case 5: statusCountsMap['on-hold'] = count._count.type; break;
      }
    });

    const result = {
      success: true,
      data: transformedItems,
      meta: {
        total,
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
      rating: collectionItem.evaluation > 0 ? collectionItem.evaluation : null,
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

    return { message: 'Anime removed from collection successfully' };
  }

  // Optimized manga collections fetch with efficient queries
  async getCollectionMangas(userId: number, type: number, page: number = 1, limit: number = 20, currentUserId?: number) {
    const isOwnCollection = currentUserId === userId;
    
    // Create cache key for this specific request
    const cacheKey = `collection_mangas:${userId}:${type}:${page}:${limit}:${isOwnCollection ? 'own' : 'public'}`;
    
    // Try to get from cache first
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Use Promise.all for parallel queries
    const whereClause = {
      idMembre: userId,
      type: type,
      ...(isOwnCollection ? {} : { isPublic: true })
    };

    const [total, mangaItems, statusCounts] = await Promise.all([
      this.prisma.collectionManga.count({ where: whereClause }),
      this.prisma.collectionManga.findMany({
        where: whereClause,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
      // Get all status counts in a single efficient query
      this.prisma.collectionManga.groupBy({
        by: ['type'],
        where: { idMembre: userId, ...(isOwnCollection ? {} : { isPublic: true }) },
        _count: { type: true }
      })
    ]);

    const transformedItems = mangaItems.map(item => ({
      id: item.idCollection,
      mangaId: item.idManga,
      addedAt: item.createdAt?.toISOString() || new Date().toISOString(),
      notes: item.notes,
      rating: item.evaluation > 0 ? item.evaluation : null,
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
    const statusCountsMap = {
      watching: 0,
      completed: 0,
      'plan-to-watch': 0,
      dropped: 0,
      'on-hold': 0
    };

    statusCounts.forEach(count => {
      switch (count.type) {
        case 1: statusCountsMap.completed = count._count.type; break;
        case 2: statusCountsMap.watching = count._count.type; break;
        case 3: statusCountsMap['plan-to-watch'] = count._count.type; break;
        case 4: statusCountsMap.dropped = count._count.type; break;
        case 5: statusCountsMap['on-hold'] = count._count.type; break;
      }
    });

    const result = {
      success: true,
      data: transformedItems,
      meta: {
        total,
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

    // Check if already in collection
    const existing = await this.prisma.collectionManga.findFirst({
      where: {
        idMembre: userId,
        idManga: addMangaDto.mangaId,
        type: type
      }
    });

    if (existing) {
      throw new ConflictException('Manga already in this collection type');
    }

    const collectionItem = await this.prisma.collectionManga.create({
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

    return { message: 'Manga removed from collection successfully' };
  }

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
        const val = r.evaluation ?? 0;
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
        const val = r.evaluation ?? 0;
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
  async importFromMAL(userId: number, items: ImportMalItemDto[]) {
    if (!items?.length) {
      return { success: false, imported: 0, failed: 0, details: [], message: 'No items to import' };
    }

    const results: Array<{ title: string; type: string; status: string; matchedId?: number; outcome: 'imported'|'updated'|'skipped'|'not_found'; reason?: string }>= [];

    // Process sequentially to avoid hammering DB; could be optimized with limited concurrency
    for (const raw of items) {
      const type = (raw.type === 'manga' ? 'manga' : 'anime') as 'anime' | 'manga';
      const normalized = this.normalizeMalStatus(raw.status, type);
      const statusName = normalized; // maps to our string names used by addToCollection
      const rating = this.normalizeMalScore(raw.score);

      try {
        const matchId = await (type === 'anime'
          ? this.findAnimeIdByTitle(raw.title)
          : this.findMangaIdByTitle(raw.title)
        );

        if (!matchId) {
          results.push({ title: raw.title, type, status: statusName, outcome: 'not_found', reason: 'No matching title' });
          continue;
        }

        // Use existing addToCollection method for upsert-like behavior
        await this.addToCollection(userId, {
          mediaId: matchId,
          mediaType: type,
          type: statusName as any,
          rating: rating ?? 0,
        } as any);

        results.push({ title: raw.title, type, status: statusName, matchedId: matchId, outcome: 'imported' });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('MAL import item failed', { title: raw.title, type, err: { message: err?.message, code: err?.code } });
        results.push({ title: raw.title, type, status: statusName, outcome: 'skipped', reason: 'Unexpected error' });
      }
    }

    const imported = results.filter(r => r.outcome === 'imported' || r.outcome === 'updated').length;
    const failed = results.filter(r => r.outcome === 'not_found' || r.outcome === 'skipped').length;

    // Invalidate cache once after batch
    await this.invalidateUserCollectionCache(userId);

    return {
      success: true,
      imported,
      failed,
      total: items.length,
      details: results,
    };
  }

  private normalizeMalStatus(status: string, type: 'anime'|'manga'): 'completed'|'watching'|'on-hold'|'dropped'|'plan-to-watch' {
    const s = (status || '').toLowerCase().replace(/\s+/g, '');
    if (s === 'completed') return 'completed';
    if (s === 'watching' || (type === 'manga' && s === 'reading')) return 'watching';
    if (s === 'onhold' || s === 'on-hold') return 'on-hold';
    if (s === 'dropped') return 'dropped';
    if (s === 'plantowatch' || s === 'plantoread' || s === 'plan-to-watch' || s === 'plan-to-read') return 'plan-to-watch';
    // default to plan-to-watch
    return 'plan-to-watch';
  }

  private normalizeMalScore(score?: number | null): number | undefined {
    if (score == null) return undefined;
    const s = Math.max(0, Math.min(10, Math.round(Number(score))));
    // Convert to our 0-5 integer scale
    return Math.round(s / 2);
  }

  private async findAnimeIdByTitle(title: string): Promise<number | null> {
    if (!title) return null;
    const t = title.trim();
    // Try exact matches first, then fallback to contains
    const exact = await this.prisma.executeWithRetry(() =>
      this.prisma.akAnime.findFirst({
        where: {
          OR: [
            { titre: { equals: t, mode: 'insensitive' } as any },
            { titreFr: { equals: t, mode: 'insensitive' } as any },
            { titreOrig: { equals: t, mode: 'insensitive' } as any },
          ],
        },
        select: { idAnime: true },
      })
    );
    if (exact?.idAnime) return exact.idAnime;

    const contains = await this.prisma.executeWithRetry(() =>
      this.prisma.akAnime.findFirst({
        where: {
          OR: [
            { titre: { contains: t, mode: 'insensitive' } as any },
            { titreFr: { contains: t, mode: 'insensitive' } as any },
            { titreOrig: { contains: t, mode: 'insensitive' } as any },
            { titresAlternatifs: { contains: t, mode: 'insensitive' } as any },
          ],
        },
        select: { idAnime: true },
      })
    );
    return contains?.idAnime || null;
  }

  private async findMangaIdByTitle(title: string): Promise<number | null> {
    if (!title) return null;
    const t = title.trim();
    const exact = await this.prisma.executeWithRetry(() =>
      this.prisma.akManga.findFirst({
        where: {
          OR: [
            { titre: { equals: t, mode: 'insensitive' } as any },
            { titreFr: { equals: t, mode: 'insensitive' } as any },
            { titreOrig: { equals: t, mode: 'insensitive' } as any },
          ],
        },
        select: { idManga: true },
      })
    );
    if (exact?.idManga) return exact.idManga;

    const contains = await this.prisma.executeWithRetry(() =>
      this.prisma.akManga.findFirst({
        where: {
          OR: [
            { titre: { contains: t, mode: 'insensitive' } as any },
            { titreFr: { contains: t, mode: 'insensitive' } as any },
            { titreOrig: { contains: t, mode: 'insensitive' } as any },
            { titresAlternatifs: { contains: t, mode: 'insensitive' } as any },
          ],
        },
        select: { idManga: true },
      })
    );
    return contains?.idManga || null;
  }

  // Export to MAL XML
  async exportToMAL(userId: number, mediaType: 'anime' | 'manga' = 'anime'): Promise<string> {
    const nowTs = Math.floor(Date.now() / 1000);

    if (mediaType === 'anime') {
      const entries = await this.prisma.collectionAnime.findMany({
        where: { idMembre: userId },
        orderBy: { createdAt: 'desc' },
        include: {
          anime: {
            select: { idAnime: true, titre: true, nbEp: true, format: true },
          },
        },
      });

      const itemsXml = entries.map((e) => {
        const status = this.toMalStatus(e.type, 'anime');
        const score10 = (e.evaluation ?? 0) * 2; // 0-5 -> 0-10
        const epCount = e.anime?.nbEp ?? 0;
        const seriesType = this.mapFormatToMalType(e.anime?.format);
        return [
          '  <anime>',
          `    <series_animedb_id>${e.anime?.idAnime ?? 0}</series_animedb_id>`,
          `    <series_title>${this.xmlEscape(e.anime?.titre || '')}</series_title>`,
          `    <series_type>${seriesType}</series_type>`,
          `    <series_episodes>${epCount}</series_episodes>`,
          '    <my_id>0</my_id>',
          '    <my_watched_episodes>0</my_watched_episodes>',
          '    <my_start_date>0000-00-00</my_start_date>',
          '    <my_finish_date>0000-00-00</my_finish_date>',
          `    <my_score>${score10}</my_score>`,
          `    <my_status>${status}</my_status>`,
          '    <my_rewatching>0</my_rewatching>',
          '    <my_rewatching_ep>0</my_rewatching_ep>',
          '    <my_times_watched>0</my_times_watched>',
          '    <my_time_watched>0</my_time_watched>',
          `    <my_last_updated>${nowTs}</my_last_updated>`,
          '    <my_tags></my_tags>',
          '  </anime>',
        ].join('\n');
      }).join('\n');

      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<myanimelist>',
        '  <myinfo>',
        `    <user_id>${userId}</user_id>`,
        '    <user_name>Anime-Kun</user_name>',
        `    <user_export_type>1</user_export_type>`,
        `    <user_total_anime>${entries.length}</user_total_anime>`,
        `    <user_total_watching>0</user_total_watching>`,
        `    <user_total_completed>0</user_total_completed>`,
        `    <user_total_onhold>0</user_total_onhold>`,
        `    <user_total_dropped>0</user_total_dropped>`,
        `    <user_total_plantowatch>0</user_total_plantowatch>`,
        '  </myinfo>',
        itemsXml,
        '</myanimelist>',
      ].join('\n');
      return xml;
    }

    // manga export
    const entries = await this.prisma.collectionManga.findMany({
      where: { idMembre: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        manga: { select: { idManga: true, titre: true, nbVol: true } },
      },
    });

    const itemsXml = entries.map((e) => {
      const status = this.toMalStatus(e.type, 'manga');
      const score10 = (e.evaluation ?? 0) * 2; // 0-5 -> 0-10
      const volCount = e.manga?.nbVol ?? 0;
      return [
        '  <manga>',
        `    <manga_mangadb_id>${e.manga?.idManga ?? 0}</manga_mangadb_id>`,
        `    <manga_title>${this.xmlEscape(e.manga?.titre || '')}</manga_title>`,
        `    <manga_chapters>0</manga_chapters>`,
        `    <manga_volumes>${volCount}</manga_volumes>`,
        '    <my_id>0</my_id>',
        '    <my_read_chapters>0</my_read_chapters>',
        '    <my_read_volumes>0</my_read_volumes>',
        '    <my_start_date>0000-00-00</my_start_date>',
        '    <my_finish_date>0000-00-00</my_finish_date>',
        `    <my_score>${score10}</my_score>`,
        `    <my_status>${status}</my_status>`,
        '    <my_rereadingg>0</my_rereadingg>',
        '    <my_rereading_chap>0</my_rereading_chap>',
        `    <my_last_updated>${nowTs}</my_last_updated>`,
        '    <my_tags></my_tags>',
        '  </manga>',
      ].join('\n');
    }).join('\n');

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<myanimelist>',
      '  <myinfo>',
      `    <user_id>${userId}</user_id>`,
      '    <user_name>Anime-Kun</user_name>',
      `    <user_export_type>2</user_export_type>`,
      `    <user_total_manga>${entries.length}</user_total_manga>`,
      '  </myinfo>',
      itemsXml,
      '</myanimelist>',
    ].join('\n');
    return xml;
  }

  private toMalStatus(typeId: number, media: 'anime' | 'manga'): string {
    switch (typeId) {
      case 1: return 'Completed';
      case 2: return media === 'manga' ? 'Reading' : 'Watching';
      case 3: return media === 'manga' ? 'Plan to Read' : 'Plan to Watch';
      case 4: return 'Dropped';
      case 5: return 'On-Hold';
      default: return media === 'manga' ? 'Plan to Read' : 'Plan to Watch';
    }
  }

  private mapFormatToMalType(format?: string | null): number {
    // MAL types: 1 TV, 2 OVA, 3 Movie, 4 Special, 5 ONA, 6 Music
    const f = (format || '').toLowerCase();
    if (f.includes('tv')) return 1;
    if (f.includes('ova')) return 2;
    if (f.includes('movie') || f.includes('film')) return 3;
    if (f.includes('special')) return 4;
    if (f.includes('ona')) return 5;
    if (f.includes('music')) return 6;
    return 1;
  }

  private xmlEscape(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private async getStatusCounts(
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

  // Helper method to invalidate all collection-related cache for a user
  private async invalidateUserCollectionCache(userId: number): Promise<void> {
    try {
      // Invalidate various cache patterns for the user
      await Promise.all([
        // User collection lists cache
        this.cacheService.delByPattern(`user_collections:${userId}:*`),
        // Collection items cache
        this.cacheService.delByPattern(`collection_items:${userId}:*`),
        // Ratings distribution cache
        this.cacheService.delByPattern(`collection_ratings:*:${userId}:*`),
        // Find user collections cache (both own and public views)
        this.cacheService.del(`find_user_collections:${userId}:own`),
        this.cacheService.del(`find_user_collections:${userId}:public`),
      ]);
    } catch (error) {
      // Log error but don't throw to avoid breaking the main operation
      console.error('Cache invalidation error for user', userId, error);
    }
  }
}
