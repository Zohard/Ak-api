import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { BaseContentService } from '../../shared/services/base-content.service';
import { CreateMangaDto } from './dto/create-manga.dto';
import { UpdateMangaDto } from './dto/update-manga.dto';
import { MangaQueryDto } from './dto/manga-query.dto';
import { RelatedContentItem, RelationsResponse } from '../shared/types/relations.types';
import { ImageKitService } from '../media/imagekit.service';
import { AniListService, AniListManga } from '../anilist/anilist.service';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import { hasAdminAccess } from '../../shared/constants/rbac.constants';

@Injectable()
export class MangasService extends BaseContentService<
  any,
  CreateMangaDto,
  UpdateMangaDto,
  MangaQueryDto
> {
  constructor(
    prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly imageKitService: ImageKitService,
    private readonly aniListService: AniListService,
  ) {
    super(prisma);
  }

  protected get model() {
    return this.prisma.akManga;
  }

  protected get idField() {
    return 'idManga';
  }

  protected get tableName() {
    return 'ak_mangas';
  }

  protected getAutocompleteSelectFields() {
    return {
      idManga: true,
      titre: true,
      annee: true,
      auteur: true,
      image: true,
    };
  }

  protected formatAutocompleteItem(manga: any) {
    return {
      id_manga: manga.idManga,
      titre: manga.titre,
      annee: manga.annee,
      auteur: manga.auteur,
      image: manga.image,
    };
  }

  protected formatItem(manga: any) {
    return this.formatManga(manga);
  }

  async create(createMangaDto: CreateMangaDto, userId: number) {
    // Merge with AniList if anilistId provided
    let data: any = { ...createMangaDto };
    if ((createMangaDto as any).anilistId) {
      try {
        const anilistId = Number((createMangaDto as any).anilistId);
        const anilistManga = await this.aniListService.getMangaById(anilistId);
        if (anilistManga) {
          const anilistData = this.aniListService.mapToCreateMangaDto(anilistManga);
          data = {
            ...anilistData,
            ...data,
            commentaire: JSON.stringify({
              ...(anilistData.commentaire ? JSON.parse(anilistData.commentaire) : {}),
              anilistId,
              originalData: anilistManga,
            }),
          };
        }
      } catch (error: any) {
        console.warn(`Failed to fetch AniList manga for ID ${(createMangaDto as any).anilistId}:`, error.message);
      }
    }

    delete (data as any).anilistId;

    const manga = await this.prisma.akManga.create({
      data: {
        ...data,
        dateAjout: new Date(),
        statut: data.statut ?? 0,
      } as any,
      include: {
        reviews: {
          take: 3,
          orderBy: { dateCritique: 'desc' },
          include: {
            membre: {
              select: {
                idMember: true,
                memberName: true,
              },
            },
          },
        },
      },
    });

    return this.formatManga(manga);
  }

  async findAll(query: MangaQueryDto) {
    const {
      page = 1,
      limit = 20,
      search,
      auteur,
      annee,
      statut,
      genre,
      sortBy = 'dateAjout',
      sortOrder = 'desc',
      includeReviews = false,
      ficheComplete,
    } = query;

    // Create cache key from query parameters
    const cacheKey = this.createCacheKey(query);
    
    // Try to get from cache first
    const cached = await this.cacheService.getMangaList(cacheKey);
    if (cached) {
      return cached;
    }

    const skip = ((page || 1) - 1) * (limit || 20);

    const where: any = {};

    if (search) {
      where.OR = [
        { titre: { contains: search, mode: 'insensitive' } },
        { synopsis: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (auteur) {
      where.businessRelations = {
        some: {
          type: 'Auteur',
          business: {
            denomination: { contains: auteur, mode: 'insensitive' },
          },
        },
      };
    }

    if (annee) {
      where.annee = annee;
    }

    if (statut !== undefined) {
      where.statut = statut;
    }

    if (ficheComplete !== undefined) {
      where.ficheComplete = ficheComplete;
    }

    // Handle genre filtering via tags (supports multiple genres, AND logic)
    if (genre && genre.length > 0) {
      // URL decode all genre parameters
      const decodedGenres = genre.map(g => decodeURIComponent(g.replace(/\+/g, ' ')));

      let mangaIdsWithGenres: any[] = [];

      if (decodedGenres.length > 0) {
        const genresLower = decodedGenres.map(g => g.toLowerCase());
        mangaIdsWithGenres = await this.prisma.$queryRaw<Array<{ manga_id: number }>>`
          SELECT tf.id_fiche AS manga_id
          FROM ak_tags t
          INNER JOIN ak_tag2fiche tf ON t.id_tag = tf.id_tag
          WHERE LOWER(t.tag_name) IN (${Prisma.join(genresLower)})
            AND tf.type = 'manga'
          GROUP BY tf.id_fiche
          HAVING COUNT(DISTINCT LOWER(t.tag_name)) = ${genresLower.length}
        `;
      }

      const mangaIds = (mangaIdsWithGenres as any[]).map(row => row.manga_id).filter((id: number) => id !== undefined);

      if (mangaIds.length > 0) {
        where.idManga = { in: mangaIds };
      } else {
        where.idManga = { in: [] };
      }
    }

    const orderBy = { [sortBy || 'dateAjout']: sortOrder || 'desc' };

    const include: any = {};
    if (includeReviews) {
      include.reviews = {
        where: { statut: 0 }, // Only include published/visible reviews
        take: 5,
        orderBy: { dateCritique: 'desc' },
        include: {
          membre: {
            select: {
              idMember: true,
              memberName: true,
            },
          },
        },
      };
    }

    const [mangas, total] = await Promise.all([
      this.prisma.akManga.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include,
      }),
      this.prisma.akManga.count({ where }),
    ]);

    // Get manga IDs to fetch publishers from ak_business_to_mangas
    const mangaIds = mangas.map((manga) => manga.idManga);

    // Fetch publisher relationships (type = 'Editeur') for all mangas at once
    const publisherRelations = await this.prisma.akBusinessToManga.findMany({
      where: {
        idManga: { in: mangaIds },
        type: 'Editeur',
      },
      include: {
        business: {
          select: { idBusiness: true, denomination: true },
        },
      },
      orderBy: { idRelation: 'asc' }, // Get the first one if multiple exist
    });

    // Create a map of manga ID to publisher name (only the first publisher)
    const publisherMap: Map<number, string | null> = new Map();
    publisherRelations.forEach((relation) => {
      if (relation.idManga && !publisherMap.has(relation.idManga)) {
        publisherMap.set(relation.idManga, relation.business?.denomination || null);
      }
    });

    // Map publisher names back to manga items
    const enrichedMangas = mangas.map((manga) => {
      const publisherName = publisherMap.get(manga.idManga);
      return {
        ...manga,
        editeur: publisherName || manga.editeur, // Use publisher name from relations or fallback to original
      };
    });

    const result = {
      mangas: enrichedMangas.map(this.formatManga),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / (limit || 20)),
      },
    };

    // Cache the result (TTL based on query complexity)
    const ttl = search || genre ? 180 : 300; // 3 mins for search, 5 mins for general lists
    await this.cacheService.setMangaList(cacheKey, result, ttl);

    return result;
  }

  async findOne(id: number, includeReviews = false, user?: any) {
    // Try to get from cache first
    const cacheKey = `${id}_${includeReviews}`;
    const cached = await this.cacheService.getManga(parseInt(cacheKey.replace(/[^0-9]/g, '')));
    if (cached && cached.includeReviews === includeReviews) {
      return cached.data;
    }

    const include: any = {
      // Always include business relations to get editeurs and other business info
      businessRelations: {
        select: {
          idBusiness: true,
          type: true,
          precisions: true,
          business: {
            select: {
              denomination: true,
            },
          },
        },
      },
    };

    if (includeReviews) {
      include.reviews = {
        where: { statut: 0 }, // Only include published/visible reviews
        include: {
          membre: {
            select: {
              idMember: true,
              memberName: true,
              avatar: true,
            },
          },
        },
        orderBy: { dateCritique: 'desc' },
      };
    }

    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: id },
      include,
    });

    if (!manga) {
      throw new NotFoundException('Manga introuvable');
    }

    // Only allow access to published manga (statut=1) for public endpoints
    // Allow admins to view unpublished content
    const isAdmin = user && (hasAdminAccess(user.groupId) || user.isAdmin);
    if (manga.statut !== 1 && !isAdmin) {
      throw new NotFoundException('Manga introuvable');
    }

    // Get the first publisher name for backward compatibility with editeur field
    const publisherRelation: any = manga.businessRelations?.find((rel: any) => rel.type === 'editeur');

    // Enrich manga with publisher name (for backward compatibility)
    const enrichedManga = {
      ...manga,
      editeur: publisherRelation?.business?.denomination || manga.editeur,
    };

    // Get articles count
    const articlesCount = await this.prisma.akWebzineToFiches.count({
      where: {
        idFiche: id,
        type: 'manga',
        wpPost: {
          postStatus: 'publish',
        },
      },
    });

    const formattedManga = {
      ...this.formatManga(enrichedManga),
      articlesCount,
    };

    // Cache the result
    const cacheData = {
      data: formattedManga,
      includeReviews,
    };
    await this.cacheService.setManga(id, cacheData, 600); // 10 minutes

    return formattedManga;
  }

  async findByIds(ids: number[]) {
    if (!ids || ids.length === 0) {
      return [];
    }

    // Fetch all mangas in a single query
    const mangas = await this.prisma.akManga.findMany({
      where: {
        idManga: { in: ids },
        statut: 1, // Only return published mangas
      },
    });

    // Fetch publisher relationships (type = 'Editeur') for all mangas at once
    const publisherRelations = await this.prisma.akBusinessToManga.findMany({
      where: {
        idManga: { in: ids },
        type: 'Editeur',
      },
      include: {
        business: {
          select: { idBusiness: true, denomination: true },
        },
      },
      orderBy: { idRelation: 'asc' }, // Get the first one if multiple exist
    });

    // Create a map of manga ID to publisher name (only the first publisher)
    const publisherMap: Map<number, string | null> = new Map();
    publisherRelations.forEach((relation) => {
      if (relation.idManga && !publisherMap.has(relation.idManga)) {
        publisherMap.set(relation.idManga, relation.business?.denomination || null);
      }
    });

    // Enrich mangas with publisher names
    const enrichedMangas = mangas.map((manga) => {
      const publisherName = publisherMap.get(manga.idManga);
      return {
        ...manga,
        editeur: publisherName || manga.editeur, // Use publisher name from relations or fallback to original
      };
    });

    // Create a map for quick lookup
    const mangaMap = new Map(enrichedMangas.map(manga => [manga.idManga, manga]));

    // Return mangas in the same order as the input IDs
    return ids
      .map(id => mangaMap.get(id))
      .filter(Boolean)
      .map(manga => this.formatManga(manga));
  }

  async update(
    id: number,
    updateMangaDto: UpdateMangaDto,
    userId: number,
    isAdmin = false,
  ) {
    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: id },
    });

    if (!manga) {
      throw new NotFoundException('Manga introuvable');
    }

    if (manga.statut === 1 && !isAdmin) {
      throw new ForbiddenException(
        'Seul un administrateur peut modifier un manga validé',
      );
    }

    // If replacing image and previous image is an ImageKit URL, attempt deletion in IK
    try {
      if (
        typeof updateMangaDto.image === 'string' &&
        updateMangaDto.image &&
        updateMangaDto.image !== manga.image &&
        typeof manga.image === 'string' &&
        manga.image &&
        /imagekit\.io/.test(manga.image)
      ) {
        await this.imageKitService.deleteImageByUrl(manga.image);
      }
    } catch (e) {
      console.warn('Failed to delete previous ImageKit image (manga):', (e as Error).message);
    }

    // Merge with AniList if anilistId provided in update
    let updateData: any = { ...updateMangaDto };
    if ((updateMangaDto as any).anilistId) {
      try {
        const anilistId = Number((updateMangaDto as any).anilistId);
        const anilistManga = await this.aniListService.getMangaById(anilistId);
        if (anilistManga) {
          const anilistData = this.aniListService.mapToCreateMangaDto(anilistManga);
          updateData = {
            ...anilistData,
            ...updateData,
            commentaire: JSON.stringify({
              ...(anilistData.commentaire ? JSON.parse(anilistData.commentaire) : {}),
              anilistId,
              originalData: anilistManga,
            }),
          };
        }
      } catch (error: any) {
        console.warn(`Failed to fetch AniList manga for ID ${(updateMangaDto as any).anilistId}:`, error.message);
      }
    }

    delete (updateData as any).anilistId;

    const updatedManga = await this.prisma.akManga.update({
      where: { idManga: id },
      data: updateData,
      include: {
        reviews: {
          include: {
            membre: {
              select: {
                idMember: true,
                memberName: true,
              },
            },
          },
          take: 3,
          orderBy: { dateCritique: 'desc' },
        },
      },
    });

    // Invalidate caches after update
    await this.invalidateMangaCache(id);

    return this.formatManga(updatedManga);
  }

  async remove(id: number, userId: number, isAdmin = false) {
    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: id },
    });

    if (!manga) {
      throw new NotFoundException('Manga introuvable');
    }

    if (!isAdmin) {
      throw new ForbiddenException(
        'Seul un administrateur peut supprimer un manga',
      );
    }

    await this.prisma.akManga.delete({
      where: { idManga: id },
    });

    // Invalidate caches after removal
    await this.invalidateMangaCache(id);

    return { message: 'Manga supprimé avec succès' };
  }

  async getTopMangas(limit = 10, type = 'reviews-bayes') {
    // Try to get from cache first (1 hour TTL)
    const cached = await this.cacheService.getRankings('manga', 'top', type, limit);
    if (cached) {
      return cached;
    }

    // Handle collection-based rankings
    if (type === 'collection-bayes' || type === 'collection-avg') {
      const minRatings = type === 'collection-bayes' ? 10 : 3;

      // Query collection_mangas for user ratings
      // Collection ratings are /5, multiply by 2 to convert to /10
      const results = await this.prisma.$queryRaw<Array<{
        id_manga: number;
        avg_rating: number;
        num_ratings: number;
      }>>`
        SELECT
          a.id_manga,
          (AVG(c.evaluation) * 2)::float as avg_rating,
          COUNT(c.evaluation)::int as num_ratings
        FROM ak_mangas a
        INNER JOIN collection_mangas c ON a.id_manga = c.id_manga
        WHERE a.statut = 1 AND c.evaluation > 0
        GROUP BY a.id_manga
        HAVING COUNT(c.evaluation) >= ${minRatings}
        ORDER BY AVG(c.evaluation) DESC, COUNT(c.evaluation) DESC
        LIMIT ${limit}
      `;

      // Fetch full manga details
      const mangaIds = results.map(r => r.id_manga);
      const mangas = await this.prisma.akManga.findMany({
        where: { idManga: { in: mangaIds }, statut: 1 },
        include: {
          reviews: {
            take: 2,
            orderBy: { dateCritique: 'desc' },
            include: {
              membre: {
                select: {
                  idMember: true,
                  memberName: true,
                },
              },
            },
          },
        },
      });

      // Fetch publisher relationships (type = 'Editeur') for all mangas at once
      const publisherRelations = await this.prisma.akBusinessToManga.findMany({
        where: {
          idManga: { in: mangaIds },
          type: 'Editeur',
        },
        include: {
          business: {
            select: { idBusiness: true, denomination: true },
          },
        },
        orderBy: { idRelation: 'asc' },
      });

      // Create a map of manga ID to publisher name
      const publisherMap: Map<number, string | null> = new Map();
      publisherRelations.forEach((relation) => {
        if (relation.idManga && !publisherMap.has(relation.idManga)) {
          publisherMap.set(relation.idManga, relation.business?.denomination || null);
        }
      });

      // Enrich mangas with publisher names
      const enrichedMangas = mangas.map((manga) => {
        const publisherName = publisherMap.get(manga.idManga);
        return {
          ...manga,
          editeur: publisherName || manga.editeur,
        };
      });

      // Sort to maintain the order from the query
      const sortedMangas = mangaIds.map(id =>
        enrichedMangas.find(a => a.idManga === id)
      ).filter(Boolean);

      // Add collection stats to formatted output
      const mangasWithStats = sortedMangas.map(manga => {
        const stats = results.find(r => r.id_manga === manga!.idManga);
        return {
          ...this.formatManga(manga),
          collectionRating: stats?.avg_rating || 0,
          collectionCount: stats?.num_ratings || 0,
        };
      });

      const result = {
        topMangas: mangasWithStats,
        rankingType: type,
        generatedAt: new Date().toISOString(),
      };

      // Cache for 1 hour (3600 seconds)
      await this.cacheService.setRankings('manga', 'top', type, limit, result);
      return result;
    }

    // Determine minimum review count based on ranking type
    // Bayesian: requires more reviews to reduce impact of outliers
    // Average: allows fewer reviews for a wider range
    const minReviews = type === 'reviews-bayes' ? 10 : 3;

    const mangas = await this.prisma.executeWithRetry(() =>
      this.prisma.akManga.findMany({
        where: {
          statut: 1,
          nbReviews: { gte: minReviews },
        },
        orderBy: [{ moyenneNotes: 'desc' }, { nbReviews: 'desc' }],
        take: limit,
        include: {
          reviews: {
            take: 2,
            orderBy: { dateCritique: 'desc' },
            include: {
              membre: {
                select: {
                  idMember: true,
                  memberName: true,
                },
              },
            },
          },
        },
      })
    );

    // Fetch publisher relationships (type = 'Editeur') for all mangas at once
    const mangaIds = mangas.map((manga) => manga.idManga);
    const publisherRelations = await this.prisma.akBusinessToManga.findMany({
      where: {
        idManga: { in: mangaIds },
        type: 'Editeur',
      },
      include: {
        business: {
          select: { idBusiness: true, denomination: true },
        },
      },
      orderBy: { idRelation: 'asc' },
    });

    // Create a map of manga ID to publisher name
    const publisherMap: Map<number, string | null> = new Map();
    publisherRelations.forEach((relation) => {
      if (relation.idManga && !publisherMap.has(relation.idManga)) {
        publisherMap.set(relation.idManga, relation.business?.denomination || null);
      }
    });

    // Enrich mangas with publisher names
    const enrichedMangas = mangas.map((manga) => {
      const publisherName = publisherMap.get(manga.idManga);
      return {
        ...manga,
        editeur: publisherName || manga.editeur,
      };
    });

    const result = {
      topMangas: enrichedMangas.map(this.formatManga.bind(this)),
      rankingType: type,
      generatedAt: new Date().toISOString(),
    };

    // Cache for 1 hour (3600 seconds)
    await this.cacheService.setRankings('manga', 'top', type, limit, result);

    return result;
  }

  async getFlopMangas(limit = 20, type = 'reviews-bayes') {
    // Try to get from cache first (1 hour TTL)
    const cached = await this.cacheService.getRankings('manga', 'flop', type, limit);
    if (cached) {
      return cached;
    }

    // Handle collection-based rankings
    if (type === 'collection-bayes' || type === 'collection-avg') {
      const minRatings = type === 'collection-bayes' ? 10 : 3;

      // Query collection_mangas for user ratings
      // Collection ratings are /5, multiply by 2 to convert to /10
      // Use ASC order to get lowest rated mangas
      const results = await this.prisma.$queryRaw<Array<{
        id_manga: number;
        avg_rating: number;
        num_ratings: number;
      }>>`
        SELECT
          a.id_manga,
          (AVG(c.evaluation) * 2)::float as avg_rating,
          COUNT(c.evaluation)::int as num_ratings
        FROM ak_mangas a
        INNER JOIN collection_mangas c ON a.id_manga = c.id_manga
        WHERE a.statut = 1 AND c.evaluation > 0
        GROUP BY a.id_manga
        HAVING COUNT(c.evaluation) >= ${minRatings}
        ORDER BY AVG(c.evaluation) ASC, COUNT(c.evaluation) DESC
        LIMIT ${limit}
      `;

      // Fetch full manga details
      const mangaIds = results.map(r => r.id_manga);
      const mangas = await this.prisma.akManga.findMany({
        where: { idManga: { in: mangaIds }, statut: 1 },
        include: {
          reviews: {
            take: 2,
            orderBy: { dateCritique: 'desc' },
            include: {
              membre: {
                select: {
                  idMember: true,
                  memberName: true,
                },
              },
            },
          },
        },
      });

      // Fetch publisher relationships (type = 'Editeur') for all mangas at once
      const publisherRelations = await this.prisma.akBusinessToManga.findMany({
        where: {
          idManga: { in: mangaIds },
          type: 'Editeur',
        },
        include: {
          business: {
            select: { idBusiness: true, denomination: true },
          },
        },
        orderBy: { idRelation: 'asc' },
      });

      // Create a map of manga ID to publisher name
      const publisherMap: Map<number, string | null> = new Map();
      publisherRelations.forEach((relation) => {
        if (relation.idManga && !publisherMap.has(relation.idManga)) {
          publisherMap.set(relation.idManga, relation.business?.denomination || null);
        }
      });

      // Enrich mangas with publisher names
      const enrichedMangas = mangas.map((manga) => {
        const publisherName = publisherMap.get(manga.idManga);
        return {
          ...manga,
          editeur: publisherName || manga.editeur,
        };
      });

      // Sort to maintain the order from the query
      const sortedMangas = mangaIds.map(id =>
        enrichedMangas.find(a => a.idManga === id)
      ).filter(Boolean);

      // Add collection stats to formatted output
      const mangasWithStats = sortedMangas.map(manga => {
        const stats = results.find(r => r.id_manga === manga!.idManga);
        return {
          ...this.formatManga(manga),
          collectionRating: stats?.avg_rating || 0,
          collectionCount: stats?.num_ratings || 0,
        };
      });

      const result = {
        flopMangas: mangasWithStats,
        rankingType: type,
        generatedAt: new Date().toISOString(),
      };

      // Cache for 1 hour (3600 seconds)
      await this.cacheService.setRankings('manga', 'flop', type, limit, result);
      return result;
    }

    // Determine minimum review count based on ranking type
    // Bayesian: requires more reviews to reduce impact of outliers
    // Average: allows fewer reviews for a wider range
    const minReviews = type === 'reviews-bayes' ? 10 : 3;

    const mangas = await this.prisma.executeWithRetry(() =>
      this.prisma.akManga.findMany({
        where: {
          statut: 1,
          nbReviews: { gte: minReviews },
        },
        orderBy: [{ moyenneNotes: 'asc' }, { nbReviews: 'desc' }],
        take: limit,
        include: {
          reviews: {
            take: 2,
            orderBy: { dateCritique: 'desc' },
            include: {
              membre: {
                select: {
                  idMember: true,
                  memberName: true,
                },
              },
            },
          },
        },
      })
    );

    // Fetch publisher relationships (type = 'Editeur') for all mangas at once
    const mangaIds = mangas.map((manga) => manga.idManga);
    const publisherRelations = await this.prisma.akBusinessToManga.findMany({
      where: {
        idManga: { in: mangaIds },
        type: 'Editeur',
      },
      include: {
        business: {
          select: { idBusiness: true, denomination: true },
        },
      },
      orderBy: { idRelation: 'asc' },
    });

    // Create a map of manga ID to publisher name
    const publisherMap: Map<number, string | null> = new Map();
    publisherRelations.forEach((relation) => {
      if (relation.idManga && !publisherMap.has(relation.idManga)) {
        publisherMap.set(relation.idManga, relation.business?.denomination || null);
      }
    });

    // Enrich mangas with publisher names
    const enrichedMangas = mangas.map((manga) => {
      const publisherName = publisherMap.get(manga.idManga);
      return {
        ...manga,
        editeur: publisherName || manga.editeur,
      };
    });

    const result = {
      flopMangas: enrichedMangas.map(this.formatManga.bind(this)),
      rankingType: type,
      generatedAt: new Date().toISOString(),
    };

    // Cache for 1 hour (3600 seconds)
    await this.cacheService.setRankings('manga', 'flop', type, limit, result);

    return result;
  }

  async searchAniList(query: string, limit = 10) {
    try {
      const cacheKey = `anilist_manga_search:${this.hashQuery(query)}:${limit}`;
      const cached = await this.cacheService.get(cacheKey);
      if (cached) return cached;

      const results = await this.aniListService.searchManga(query, limit);
      const result = {
        mangas: results,
        total: results.length,
        query,
        source: 'AniList',
      };

      await this.cacheService.set(cacheKey, result, 7200);
      return result;
    } catch (error: any) {
      console.error('Error searching AniList (manga):', error.message);
      throw new Error('Failed to search AniList for manga');
    }
  }

  async lookupByIsbn(isbn: string) {
    try {
      // Validate ISBN format (ISBN-10 or ISBN-13)
      const cleanIsbn = isbn.replace(/[-\s]/g, '');
      if (!/^\d{10}(\d{3})?$/.test(cleanIsbn)) {
        throw new BadRequestException('Invalid ISBN format. Must be ISBN-10 or ISBN-13');
      }

      // Try Google Books API first
      const googleBooksUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`;
      const googleResponse = await axios.get(googleBooksUrl, { timeout: 10000 });

      if (!googleResponse.data.items || googleResponse.data.items.length === 0) {
        throw new NotFoundException('No book found with this ISBN');
      }

      const bookInfo = googleResponse.data.items[0].volumeInfo;
      const rawTitle = bookInfo.title || '';
      const authors = bookInfo.authors ? bookInfo.authors.join(', ') : '';
      const description = bookInfo.description || '';
      const thumbnail = bookInfo.imageLinks?.thumbnail || bookInfo.imageLinks?.smallThumbnail || null;

      // Clean the title for better AniList matching
      // Remove volume/tome indicators and numbers
      let cleanedTitle = rawTitle
        // Remove common volume patterns (French)
        .replace(/[,\s]*tome\s+\d+/gi, '')
        .replace(/[,\s]*volume\s+\d+/gi, '')
        .replace(/[,\s]*vol\.?\s*\d+/gi, '')
        .replace(/[,\s]*t\.?\s*\d+/gi, '')
        // Remove common volume patterns (English)
        .replace(/[,\s]*vol(ume)?\.?\s*\d+/gi, '')
        // Remove edition info
        .replace(/[,\s]*\d+(st|nd|rd|th)\s+edition/gi, '')
        .replace(/[,\s]*édition\s+\d+/gi, '')
        // Remove trailing numbers and punctuation
        .replace(/[,\s]*\d+\s*$/, '')
        .replace(/[,\-:\s]+$/, '')
        .trim();

      console.log('ISBN lookup - Raw title:', rawTitle);
      console.log('ISBN lookup - Cleaned title:', cleanedTitle);

      // Try multiple search strategies
      let anilistResults: AniListManga[] = [];

      // Strategy 1: Search with cleaned title
      if (cleanedTitle) {
        anilistResults = await this.aniListService.searchManga(cleanedTitle, 5);
        console.log('ISBN lookup - Results from cleaned title:', anilistResults.length);
      }

      // Strategy 2: If no results, try with raw title
      if (anilistResults.length === 0 && rawTitle !== cleanedTitle) {
        anilistResults = await this.aniListService.searchManga(rawTitle, 5);
        console.log('ISBN lookup - Results from raw title:', anilistResults.length);
      }

      // Strategy 3: If still no results and we have an author, try searching by author
      if (anilistResults.length === 0 && authors) {
        const firstAuthor = authors.split(',')[0].trim();
        anilistResults = await this.aniListService.searchManga(firstAuthor, 5);
        console.log('ISBN lookup - Results from author search:', anilistResults.length);
      }

      return {
        isbn: cleanIsbn,
        bookInfo: {
          title: rawTitle,
          authors,
          description,
          thumbnail,
          publishedDate: bookInfo.publishedDate,
          pageCount: bookInfo.pageCount,
        },
        anilistResults: anilistResults.map(manga => ({
          id: manga.id,
          title: manga.title,
          coverImage: manga.coverImage,
          description: manga.description,
          chapters: manga.chapters,
          volumes: manga.volumes,
          startDate: manga.startDate,
          genres: manga.genres,
          staff: manga.staff,
        })),
        message: anilistResults.length > 0
          ? 'Book found. Please select the matching manga from AniList results.'
          : 'Book found but no matching manga on AniList. You may need to search manually.',
      };
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error in ISBN lookup:', error.message);
      throw new BadRequestException('Failed to lookup ISBN. Please try again.');
    }
  }

  // Use inherited autocomplete() method

  async getMangaTags(id: number) {
    return this.getTags(id, 'manga');
  }

  async getMangaRelations(id: number): Promise<RelationsResponse> {
    // First check if manga exists
    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: id, statut: 1 },
      select: { idManga: true },
    });

    if (!manga) {
      throw new NotFoundException('Manga introuvable');
    }

    // Get BIDIRECTIONAL relations: where manga is source OR target
    // This matches the old PHP logic: WHERE id_fiche_depart = 'manga{id}' OR id_manga = {id}
    const relations = await this.prisma.$queryRaw`
      SELECT id_relation, id_fiche_depart, id_anime, id_manga
      FROM ak_fiche_to_fiche
      WHERE id_fiche_depart = ${`manga${id}`} OR id_manga = ${id}
    ` as any[];

    const relatedContent: RelatedContentItem[] = [];

    // Process each relation to get the actual content
    for (const relation of relations) {
      // Case 1: This manga is the SOURCE (id_fiche_depart = 'manga{id}')
      if (relation.id_fiche_depart === `manga${id}`) {
        if (relation.id_anime && relation.id_anime > 0) {
          // Related anime
          const relatedAnime = await this.prisma.akAnime.findUnique({
            where: { idAnime: relation.id_anime, statut: 1 },
            select: {
              idAnime: true,
              titre: true,
              image: true,
              annee: true,
              moyenneNotes: true,
              niceUrl: true,
            },
          });

          if (relatedAnime) {
            relatedContent.push({
              id: relatedAnime.idAnime,
              type: 'anime',
              title: relatedAnime.titre,
              image: relatedAnime.image,
              year: relatedAnime.annee,
              rating: relatedAnime.moyenneNotes,
              niceUrl: relatedAnime.niceUrl,
              relationType: 'related',
            });
          }
        } else if (relation.id_manga && relation.id_manga > 0) {
          // Related manga
          const relatedManga = await this.prisma.akManga.findUnique({
            where: { idManga: relation.id_manga, statut: 1 },
            select: {
              idManga: true,
              titre: true,
              image: true,
              annee: true,
              moyenneNotes: true,
              niceUrl: true,
            },
          });

          if (relatedManga) {
            relatedContent.push({
              id: relatedManga.idManga,
              type: 'manga',
              title: relatedManga.titre,
              image: relatedManga.image,
              year: relatedManga.annee,
              rating: relatedManga.moyenneNotes,
              niceUrl: relatedManga.niceUrl,
              relationType: 'related',
            });
          }
        }
      }
      // Case 2: This manga is the TARGET (id_manga = {id}) - REVERSE relation
      // Need to fetch the SOURCE fiche from id_fiche_depart
      else if (relation.id_fiche_depart !== `manga${id}`) {
        const ficheMatch = relation.id_fiche_depart.match(/^(anime|manga)(\d+)$/);
        if (ficheMatch) {
          const [, type, ficheId] = ficheMatch;

          if (type === 'anime') {
            const relatedAnime = await this.prisma.akAnime.findUnique({
              where: { idAnime: parseInt(ficheId), statut: 1 },
              select: {
                idAnime: true,
                titre: true,
                image: true,
                annee: true,
                moyenneNotes: true,
                niceUrl: true,
              },
            });

            if (relatedAnime) {
              relatedContent.push({
                id: relatedAnime.idAnime,
                type: 'anime',
                title: relatedAnime.titre,
                image: relatedAnime.image,
                year: relatedAnime.annee,
                rating: relatedAnime.moyenneNotes,
                niceUrl: relatedAnime.niceUrl,
                relationType: 'related',
              });
            }
          } else if (type === 'manga') {
            const relatedManga = await this.prisma.akManga.findUnique({
              where: { idManga: parseInt(ficheId), statut: 1 },
              select: {
                idManga: true,
                titre: true,
                image: true,
                annee: true,
                moyenneNotes: true,
                niceUrl: true,
              },
            });

            if (relatedManga) {
              relatedContent.push({
                id: relatedManga.idManga,
                type: 'manga',
                title: relatedManga.titre,
                image: relatedManga.image,
                year: relatedManga.annee,
                rating: relatedManga.moyenneNotes,
                niceUrl: relatedManga.niceUrl,
                relationType: 'related',
              });
            }
          }
        }
      }
    }

    return {
      manga_id: id,
      relations: relatedContent,
      total: relatedContent.length,
    };
  }

  async getMangaArticles(id: number) {
    // First check if manga exists
    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: id, statut: 1 },
      select: { idManga: true },
    });

    if (!manga) {
      throw new NotFoundException('Manga introuvable');
    }

    // Get articles linked to this manga
    const articles = await this.prisma.akWebzineToFiches.findMany({
      where: {
        idFiche: id,
        type: 'manga',
      },
      include: {
        wpPost: {
          select: {
            ID: true,
            postTitle: true,
            postContent: true,
            postExcerpt: true,
            postDate: true,
            postName: true,
            postStatus: true,
            images: {
              select: {
                urlImg: true,
              },
              take: 1,
            },
          },
        },
      },
      orderBy: {
        idRelation: 'desc',
      },
    });

    // Format the response
    return articles
      .filter((article) => article.wpPost !== null && article.wpPost.postStatus === 'publish')
      .map((article) => {
        // TypeScript now knows wpPost is not null due to the filter above
        const post = article.wpPost!;
        return {
          id: post.ID,
          title: post.postTitle,
          excerpt: post.postExcerpt,
          content: post.postContent,
          date: post.postDate,
          slug: post.postName,
          coverImage: post.images?.[0]?.urlImg || null,
        };
      });
  }

  async getMangaStaff(id: number) {
    // First check if manga exists
    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: id, statut: 1 },
      select: { idManga: true },
    });

    if (!manga) {
      throw new NotFoundException('Manga introuvable');
    }

    // Get staff/business relations
    const staff = await this.prisma.$queryRaw`
      SELECT 
        bs.id_relation as idRelation,
        bs.id_manga as idManga,
        bs.id_business as idBusiness,
        bs.type,
        bs.precisions,
        b.denomination,
        b.autres_denominations as autresDenominations,
        b.type as businessType,
        b.image,
        b.notes,
        b.origine,
        b.site_officiel as siteOfficiel,
        b.date,
        b.statut
      FROM ak_business_to_mangas bs
      JOIN ak_business b ON bs.id_business = b.id_business
      WHERE bs.id_manga = ${id}
      ORDER BY bs.type, b.denomination
    ` as any[];

    return {
      manga_id: id,
      staff: staff.map((s: any) => ({
        ...s,
        business: {
          idBusiness: s.idBusiness,
          denomination: s.denomination,
          autresDenominations: s.autresDenominations,
          type: s.businessType,
          image: s.image,
          notes: s.notes,
          origine: s.origine,
          siteOfficiel: s.siteOfficiel,
          date: s.date,
          statut: s.statut,
        },
      })),
    };
  }

  async getRandomManga() {
    return this.getRandomItem();
  }

  // Use inherited getGenres() method

  async getItemsByGenre(genre: string, limit = 20, statusFilter = 1) {
    // URL decode the genre parameter
    const decodedGenre = decodeURIComponent(genre.replace(/\+/g, ' '));

    // Get manga IDs that have the specified genre tag
    const mangaIdsWithGenre = await this.prisma.$queryRaw`
      SELECT DISTINCT tf.id_fiche as manga_id
      FROM ak_tags t
      INNER JOIN ak_tag2fiche tf ON t.id_tag = tf.id_tag
      WHERE LOWER(t.tag_name) = LOWER(${decodedGenre})
        AND tf.type = 'manga'
    `;

    const mangaIds = (mangaIdsWithGenre as any[]).map(row => row.manga_id);

    if (mangaIds.length === 0) {
      return {
        genre: decodedGenre,
        ak_mangas: [],
        count: 0,
      };
    }

    const mangas = await this.prisma.akManga.findMany({
      where: {
        idManga: { in: mangaIds },
        statut: statusFilter,
      },
      take: limit,
      orderBy: { moyenneNotes: 'desc' },
    });

    // Fetch publisher relationships (type = 'Editeur') for all mangas at once
    const publisherRelations = await this.prisma.akBusinessToManga.findMany({
      where: {
        idManga: { in: mangaIds },
        type: 'Editeur',
      },
      include: {
        business: {
          select: { idBusiness: true, denomination: true },
        },
      },
      orderBy: { idRelation: 'asc' },
    });

    // Create a map of manga ID to publisher name
    const publisherMap: Map<number, string | null> = new Map();
    publisherRelations.forEach((relation) => {
      if (relation.idManga && !publisherMap.has(relation.idManga)) {
        publisherMap.set(relation.idManga, relation.business?.denomination || null);
      }
    });

    // Enrich mangas with publisher names
    const enrichedMangas = mangas.map((manga) => {
      const publisherName = publisherMap.get(manga.idManga);
      return {
        ...manga,
        editeur: publisherName || manga.editeur,
      };
    });

    return {
      genre: decodedGenre,
      ak_mangas: enrichedMangas.map(this.formatManga.bind(this)),
      count: enrichedMangas.length,
    };
  }

  async getMangasByGenre(genre: string, limit = 20) {
    const result = await this.getItemsByGenre(genre, limit);
    return {
      genre: result.genre,
      mangas: result.ak_mangas,
      count: result.count,
    };
  }

  async getMostPopularMangaTags(limit = 20) {
    const cacheKey = `popular_manga_tags:${limit}`;
    
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const tags = await this.prisma.$queryRaw`
      SELECT 
        t.id_tag,
        t.tag_name,
        t.tag_nice_url,
        t.description,
        t.categorie,
        COUNT(tf.id_fiche) as usage_count
      FROM ak_tags t
      INNER JOIN ak_tag2fiche tf ON t.id_tag = tf.id_tag
      INNER JOIN ak_mangas m ON tf.id_fiche = m.id_manga
      WHERE tf.type = 'manga' AND m.statut = 1
      GROUP BY t.id_tag, t.tag_name, t.tag_nice_url, t.description, t.categorie
      ORDER BY usage_count DESC, t.tag_name ASC
      LIMIT ${limit}
    ` as any[];

    const result = {
      tags: tags.map(tag => ({
        id_tag: tag.id_tag,
        tag_name: tag.tag_name,
        tag_nice_url: tag.tag_nice_url,
        description: tag.description,
        categorie: tag.categorie,
        usage_count: Number(tag.usage_count),
      })),
      total: tags.length,
      generatedAt: new Date().toISOString(),
    };

    await this.cacheService.set(cacheKey, result, 86400); // 24 hours
    
    return result;
  }

  private formatManga(manga: any) {
    const { idManga, dateAjout, image, lienForum, ...otherFields } = manga;

    return {
      id: idManga,
      addedDate: dateAjout?.toISOString(),
      image: image ? (typeof image === 'string' && /^https?:\/\//.test(image) ? image : `/api/media/serve/manga/${image}`) : null,
      lienforum: lienForum || null,
      ...otherFields,
    };
  }

  // ===== Business Relationships Management =====

  async getMangaBusinesses(mangaId: number) {
    // Check if manga exists
    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: mangaId },
    });

    if (!manga) {
      throw new NotFoundException('Manga introuvable');
    }

    // Get all business relationships for this manga
    const relationships = await this.prisma.$queryRaw<Array<{
      id_relation: number;
      id_business: number;
      type: string;
      precisions: string | null;
      denomination: string;
      origine: string | null;
    }>>`
      SELECT
        btm.id_relation,
        btm.id_business,
        btm.type,
        btm.precisions,
        b.denomination,
        b.origine
      FROM ak_business_to_mangas btm
      INNER JOIN ak_business b ON b.id_business = btm.id_business
      WHERE btm.id_manga = ${mangaId}
        AND btm.doublon = 0
      ORDER BY btm.type, b.denomination
    `;

    return relationships.map(rel => ({
      relationId: rel.id_relation,
      businessId: rel.id_business,
      denomination: rel.denomination,
      type: rel.type,
      precisions: rel.precisions,
      origine: rel.origine,
    }));
  }

  async addMangaBusiness(
    mangaId: number,
    businessId: number,
    type: string,
    precisions?: string,
  ) {
    // Check if manga exists
    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: mangaId },
    });

    if (!manga) {
      throw new NotFoundException('Manga introuvable');
    }

    // Check if business exists
    const business = await this.prisma.akBusiness.findUnique({
      where: { idBusiness: businessId },
    });

    if (!business) {
      throw new NotFoundException('Entité business introuvable');
    }

    // Check if relationship already exists
    const existingRelation = await this.prisma.$queryRaw<Array<{ id_relation: number }>>`
      SELECT id_relation
      FROM ak_business_to_mangas
      WHERE id_manga = ${mangaId}
        AND id_business = ${businessId}
        AND type = ${type}
        AND doublon = 0
      LIMIT 1
    `;

    if (existingRelation && existingRelation.length > 0) {
      throw new BadRequestException('Cette relation business existe déjà');
    }

    // Create the relationship
    const result = await this.prisma.$queryRaw<Array<{ id_relation: number }>>`
      INSERT INTO ak_business_to_mangas (id_manga, id_business, type, precisions, doublon)
      VALUES (${mangaId}, ${businessId}, ${type}, ${precisions || null}, 0)
      RETURNING id_relation
    `;

    // Invalidate manga cache
    await this.invalidateMangaCache(mangaId);

    return {
      relationId: result[0].id_relation,
      mangaId,
      businessId,
      type,
      precisions,
      denomination: business.denomination,
    };
  }

  async removeMangaBusiness(mangaId: number, businessId: number) {
    // Find the relationship
    const relationship = await this.prisma.$queryRaw<Array<{ id_relation: number }>>`
      SELECT id_relation
      FROM ak_business_to_mangas
      WHERE id_manga = ${mangaId}
        AND id_business = ${businessId}
        AND doublon = 0
      LIMIT 1
    `;

    if (!relationship || relationship.length === 0) {
      throw new NotFoundException('Relation business introuvable');
    }

    // Delete the relationship
    await this.prisma.$queryRaw`
      DELETE FROM ak_business_to_mangas
      WHERE id_relation = ${relationship[0].id_relation}
    `;

    // Invalidate manga cache
    await this.invalidateMangaCache(mangaId);

    return { message: 'Relation business supprimée avec succès' };
  }

  // Cache helper methods
  private createCacheKey(query: MangaQueryDto): string {
    const {
      page = 1,
      limit = 20,
      search = '',
      auteur = '',
      annee = '',
      statut = '',
      genre = [],
      sortBy = 'dateAjout',
      sortOrder = 'desc',
      includeReviews = false,
    } = query;

    const genreKey = Array.isArray(genre) ? genre.sort().join(',') : (genre as any || '');
    return `${page}_${limit}_${search}_${auteur}_${annee}_${statut}_${genreKey}_${sortBy}_${sortOrder}_${includeReviews}`;
  }

  // Cache invalidation methods
  async invalidateMangaCache(id: number): Promise<void> {
    await this.cacheService.invalidateManga(id);
    // Also invalidate related caches
    await this.cacheService.invalidateSearchCache();
  }

  // Utility method to create consistent cache keys
  private hashQuery(query: string): string {
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}
