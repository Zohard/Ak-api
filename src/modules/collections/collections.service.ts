import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { AddAnimeToCollectionDto } from './dto/add-anime-to-collection.dto';
import { AddMangaToCollectionDto } from './dto/add-manga-to-collection.dto';

@Injectable()
export class CollectionsService {
  constructor(private prisma: PrismaService) {}

  // Get all collections for a user (virtual collections based on type)
  async findUserCollections(userId: number, currentUserId?: number) {
    // Only show collections if it's the current user or collections are public
    const isOwnCollection = currentUserId === userId;
    
    const collectionTypes = [
      { type: 1, name: 'Completed', description: 'Completed items' },
      { type: 2, name: 'Plan to Watch', description: 'Items planned to be watched/read' },
      { type: 3, name: 'Watching', description: 'Currently watching/reading items' },
      { type: 4, name: 'Dropped', description: 'Dropped items' }
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

    return {
      data: collections,
      meta: {
        total: collections.length,
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
          { type: 1, name: 'Completed' },
          { type: 2, name: 'Plan to Watch' },
          { type: 3, name: 'Watching' },
          { type: 4, name: 'Dropped' }
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
      1: { name: 'Completed', description: 'Completed items' },
      2: { name: 'Plan to Watch', description: 'Items planned to be watched/read' },
      3: { name: 'Watching', description: 'Currently watching/reading items' },
      4: { name: 'Dropped', description: 'Dropped items' }
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

  // Get animes from a user's collection by type
  async getCollectionAnimes(userId: number, type: number, page: number = 1, limit: number = 20, currentUserId?: number) {
    const isOwnCollection = currentUserId === userId;
    
    const total = await this.prisma.collectionAnime.count({
      where: {
        idMembre: userId,
        type: type,
        ...(isOwnCollection ? {} : { isPublic: true })
      }
    });

    const animeItems = await this.prisma.collectionAnime.findMany({
      where: {
        idMembre: userId,
        type: type,
        ...(isOwnCollection ? {} : { isPublic: true })
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        anime: true
      }
    });

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

    return {
      success: true,
      data: transformedItems,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page < Math.ceil(total / limit)
      }
    };
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
        collectionName: this.getCollectionName(type),
        isPublic: true
      },
      include: {
        anime: true
      }
    });

    return {
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

    return { message: 'Anime removed from collection successfully' };
  }

  // Get mangas from a user's collection by type
  async getCollectionMangas(userId: number, type: number, page: number = 1, limit: number = 20, currentUserId?: number) {
    const isOwnCollection = currentUserId === userId;
    
    const total = await this.prisma.collectionManga.count({
      where: {
        idMembre: userId,
        type: type,
        ...(isOwnCollection ? {} : { isPublic: true })
      }
    });

    const mangaItems = await this.prisma.collectionManga.findMany({
      where: {
        idMembre: userId,
        type: type,
        ...(isOwnCollection ? {} : { isPublic: true })
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        manga: true
      }
    });

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

    return {
      success: true,
      data: transformedItems,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page < Math.ceil(total / limit)
      }
    };
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
        collectionName: this.getCollectionName(type),
        isPublic: true
      },
      include: {
        manga: true
      }
    });

    return {
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

    return { message: 'Manga removed from collection successfully' };
  }

  private getCollectionName(type: number): string {
    switch (type) {
      case 1: return 'Plan to Watch';
      case 2: return 'Watching';
      case 3: return 'Completed';
      case 4: return 'Dropped';
      default: return 'Unknown';
    }
  }
}