import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { AddAnimeToCollectionDto } from './dto/add-anime-to-collection.dto';
import { AddMangaToCollectionDto } from './dto/add-manga-to-collection.dto';
import { AddToCollectionDto } from './dto/add-to-collection.dto';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { CollectionQueryDto } from './dto/collection-query.dto';

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

    // Create cache key
    const cacheKey = `user_collections:${userId}:${page}:${limit}`;
    
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

    // Get distinct collection types from both tables
    const [animeCollections, mangaCollections] = await Promise.all([
      this.prisma.collectionAnime.findMany({
        where: { idMembre: userId },
        select: { type: true },
        distinct: ['type'],
      }),
      this.prisma.collectionManga.findMany({
        where: { idMembre: userId },
        select: { type: true },
        distinct: ['type'],
      }),
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
      createdAt: Date;
      updatedAt: Date;
    }> = [];
    const typeNames = this.getCollectionTypeNames();
    
    // Create collection objects based on types found
    const allTypes = new Set([
      ...animeCollections.map(c => c.type),
      ...mangaCollections.map(c => c.type)
    ]);

    // Get status counts for meta
    const statusCounts = {
      completed: 0,
      watching: 0,
      planned: 0,
      dropped: 0,
    };

    let totalCount = 0;

    for (const type of allTypes) {
      const animeCount = await this.prisma.collectionAnime.count({
        where: { idMembre: userId, type }
      });
      const mangaCount = await this.prisma.collectionManga.count({
        where: { idMembre: userId, type }
      });
      const typeTotal = animeCount + mangaCount;
      totalCount += typeTotal;

      // Map type to status name for counts
      switch (type) {
        case 1:
          statusCounts.watching = typeTotal;
          break;
        case 2:
          statusCounts.completed = typeTotal;
          break;
        case 3:
          statusCounts.planned = typeTotal;
          break;
        case 4:
          statusCounts.dropped = typeTotal;
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
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const total = collections.length;
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
        total,
        totalPages: Math.ceil(total / limit),
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
        const anime = await this.prisma.akAnime.findUnique({ where: { idAnime: mediaId } });
        if (!anime) {
          throw new NotFoundException('Anime not found');
        }

        // Check if already in collection for this user+media (any type)
        const existingAny = await this.prisma.collectionAnime.findFirst({
          where: { idMembre: userId, idAnime: mediaId },
        });
        if (existingAny) {
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
        }

        return await this.prisma.collectionAnime.create({
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
              select: { idAnime: true, titre: true, image: true, annee: true, moyenneNotes: true },
            },
          },
        });
      }

      // mediaType === 'manga'
      const manga = await this.prisma.akManga.findUnique({ where: { idManga: mediaId } });
      if (!manga) {
        throw new NotFoundException('Manga not found');
      }

      const existingAny = await this.prisma.collectionManga.findFirst({
        where: { idMembre: userId, idManga: mediaId },
      });
      if (existingAny) {
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
              select: { idManga: true, titre: true, image: true, annee: true, moyenneNotes: true },
            },
          },
        });
      }

      return await this.prisma.collectionManga.create({
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
            select: { idManga: true, titre: true, image: true, annee: true, moyenneNotes: true },
          },
        },
      });
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
                select: { idManga: true, titre: true, image: true, annee: true, moyenneNotes: true },
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
    
    // Create cache key - different keys for own vs public view
    const cacheKey = `find_user_collections:${userId}:${isOwnCollection ? 'own' : 'public'}`;
    
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
        totalCount: animeCount + mangaCount
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
    let orderBy: any = { pseudo: 'asc' };
    if (sortBy) {
      switch (sortBy) {
        case 'username':
          orderBy = { pseudo: 'asc' };
          break;
        case '-username':
          orderBy = { pseudo: 'desc' };
          break;
        case 'totalItems':
          orderBy = { id: 'desc' }; // We'll sort by total items in memory
          break;
        case '-totalItems':
          orderBy = { id: 'asc' }; // We'll sort by total items in memory
          break;
        default:
          orderBy = { pseudo: 'asc' };
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
              origine: true
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
        origine: item.manga.origine
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
        origine: collectionItem.manga.origine
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
      'planned': 3,
      'dropped': 4,
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
    };
  }

  private getCollectionName(type: number): string {
    switch (type) {
      case 1: return 'Terminé';
      case 2: return 'En cours';
      case 3: return 'Planifié';
      case 4: return 'Abandonné';
      default: return 'Unknown';
    }
  }

  private async getStatusCounts(
    userId: number,
    mediaType: 'anime' | 'manga' | 'both',
    collectionType?: number,
  ) {
    const statusCounts = {
      completed: 0,
      watching: 0,
      planned: 0,
      dropped: 0,
    };

    // Use single optimized queries with groupBy to reduce connection usage
    const queries = [];

    if (mediaType === 'anime' || mediaType === 'both') {
      const animeWhere: any = { idMembre: userId };
      if (collectionType !== undefined) {
        animeWhere.type = collectionType;
      }

      queries.push(
        this.prisma.collectionAnime.groupBy({
          by: ['type'],
          where: animeWhere,
          _count: { type: true }
        })
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
        this.prisma.collectionManga.groupBy({
          by: ['type'],
          where: mangaWhere,
          _count: { type: true }
        })
      );
    } else {
      queries.push(Promise.resolve([]));
    }

    const [animeCounts, mangaCounts] = await Promise.all(queries);

    // Process anime counts
    animeCounts.forEach((count: any) => {
      switch (count.type) {
        case 1: statusCounts.watching += count._count.type; break;
        case 2: statusCounts.completed += count._count.type; break;
        case 3: statusCounts.planned += count._count.type; break;
        case 4: statusCounts.dropped += count._count.type; break;
      }
    });

    // Process manga counts
    mangaCounts.forEach((count: any) => {
      switch (count.type) {
        case 1: statusCounts.watching += count._count.type; break;
        case 2: statusCounts.completed += count._count.type; break;
        case 3: statusCounts.planned += count._count.type; break;
        case 4: statusCounts.dropped += count._count.type; break;
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