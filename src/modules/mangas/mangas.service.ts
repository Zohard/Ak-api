import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { BaseContentService } from '../../shared/services/base-content.service';
import { CreateMangaDto } from './dto/create-manga.dto';
import { UpdateMangaDto } from './dto/update-manga.dto';
import { MangaQueryDto } from './dto/manga-query.dto';
import { AddMediaRelationDto, MediaRelationType } from './dto/add-media-relation.dto';
import { RelatedContentItem, RelationsResponse } from '../shared/types/relations.types';
import { R2Service } from '../media/r2.service';
import { MediaService } from '../media/media.service';
import { AniListService, AniListManga } from '../anilist/anilist.service';
import { OpenLibraryService } from '../books/openlibrary.service';
import { ScrapeService } from '../scrape/scrape.service';
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
    private readonly r2Service: R2Service,
    private readonly mediaService: MediaService,
    private readonly aniListService: AniListService,
    private readonly openLibraryService: OpenLibraryService,
    private readonly scrapeService: ScrapeService,
  ) {
    super(prisma);
  }

  protected get model() {
    return this.prisma.akManga;
  }
  private readonly logger = new Logger(MangasService.name);

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
      titreOrig: true,
      annee: true,
      auteur: true,
      image: true,
    };
  }

  protected mapRawToModel(row: any) {
    return {
      idManga: row.id_manga,
      titre: row.titre,
      titreOrig: row.titre_orig,
      annee: row.annee,
      auteur: row.auteur,
      image: row.image,
    };
  }

  protected formatAutocompleteItem(manga: any) {
    return {
      id_manga: manga.idManga || manga.id_manga,
      titre: manga.titre,
      annee: manga.annee,
      auteur: manga.auteur,
      image: manga.image,
    };
  }

  protected formatItem(manga: any) {
    return this.formatManga(manga);
  }

  /**
   * Upload external image URL to R2
   * Returns the full R2 URL if successful
   * Throws BadRequestException if upload fails
   * @param imageUrl - The external image URL to upload
   * @param title - Optional title for filename generation (format: titre-timestamp.ext)
   */
  private async uploadExternalImageToR2(imageUrl: string, title?: string): Promise<string> {
    // Only process external URLs (not already R2 URLs)
    if (!imageUrl || !imageUrl.startsWith('http') || imageUrl.includes('imagekit.io')) {
      return imageUrl;
    }

    try {
      const result = await this.mediaService.uploadImageFromUrl(
        imageUrl,
        'manga',
        undefined, // relatedId
        false, // saveAsScreenshot
        title // title for filename generation
      );
      // Return the full R2 URL
      return result.url;
    } catch (error) {
      console.error('[MangasService] Failed to upload external image to R2:', {
        imageUrl,
        title,
        error: error.message,
        stack: error.stack
      });
      // Throw error instead of silently falling back to prevent saving external URLs
      throw new BadRequestException(`Failed to upload image to R2: ${error.message}`);
    }
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

    // Upload external image to R2 if present
    if (data.image && data.image.startsWith('http')) {
      data.image = await this.uploadExternalImageToR2(data.image, data.titre);
    }

    // Map nbVolumes (string) to nbVol (int) if valid number
    if (data.nbVolumes) {
      const nbVolInt = parseInt(data.nbVolumes, 10);
      if (!isNaN(nbVolInt) && nbVolInt > 0) {
        data.nbVol = nbVolInt;
      }
    }

    // Check for duplicate titles before creating
    if (data.titre || data.titreOrig) {
      const whereConditions: any[] = [];
      if (data.titre) {
        whereConditions.push({ titre: { equals: data.titre, mode: 'insensitive' as const } });
      }
      if (data.titreOrig) {
        whereConditions.push({ titreOrig: { equals: data.titreOrig, mode: 'insensitive' as const } });
      }

      const duplicateCheck = await this.prisma.akManga.findFirst({
        where: {
          OR: whereConditions,
        },
        select: {
          idManga: true,
          titre: true,
          titreOrig: true,
        },
      });

      if (duplicateCheck) {
        throw new BadRequestException(
          `Un manga avec ce titre existe déjà (ID: ${duplicateCheck.idManga}). ` +
          `Titre: "${duplicateCheck.titre}"${duplicateCheck.titreOrig ? `, Titre original: "${duplicateCheck.titreOrig}"` : ''}`
        );
      }
    }

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
      year,
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
    const searchIds: number[] = [];
    let searchActive = false;

    if (search) {
      searchActive = true;
      const searchTerm = `%${search}%`;
      const matchingIds = await this.prisma.$queryRaw<Array<{ id_manga: number }>>`
        SELECT id_manga FROM ak_mangas
        WHERE unaccent(titre) ILIKE unaccent(${searchTerm})
        OR unaccent(COALESCE(titre_orig, '')) ILIKE unaccent(${searchTerm})
        OR unaccent(COALESCE(titre_fr, '')) ILIKE unaccent(${searchTerm})
        OR unaccent(COALESCE(titres_alternatifs, '')) ILIKE unaccent(${searchTerm})
        OR unaccent(COALESCE(synopsis, '')) ILIKE unaccent(${searchTerm})
      `;
      searchIds.push(...matchingIds.map(r => r.id_manga));
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

    // Accept both annee and year parameters (year is an alias)
    if (annee || year) {
      where.annee = annee || year;
    }

    where.statut = 1; //default published one
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

    // Intersect fallback: if search is active, intersect with whatever is already in where.idManga
    if (searchActive) {
      if (where.idManga?.in) {
        where.idManga.in = where.idManga.in.filter(id => searchIds.includes(id));
      } else {
        where.idManga = { in: searchIds };
      }
    }

    // Note: dateAjout is NOT NULL with default value in database, so no need to filter nulls

    // Exclude null annee when sorting by it
    if (sortBy === 'annee') {
      where.NOT = where.NOT || [];
      where.NOT.push({ annee: null });
    }

    // Exclude unranked manga (classement = 0 or null) when sorting by popularity
    if (sortBy === 'classementPopularite') {
      where.classementPopularite = { gt: 0 };
    }

    // Build order by clause with secondary sort by idManga for stable pagination
    const orderBy: any = [
      { [sortBy || 'dateAjout']: sortOrder || 'desc' },
      { idManga: 'asc' as const } // Secondary sort for stable pagination when primary values are equal
    ];

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

    // For popularity rankings, fetch users in collection count
    let formattedMangas = enrichedMangas.map(this.formatManga);
    if (sortBy === 'classementPopularite' && mangas.length > 0) {
      const mangaIds = mangas.map(m => m.idManga);
      const collectionCounts = await this.prisma.$queryRaw<Array<{ id_manga: number; count: bigint }>>`
        SELECT id_manga, COUNT(DISTINCT id_membre) as count
        FROM collection_mangas
        WHERE id_manga IN (${Prisma.join(mangaIds)})
        GROUP BY id_manga
      `;

      const countsMap = new Map(
        collectionCounts.map(c => [Number(c.id_manga), Number(c.count)])
      );

      formattedMangas = formattedMangas.map(manga => ({
        ...manga,
        usersInCollection: countsMap.get(manga.id) || 0,
      }));
    }

    const result = {
      mangas: formattedMangas,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / (limit || 20)),
      },
    };

    // Cache the result (TTL based on query complexity)
    const ttl = search || genre ? 180 : 1200; // 3 mins for search, 20 mins for general lists
    await this.cacheService.setMangaList(cacheKey, result, ttl);

    return result;
  }

  async findOne(id: number, includeReviews = false, user?: any) {
    // Try to get from cache first (v1 includes collection score)
    const cacheKey = `${id}_${includeReviews}_v1`;
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
              idBusiness: true,
              denomination: true,
              niceUrl: true,
              image: true,
              notes: true,
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
    // Type in database is 'Editeur' (uppercase E)
    const publisherRelation: any = manga.businessRelations?.find((rel: any) => rel.type === 'Editeur');

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

    // Get collection score (average evaluation excluding 0.0)
    const collectionStats = await this.prisma.$queryRaw<Array<{ avg: number; count: number }>>`
      SELECT
        AVG(evaluation) as avg,
        COUNT(*) as count
      FROM collection_mangas
      WHERE id_manga = ${id}
        AND evaluation > 0.0
    `;

    const collectionScore = collectionStats[0]?.avg ? Number(collectionStats[0].avg) : null;
    const collectionEvaluationsCount = collectionStats[0]?.count ? Number(collectionStats[0].count) : 0;

    // Get number of unique users who have this manga in their collection
    const usersInCollectionResult = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT id_membre) as count
      FROM collection_mangas
      WHERE id_manga = ${id}
    `;
    const usersInCollection = Number(usersInCollectionResult[0]?.count || 0);

    // Use pre-calculated popularity rank from database (updated by cron job)
    // This avoids expensive real-time calculations on every page load
    const popularityRank = manga.classementPopularite || 0;

    const formattedManga = {
      ...this.formatManga(enrichedManga),
      articlesCount,
      collectionScore,
      collectionEvaluationsCount,
      usersInCollection,
      popularityRank,
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

    // If replacing image and previous image is an R2 URL, attempt deletion in IK
    let updateData: any = { ...updateMangaDto };

    // Normalize empty string to null for image field
    if (updateData.image === '') {
      updateData.image = null;
    }

    // Upload external image to R2 if present
    if (updateData.image && updateData.image.startsWith('http')) {
      updateData.image = await this.uploadExternalImageToR2(updateData.image, updateData.titre || manga.titre);
    }

    // Map nbVolumes (string) to nbVol (int) if valid number
    if (updateData.nbVolumes !== undefined) {
      if (updateData.nbVolumes) {
        const nbVolInt = parseInt(updateData.nbVolumes, 10);
        if (!isNaN(nbVolInt) && nbVolInt > 0) {
          updateData.nbVol = nbVolInt;
        } else {
          updateData.nbVol = null;
        }
      } else {
        updateData.nbVol = null;
      }
    }

    // If replacing or deleting image and previous image is an R2 URL, attempt deletion in IK
    try {
      const isImageBeingRemoved = updateData.image === null || updateData.image === '';
      const isImageBeingReplaced = typeof updateData.image === 'string' && updateData.image && updateData.image !== manga.image;

      if (
        (isImageBeingRemoved || isImageBeingReplaced) &&
        typeof manga.image === 'string' &&
        manga.image &&
        /imagekit\.io/.test(manga.image)
      ) {
        await this.r2Service.deleteImageByUrl(manga.image);
        // Log removed
      }
    } catch (e) {
      console.warn('Failed to delete previous R2 image (manga):', (e as Error).message);
    }

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

    // Delete associated activity logs first
    await this.prisma.$executeRaw`
      DELETE FROM ak_logs_admin WHERE manga = ${id}
    `;

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

  async getMangasByDateRange(startDate: string, endDate: string, limit = 200) {
    try {
      const cacheKey = `anilist_manga_daterange:${startDate}:${endDate}:${limit}`;
      const cached = await this.cacheService.get(cacheKey);
      if (cached) return cached;

      // Fetch mangas from AniList by date range
      const anilistMangas = await this.aniListService.getMangasByDateRange(startDate, endDate, limit);

      // Check which mangas exist in our database
      const comparisons = await Promise.all(
        anilistMangas.map(async (anilistManga: AniListManga) => {
          const primaryTitle = anilistManga.title.romaji || anilistManga.title.english || anilistManga.title.native;

          // Build comprehensive search conditions to check all title fields
          const orConditions: any[] = [];

          // Check against primary title
          if (primaryTitle) {
            orConditions.push({ titre: { equals: primaryTitle, mode: Prisma.QueryMode.insensitive } });
            orConditions.push({ titresAlternatifs: { contains: primaryTitle, mode: Prisma.QueryMode.insensitive } });
          }

          // Check against native/original title
          if (anilistManga.title.native) {
            orConditions.push({ titreOrig: { equals: anilistManga.title.native, mode: Prisma.QueryMode.insensitive } });
            orConditions.push({ titresAlternatifs: { contains: anilistManga.title.native, mode: Prisma.QueryMode.insensitive } });
          }

          // Check against English/French title
          if (anilistManga.title.english) {
            orConditions.push({ titreFr: { equals: anilistManga.title.english, mode: Prisma.QueryMode.insensitive } });
            orConditions.push({ titresAlternatifs: { contains: anilistManga.title.english, mode: Prisma.QueryMode.insensitive } });
          }

          // Check against romaji title if different from primary
          if (anilistManga.title.romaji && anilistManga.title.romaji !== primaryTitle) {
            orConditions.push({ titre: { equals: anilistManga.title.romaji, mode: Prisma.QueryMode.insensitive } });
            orConditions.push({ titresAlternatifs: { contains: anilistManga.title.romaji, mode: Prisma.QueryMode.insensitive } });
          }

          // Search for existing manga
          const existing = await this.prisma.akManga.findFirst({
            where: {
              OR: orConditions,
            },
            select: {
              idManga: true,
              titre: true,
              titreOrig: true,
              titreFr: true,
              titresAlternatifs: true,
            },
          });

          return {
            titre: primaryTitle,
            exists: !!existing,
            existingMangaId: existing?.idManga || null,
            anilistData: anilistManga,
            scrapedData: this.aniListService.mapToCreateMangaDto(anilistManga),
          };
        }),
      );

      const result = {
        comparisons,
        total: comparisons.length,
        dateRange: { startDate, endDate },
        source: 'AniList',
      };

      // Cache for 2 hours
      await this.cacheService.set(cacheKey, result, 7200);
      return result;
    } catch (error: any) {
      console.error('Error fetching mangas by date range from AniList:', error.message);
      throw new Error('Failed to fetch mangas by date range from AniList');
    }
  }

  /**
   * Compare booknode manga releases with database
   * Check if manga exists based on title and alternative titles (including Jikan data)
   */
  async compareBooknodeMangasWithDatabase(booknodeMangas: Array<{
    titre: string;
    auteur: string;
    releaseDate: string;
    imageUrl: string;
    booknodeUrl: string;
  }>) {
    const comparisons = await Promise.all(
      booknodeMangas.map(async (booknodeManga) => {
        // Extract base manga title by removing volume/tome information
        // Patterns to remove: ", Tome X", ", tome X", ", Volume X", ", vol. X", etc.
        const baseTitre = booknodeManga.titre
          .replace(/,\s*Tome\s+\d+.*$/i, '')
          .replace(/,\s*Volume\s+\d+.*$/i, '')
          .replace(/,\s*Vol\.?\s+\d+.*$/i, '')
          .replace(/,\s*T\.?\s*\d+.*$/i, '')
          .trim();

        // Build comprehensive search conditions to check all title fields
        const orConditions: any[] = [];

        // Check against base title (without volume number)
        if (baseTitre) {
          orConditions.push({ titre: { equals: baseTitre, mode: Prisma.QueryMode.insensitive } });
          orConditions.push({ titreOrig: { equals: baseTitre, mode: Prisma.QueryMode.insensitive } });
          orConditions.push({ titreFr: { equals: baseTitre, mode: Prisma.QueryMode.insensitive } });
          orConditions.push({ titresAlternatifs: { contains: baseTitre, mode: Prisma.QueryMode.insensitive } });
        }

        // Also check against original title with volume (in case it's stored that way)
        if (booknodeManga.titre !== baseTitre) {
          orConditions.push({ titre: { equals: booknodeManga.titre, mode: Prisma.QueryMode.insensitive } });
          orConditions.push({ titresAlternatifs: { contains: booknodeManga.titre, mode: Prisma.QueryMode.insensitive } });
        }

        // Try to fetch Jikan data to get Japanese and English titles
        try {
          const jikanUrl = new URL('https://api.jikan.moe/v4/manga');
          jikanUrl.searchParams.set('q', baseTitre);
          jikanUrl.searchParams.set('limit', '3');

          const jikanResponse = await fetch(jikanUrl.toString());
          if (jikanResponse.ok) {
            const jikanData = await jikanResponse.json();
            if (jikanData?.data && jikanData.data.length > 0) {
              // Get the first result (or best match)
              const jikanManga = jikanData.data.find((item: any) => item.type === 'Manga') || jikanData.data[0];

              // Add Japanese title to search
              if (jikanManga.title_japanese) {
                orConditions.push({ titre: { equals: jikanManga.title_japanese, mode: Prisma.QueryMode.insensitive } });
                orConditions.push({ titreOrig: { equals: jikanManga.title_japanese, mode: Prisma.QueryMode.insensitive } });
                orConditions.push({ titresAlternatifs: { contains: jikanManga.title_japanese, mode: Prisma.QueryMode.insensitive } });
              }

              // Add English title to search
              if (jikanManga.title_english) {
                orConditions.push({ titre: { equals: jikanManga.title_english, mode: Prisma.QueryMode.insensitive } });
                orConditions.push({ titreFr: { equals: jikanManga.title_english, mode: Prisma.QueryMode.insensitive } });
                orConditions.push({ titresAlternatifs: { contains: jikanManga.title_english, mode: Prisma.QueryMode.insensitive } });
              }

              // Add Romaji title to search
              if (jikanManga.title) {
                orConditions.push({ titre: { equals: jikanManga.title, mode: Prisma.QueryMode.insensitive } });
                orConditions.push({ titresAlternatifs: { contains: jikanManga.title, mode: Prisma.QueryMode.insensitive } });
              }
            }
          }
        } catch (jikanErr) {
          // Continue without Jikan data if it fails
          console.warn(`Failed to fetch Jikan data for "${baseTitre}":`, jikanErr.message);
        }

        // Search for existing manga
        // Check for existing manga
        const existing = await this.prisma.akManga.findFirst({
          where: {
            OR: orConditions,
          },
          select: {
            idManga: true,
            titre: true,
            titreOrig: true,
            titreFr: true,
            titresAlternatifs: true,
          },
        });

        // Check for volume existence if manga exists
        let volumeExists = false;
        let volumeNumber: number | null = null;

        if (existing) {
          // Extract volume number from title
          // Support formats: "Tome 12", "Vol. 12", " #12", or just " 12" at the end
          const volumeMatch = booknodeManga.titre.match(/(?:Tome|Volume|Vol\.?|T\.?)\s+(\d+)|(?:\s+#?(\d+))$/i);
          if (volumeMatch) {
            volumeNumber = parseInt(volumeMatch[1] || volumeMatch[2], 10);

            // Check if volume exists in database
            const volume = await this.prisma.mangaVolume.findFirst({
              where: {
                idManga: existing.idManga,
                volumeNumber: volumeNumber
              }
            });

            volumeExists = !!volume;
          }
        }

        return {
          titre: booknodeManga.titre,
          baseTitre, // Include base title for debugging
          auteur: booknodeManga.auteur,
          releaseDate: booknodeManga.releaseDate,
          imageUrl: booknodeManga.imageUrl,
          booknodeUrl: booknodeManga.booknodeUrl,
          exists: !!existing,
          existingMangaId: existing?.idManga || null,
          volumeExists,
          volumeNumber
        };
      }),
    );

    return {
      comparisons,
      total: comparisons.length,
      source: 'Booknode',
    };
  }

  async lookupByIsbn(isbn: string, userId?: number) {
    try {
      let bookInfo: any = null;
      let rawTitle = '';
      let authors = '';
      let description = '';
      let thumbnail: string | null = null;
      let bookSource = 'none';

      // Strategy 1: Try Google Books API first (best for French ISBNs)
      try {
        this.logger.debug(`Trying Google Books API for ISBN ${isbn}`);
        const cleanIsbn = isbn.replace(/[-\s]/g, '');
        const apiKey = process.env.GOOGLE_BOOKS_API_KEY || '';
        const googleBooksUrl = apiKey
          ? `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}&key=${apiKey}`
          : `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`;
        const googleResponse = await axios.get(googleBooksUrl, { timeout: 8000 });

        if (googleResponse.data.items && googleResponse.data.items.length > 0) {
          const volumeInfo = googleResponse.data.items[0].volumeInfo;
          rawTitle = volumeInfo.title || '';
          authors = volumeInfo.authors ? volumeInfo.authors.join(', ') : '';
          description = volumeInfo.description || '';
          thumbnail = volumeInfo.imageLinks?.thumbnail || volumeInfo.imageLinks?.smallThumbnail || null;

          bookInfo = {
            title: rawTitle,
            authors,
            description,
            thumbnail,
            publishedDate: volumeInfo.publishedDate,
            pageCount: volumeInfo.pageCount,
            publisher: volumeInfo.publisher,
            language: volumeInfo.language,
          };
          bookSource = 'google';
          this.logger.debug(`✓ Found in Google Books: ${rawTitle}`);
        }
      } catch (googleError) {
        this.logger.debug(`Google Books API failed or no results for ISBN ${isbn}`);
      }

      // Strategy 2: If Google Books failed, try OpenLibrary
      if (!bookInfo) {
        try {
          this.logger.debug(`Trying OpenLibrary API for ISBN ${isbn}`);
          const openLibraryBook = await this.openLibraryService.getBookByIsbn(isbn);
          rawTitle = openLibraryBook.title || '';
          authors = openLibraryBook.authors?.join(', ') || '';
          description = openLibraryBook.description || '';
          thumbnail = openLibraryBook.coverUrl || null;

          bookInfo = {
            title: rawTitle,
            authors,
            description,
            thumbnail,
            publishedDate: openLibraryBook.publishDate,
            pageCount: openLibraryBook.numberOfPages,
            publisher: openLibraryBook.publisher,
            language: openLibraryBook.language,
            subjects: openLibraryBook.subjects,
            openLibraryUrl: openLibraryBook.openLibraryUrl,
          };
          bookSource = 'openlibrary';
          this.logger.debug(`✓ Found in OpenLibrary: ${rawTitle}`);
        } catch (openLibraryError) {
          this.logger.debug(`OpenLibrary API failed or no results for ISBN ${isbn}`);
        }
      }

      // Strategy 3: Try Manga-News (French)
      if (!bookInfo) {
        try {
          this.logger.debug(`Trying Manga-News for ISBN ${isbn}`);
          const mangaNewsUrl = await this.scrapeService.searchMangaNews(isbn);

          if (mangaNewsUrl) {
            const mangaData = await this.scrapeService.scrapeMangaNewsMangaDetails(mangaNewsUrl);
            rawTitle = mangaData.titre || '';
            authors = mangaData.auteurs.map(a => a.name).join(', ') || '';
            description = mangaData.description || '';
            thumbnail = mangaData.coverUrl || null;

            bookInfo = {
              title: rawTitle,
              authors,
              description,
              thumbnail,
              publisher: mangaData.editeurs.map(e => e.name).join(', '),
              language: 'fr', // Manga-News is French
              mangaNewsUrl: mangaData.url,
            };
            bookSource = 'manga-news';
            this.logger.debug(`✓ Found in Manga-News: ${rawTitle}`);
          }
        } catch (mangaNewsError) {
          this.logger.debug(`Manga-News lookup failed: ${mangaNewsError.message}`);
        }
      }

      // Strategy 4: Try AniList API
      if (!bookInfo) {
        try {
          this.logger.debug(`Trying AniList API for ISBN ${isbn}`);
          const anilistManga = await this.aniListService.getMangaByIsbn(isbn);

          if (anilistManga) {
            rawTitle = anilistManga.title.romaji || anilistManga.title.english || anilistManga.title.native || '';
            authors = anilistManga.staff?.edges
              ?.filter(e => e.role.toLowerCase().includes('story') || e.role.toLowerCase().includes('art'))
              ?.map(e => e.node.name.full)
              ?.join(', ') || '';
            description = anilistManga.description || '';
            thumbnail = anilistManga.coverImage?.extraLarge || anilistManga.coverImage?.large || null;

            bookInfo = {
              title: rawTitle,
              authors,
              description,
              thumbnail,
              publishedDate: anilistManga.startDate?.year ? String(anilistManga.startDate.year) : undefined,
              publisher: '',
              language: 'ja',
              anilistId: anilistManga.id,
            };
            bookSource = 'anilist';
            this.logger.debug(`✓ Found in AniList: ${rawTitle}`);
          }
        } catch (anilistError) {
          this.logger.debug(`AniList lookup failed: ${anilistError.message}`);
        }
      }

      // If we found book info, log the source
      if (bookInfo) {
        this.logger.debug(`Book metadata source: ${bookSource}`);
      } else {
        this.logger.debug(`No book metadata found in Google Books, OpenLibrary, Booknode or AniList, will search local database only`);
      }

      // Clean the title for better matching
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

      this.logger.debug('ISBN lookup - Raw title:', rawTitle);
      this.logger.debug('ISBN lookup - Cleaned title:', cleanedTitle);

      // Search local ak_mangas database
      let mangaResults: any[] = [];

      // Strategy 1: Search by ISBN first (exact match)
      if (isbn) {
        const cleanIsbn = isbn.replace(/[-\s]/g, '');
        mangaResults = await this.prisma.$queryRaw<Array<{
          id_manga: number;
          titre: string;
          auteur: string | null;
          image: string | null;
          annee: string | null;
          nb_volumes: string | null;
          synopsis: string | null;
          origine: string | null;
          editeur: string | null;
          nice_url: string | null;
          moyennenotes: number | null;
          similarity_score: number;
        }>>`
          SELECT
            id_manga,
            titre,
            auteur,
            image,
            annee,
            nb_volumes,
            synopsis,
            origine,
            editeur,
            nice_url,
            moyennenotes,
            1.0 as similarity_score
          FROM ak_mangas
          WHERE statut = 1
            AND (
              isbn LIKE ${`%${cleanIsbn}%`}
              OR isbn LIKE ${`%${isbn}%`}
            )
          LIMIT 10
        `;
      }

      // Strategy 2: If no ISBN match and we have a title, search by title similarity
      if (mangaResults.length === 0 && (cleanedTitle || rawTitle)) {
        const searchTitle = cleanedTitle || rawTitle;

        // Try using pg_trgm SIMILARITY function first
        try {
          mangaResults = await this.prisma.$queryRaw<Array<{
            id_manga: number;
            titre: string;
            auteur: string | null;
            image: string | null;
            annee: string | null;
            nb_volumes: string | null;
            synopsis: string | null;
            origine: string | null;
            editeur: string | null;
            nice_url: string | null;
            moyennenotes: number | null;
            similarity_score: number;
          }>>`
            SELECT
              id_manga,
              titre,
              auteur,
              image,
              annee,
              nb_volumes,
              synopsis,
              origine,
              editeur,
              nice_url,
              moyennenotes,
              GREATEST(
                SIMILARITY(titre, ${searchTitle}),
                SIMILARITY(COALESCE(titre_orig, ''), ${searchTitle}),
                SIMILARITY(COALESCE(titre_fr, ''), ${searchTitle}),
                SIMILARITY(COALESCE(titres_alternatifs, ''), ${searchTitle})
              ) as similarity_score
            FROM ak_mangas
            WHERE statut = 1
              AND (
                SIMILARITY(titre, ${searchTitle}) >= 0.3
                OR SIMILARITY(COALESCE(titre_orig, ''), ${searchTitle}) >= 0.3
                OR SIMILARITY(COALESCE(titre_fr, ''), ${searchTitle}) >= 0.3
                OR SIMILARITY(COALESCE(titres_alternatifs, ''), ${searchTitle}) >= 0.3
              )
            ORDER BY similarity_score DESC
            LIMIT 10
          `;
        } catch (similarityError: any) {
          // Fallback to ILIKE if pg_trgm extension is not available
          this.logger.debug('SIMILARITY function not available, using ILIKE fallback');
          const searchPattern = `%${searchTitle}%`;
          mangaResults = await this.prisma.$queryRaw<Array<{
            id_manga: number;
            titre: string;
            auteur: string | null;
            image: string | null;
            annee: string | null;
            nb_volumes: string | null;
            synopsis: string | null;
            origine: string | null;
            editeur: string | null;
            nice_url: string | null;
            moyennenotes: number | null;
            similarity_score: number;
          }>>`
            SELECT
              id_manga,
              titre,
              auteur,
              image,
              annee,
              nb_volumes,
              synopsis,
              origine,
              editeur,
              nice_url,
              moyennenotes,
              0.8 as similarity_score
            FROM ak_mangas
            WHERE statut = 1
              AND (
                titre ILIKE ${searchPattern}
                OR titre_orig ILIKE ${searchPattern}
                OR titre_fr ILIKE ${searchPattern}
                OR titres_alternatifs ILIKE ${searchPattern}
              )
            ORDER BY titre
            LIMIT 10
          `;
        }
      }

      this.logger.debug('ISBN lookup - Found', mangaResults.length, 'local manga matches');

      // Check if this ISBN already has a volume registered
      const existingVolume = await this.prisma.mangaVolume.findFirst({
        where: { isbn },
        select: {
          idVolume: true,
          idManga: true,
          volumeNumber: true,
        },
      });

      // Fetch user's collection status for these mangas if userId is provided
      let userCollections: Map<number, { collectionType: number }> = new Map();
      if (userId && mangaResults.length > 0) {
        const mangaIds = mangaResults.map(m => m.id_manga);
        const collections = await this.prisma.collectionManga.findMany({
          where: {
            idMembre: userId,
            idManga: { in: mangaIds },
          },
          select: {
            idManga: true,
            type: true,
          },
        });

        collections.forEach(c => {
          userCollections.set(c.idManga, { collectionType: c.type });
        });
      }

      return {
        isbn: isbn,
        bookInfo: bookInfo, // Book metadata from Google Books or OpenLibrary (or null)
        bookSource: bookSource, // 'google', 'openlibrary', or 'none'
        volumeAlreadyExists: !!existingVolume,
        existingVolumeMangaId: existingVolume?.idManga || null,
        mangaResults: mangaResults.map(manga => ({
          id: manga.id_manga,
          title: manga.titre,
          author: manga.auteur,
          image: manga.image ? (typeof manga.image === 'string' && /^https?:\/\//.test(manga.image) ? manga.image : `/api/media/serve/manga/${manga.image}`) : null,
          year: manga.annee,
          volumes: manga.nb_volumes,
          synopsis: manga.synopsis,
          origin: manga.origine,
          publisher: manga.editeur,
          niceUrl: manga.nice_url,
          rating: manga.moyennenotes,
          similarityScore: Math.round((manga.similarity_score || 0) * 100), // Convert to percentage
          userCollectionStatus: userCollections.get(manga.id_manga)?.collectionType || null,
          hasVolumeRegistered: existingVolume?.idManga === manga.id_manga,
        })),
        message: this.buildResultMessage(bookSource, mangaResults.length),
      };
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error in ISBN lookup:', error.message);
      console.error('Full error:', error);
      console.error('Stack trace:', error.stack);
      throw new BadRequestException(`Failed to lookup ISBN: ${error.message}`);
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

    // Fetch article relations from ak_webzine_to_fiches
    const articleRelations = await this.prisma.akWebzineToFiches.findMany({
      where: {
        idFiche: id,
        type: 'manga',
      },
      include: {
        wpPost: {
          select: {
            ID: true,
            postTitle: true,
            postName: true,
            postDate: true,
            postExcerpt: true,
            postStatus: true,
            postMeta: {
              where: {
                metaKey: {
                  in: ['imgunebig', 'imgunebig2', 'ak_img', 'img'],
                },
              },
              select: {
                metaKey: true,
                metaValue: true,
              },
            },
          },
        },
      },
    });

    // Add published articles to related content
    for (const articleRel of articleRelations) {
      if (articleRel.wpPost?.postStatus === 'publish') {
        // Extract cover image from postMeta (prioritize imgunebig)
        const imgunebigMeta = articleRel.wpPost.postMeta.find(meta => meta.metaKey === 'imgunebig');
        const imgunebig2Meta = articleRel.wpPost.postMeta.find(meta => meta.metaKey === 'imgunebig2');
        const akImgMeta = articleRel.wpPost.postMeta.find(meta => meta.metaKey === 'ak_img');
        const imgMeta = articleRel.wpPost.postMeta.find(meta => meta.metaKey === 'img');

        const coverImage = imgunebigMeta?.metaValue ||
          imgunebig2Meta?.metaValue ||
          akImgMeta?.metaValue ||
          imgMeta?.metaValue ||
          null;

        relatedContent.push({
          id: Number(articleRel.wpPost.ID),
          type: 'article',
          title: articleRel.wpPost.postTitle || 'Sans titre',
          image: coverImage,
          year: null,
          rating: null,
          niceUrl: null,
          relationType: 'article',
          slug: articleRel.wpPost.postName || '',
          date: articleRel.wpPost.postDate,
          excerpt: articleRel.wpPost.postExcerpt || '',
        });
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
            postMeta: {
              where: {
                metaKey: {
                  in: ['imgunebig', 'imgunebig2', 'ak_img', 'img'],
                },
              },
              select: {
                metaKey: true,
                metaValue: true,
              },
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

        // Extract cover image from postMeta (prioritize imgunebig like ArticleCard)
        const imgunebigMeta = post.postMeta.find(meta => meta.metaKey === 'imgunebig');
        const imgunebig2Meta = post.postMeta.find(meta => meta.metaKey === 'imgunebig2');
        const akImgMeta = post.postMeta.find(meta => meta.metaKey === 'ak_img');
        const imgMeta = post.postMeta.find(meta => meta.metaKey === 'img');

        const coverImage = imgunebigMeta?.metaValue ||
          imgunebig2Meta?.metaValue ||
          akImgMeta?.metaValue ||
          imgMeta?.metaValue ||
          null;

        return {
          id: post.ID,
          title: post.postTitle,
          excerpt: post.postExcerpt,
          content: post.postContent,
          date: post.postDate,
          slug: post.postName,
          coverImage,
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
    await this.cacheService.invalidateRankings('manga');
    await this.cacheService.invalidateHomepageStats(); // Invalidate homepage stats (manga count)
    await this.cacheService.invalidateMangaPlanning();
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

  // Build result message based on book source and manga results
  private buildResultMessage(bookSource: string, mangaCount: number): string {
    if (mangaCount > 0) {
      if (bookSource === 'google') {
        return `Found book in Google Books and ${mangaCount} matching manga in local database.`;
      } else if (bookSource === 'openlibrary') {
        return `Found book in OpenLibrary and ${mangaCount} matching manga in local database.`;
      } else {
        return `Book not found in external APIs, but found ${mangaCount} matching manga in local database.`;
      }
    } else {
      if (bookSource === 'google') {
        return 'Book found in Google Books but no matching manga in local database.';
      } else if (bookSource === 'openlibrary') {
        return 'Book found in OpenLibrary but no matching manga in local database.';
      } else {
        return 'ISBN not found in any book database or local manga database.';
      }
    }
  }

  // ==================== MANGA VOLUMES METHODS ====================

  /**
   * Get all volumes for a manga
   */
  async getMangaVolumes(mangaId: number) {
    return this.prisma.mangaVolume.findMany({
      where: { idManga: mangaId },
      orderBy: { volumeNumber: 'asc' },
    });
  }

  /**
   * Get a specific volume
   */
  async getVolume(volumeId: number) {
    const volume = await this.prisma.mangaVolume.findUnique({
      where: { idVolume: volumeId },
      include: { manga: true },
    });

    if (!volume) {
      throw new NotFoundException(`Volume with ID ${volumeId} not found`);
    }

    return volume;
  }

  /**
   * Get volume by ISBN
   */
  async getVolumeByIsbn(isbn: string) {
    const volume = await this.prisma.mangaVolume.findFirst({
      where: { isbn },
      include: { manga: true },
    });

    if (!volume) {
      throw new NotFoundException(`Volume with ISBN ${isbn} not found`);
    }

    return volume;
  }

  /**
   * Create a new volume for a manga
   */
  async createVolume(mangaId: number, createVolumeDto: any) {
    // Check if manga exists (direct query - no status filter for admin endpoints)
    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: mangaId },
    });
    if (!manga) {
      throw new NotFoundException(`Manga with ID ${mangaId} not found`);
    }

    let volumeNumber = createVolumeDto.volumeNumber;

    // If volume number is not provided, auto-increment
    if (!volumeNumber) {
      const maxVol = await this.prisma.mangaVolume.findFirst({
        where: { idManga: mangaId },
        orderBy: { volumeNumber: 'desc' },
        select: { volumeNumber: true },
      });
      volumeNumber = (maxVol?.volumeNumber || 0) + 1;
    }

    // Check if volume number already exists for this manga
    const existingVolume = await this.prisma.mangaVolume.findUnique({
      where: {
        unique_manga_volume: {
          idManga: mangaId,
          volumeNumber: volumeNumber,
        },
      },
    });

    if (existingVolume) {
      throw new BadRequestException(
        `Volume ${volumeNumber} already exists for this manga`,
      );
    }

    // Check if ISBN already exists
    if (createVolumeDto.isbn) {
      const existingIsbn = await this.prisma.mangaVolume.findFirst({
        where: { isbn: createVolumeDto.isbn },
      });

      if (existingIsbn) {
        throw new BadRequestException(
          `ISBN ${createVolumeDto.isbn} already exists for another volume`,
        );
      }
    }

    const volume = await this.prisma.mangaVolume.create({
      data: {
        idManga: mangaId,
        volumeNumber: volumeNumber,
        isbn: createVolumeDto.isbn,
        coverImage: createVolumeDto.coverImage,
        title: createVolumeDto.title,
        releaseDate: createVolumeDto.releaseDate
          ? new Date(createVolumeDto.releaseDate)
          : undefined,
        description: createVolumeDto.description,
      },
    });

    await this.cacheService.invalidateMangaPlanning();
    return volume;
  }

  /**
   * Update a volume
   */
  async updateVolume(volumeId: number, updateVolumeDto: any) {
    // Check if volume exists
    await this.getVolume(volumeId);

    // If updating ISBN, check it doesn't exist
    if (updateVolumeDto.isbn) {
      const existingIsbn = await this.prisma.mangaVolume.findFirst({
        where: {
          isbn: updateVolumeDto.isbn,
          idVolume: { not: volumeId },
        },
      });

      if (existingIsbn) {
        throw new BadRequestException(
          `ISBN ${updateVolumeDto.isbn} already exists for another volume`,
        );
      }
    }

    const updatedVolume = await this.prisma.mangaVolume.update({
      where: { idVolume: volumeId },
      data: {
        ...updateVolumeDto,
        releaseDate: updateVolumeDto.releaseDate
          ? new Date(updateVolumeDto.releaseDate)
          : undefined,
      },
    });

    await this.cacheService.invalidateMangaPlanning();
    return updatedVolume;
  }

  /**
   * Delete a volume
   */
  async deleteVolume(volumeId: number) {
    // Check if volume exists
    await this.getVolume(volumeId);

    await this.prisma.mangaVolume.delete({
      where: { idVolume: volumeId },
    });

    await this.cacheService.invalidateMangaPlanning();

    return { message: 'Volume deleted successfully' };
  }

  /**
   * Create or update volume from ISBN scan
   */
  async upsertVolumeFromIsbn(mangaId: number, isbn: string, bookData: any) {
    // Check if volume with this ISBN already exists
    const existingVolume = await this.prisma.mangaVolume.findFirst({
      where: { isbn },
    });

    if (existingVolume) {
      return {
        volume: existingVolume,
        created: false,
        message: 'Volume already exists with this ISBN',
      };
    }

    // Get manga details for AniList search
    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: mangaId },
      select: { titre: true, titreOrig: true },
    });

    if (!manga) {
      throw new NotFoundException(`Manga with ID ${mangaId} not found`);
    }

    // Get current max volume number for this manga
    const maxVolume = await this.prisma.mangaVolume.findFirst({
      where: { idManga: mangaId },
      orderBy: { volumeNumber: 'desc' },
      select: { volumeNumber: true },
    });

    const nextVolumeNumber = maxVolume ? maxVolume.volumeNumber + 1 : 1;

    // Check if this manga+volume number combination already exists
    const existingVolumeNumber = await this.prisma.mangaVolume.findFirst({
      where: {
        idManga: mangaId,
        volumeNumber: nextVolumeNumber,
      },
    });

    if (existingVolumeNumber) {
      return {
        volume: existingVolumeNumber,
        created: false,
        message: `Volume ${nextVolumeNumber} already exists for this manga`,
      };
    }

    // Try to fetch cover from AniList and upload to R2
    let coverImagePath = bookData?.coverImage;
    try {
      // Search AniList using manga title (prefer original title, fallback to French)
      const searchQuery = manga.titreOrig || manga.titre;
      const anilistResults = await this.aniListService.searchManga(searchQuery, 1);

      if (anilistResults && anilistResults.length > 0) {
        const anilistManga = anilistResults[0];
        const coverUrl = anilistManga.coverImage?.extraLarge || anilistManga.coverImage?.large || anilistManga.coverImage?.medium;

        if (coverUrl) {
          // Generate filename: sanitize manga title + tome number
          const sanitizedTitle = manga.titre
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove accents
            .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
            .replace(/^-+|-+$/g, ''); // Trim hyphens

          const filename = `${sanitizedTitle}-tome-${nextVolumeNumber}.jpg`;

          // Upload to R2
          const uploadResult = await this.r2Service.uploadImageFromUrl(
            coverUrl,
            filename,
            'images/mangas/covers',
          );

          if (uploadResult && uploadResult.filePath) {
            coverImagePath = uploadResult.filePath;
          }
        }
      }
    } catch (error) {
      // Log error but don't fail volume creation
      console.error('Failed to fetch/upload cover from AniList:', error.message);
    }

    // Create new volume
    const volume = await this.prisma.mangaVolume.create({
      data: {
        idManga: mangaId,
        volumeNumber: nextVolumeNumber,
        isbn,
        title: bookData?.title,
        description: bookData?.description,
        releaseDate: bookData?.publishedDate
          ? new Date(bookData.publishedDate)
          : undefined,
        coverImage: coverImagePath,
      },
    });

    await this.cacheService.invalidateMangaPlanning();

    return {
      volume,
      created: true,
      message: 'Volume created successfully',
    };
  }

  // ==================== CROSS-MEDIA RELATIONS METHODS ====================

  /**
   * Get all cross-media relations for a manga
   */
  async getMediaRelations(mangaId: number) {
    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: mangaId },
    });

    if (!manga) {
      throw new NotFoundException(`Manga with ID ${mangaId} not found`);
    }

    // Get all different types of relations using raw SQL with ak_fiche_to_fiche
    const [animeRelations, mangaRelations, gameRelations, businessRelations, articleRelations] = await Promise.all([
      // Anime relations
      this.prisma.$queryRawUnsafe<any[]>(`
        SELECT a.id_anime, a.titre, a.image, a.annee, a.nice_url
        FROM ak_animes a
        JOIN ak_fiche_to_fiche r ON a.id_anime = r.id_anime
        WHERE r.id_fiche_depart = 'manga_${mangaId}' AND r.id_anime > 0
      `).catch(() => []),
      // Manga relations
      this.prisma.$queryRawUnsafe<any[]>(`
        SELECT m.id_manga, m.titre, m.image, m.annee, m.nice_url
        FROM ak_mangas m
        JOIN ak_fiche_to_fiche r ON m.id_manga = r.id_manga
        WHERE r.id_fiche_depart = 'manga_${mangaId}' AND r.id_manga > 0
      `).catch(() => []),
      // Game relations
      this.prisma.$queryRawUnsafe<any[]>(`
        SELECT g.id_jeu, g.titre, g.image, g.annee, g.nice_url
        FROM ak_jeux_video g
        JOIN ak_fiche_to_fiche r ON g.id_jeu = r.id_jeu
        WHERE r.id_fiche_depart = 'manga_${mangaId}' AND r.id_jeu > 0
      `).catch(() => []),
      // Business relations
      this.prisma.$queryRawUnsafe<any[]>(`
        SELECT b.id_business, b.denomination, b.image, b.nice_url
        FROM ak_business b
        JOIN ak_fiche_to_fiche r ON b.id_business = r.id_business
        WHERE r.id_fiche_depart = 'manga_${mangaId}' AND r.id_business > 0
      `).catch(() => []),
      // Article relations
      this.prisma.$queryRawUnsafe<any[]>(`
        SELECT a.id, a.title, a.image
        FROM ak_articles a
        JOIN ak_webzine_to_fiches r ON a.id = r.id_article
        WHERE r.id_fiche = ${mangaId} AND r.type_fiche = 'manga'
      `).catch(() => []),
    ]);

    return {
      anime: animeRelations.map((r: any) => ({
        id: r.id_anime,
        title: r.titre,
        image: r.image,
        year: r.annee,
        niceUrl: r.nice_url,
        mediaType: 'anime',
      })),
      manga: mangaRelations.map((r: any) => ({
        id: r.id_manga,
        title: r.titre,
        image: r.image,
        year: r.annee,
        niceUrl: r.nice_url,
        mediaType: 'manga',
      })),
      game: gameRelations.map((r: any) => ({
        id: r.id_jeu,
        title: r.titre,
        image: r.image,
        year: r.annee,
        niceUrl: r.nice_url,
        mediaType: 'game',
      })),
      business: businessRelations.map((r: any) => ({
        id: r.id_business,
        title: r.denomination,
        image: r.image,
        niceUrl: r.nice_url,
        mediaType: 'business',
      })),
      article: articleRelations.map((r: any) => ({
        id: r.id,
        title: r.title,
        image: r.image,
        mediaType: 'article',
      })),
    };
  }

  /**
   * Add a cross-media relation to a manga
   */
  async addMediaRelation(mangaId: number, dto: AddMediaRelationDto) {
    // Verify manga exists
    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: mangaId },
    });

    if (!manga) {
      throw new NotFoundException(`Manga with ID ${mangaId} not found`);
    }

    // Escape strings to prevent SQL injection
    const escapeString = (str: string | undefined) => {
      if (!str) return '';
      return str.replace(/'/g, "''");
    };

    // Add relation based on media type using raw SQL (legacy tables)
    switch (dto.mediaType) {
      case MediaRelationType.ANIME:
        // Verify anime exists
        const anime = await this.prisma.akAnime.findUnique({
          where: { idAnime: dto.mediaId },
        });
        if (!anime) {
          throw new NotFoundException(`Anime with ID ${dto.mediaId} not found`);
        }

        // Create relation using ak_fiche_to_fiche
        await this.prisma.$executeRawUnsafe(`
          INSERT INTO ak_fiche_to_fiche (id_fiche_depart, id_anime, id_manga, id_ost, id_jeu, id_business)
          VALUES ('manga_${mangaId}', ${dto.mediaId}, 0, 0, 0, 0)
        `);
        return { success: true, message: 'Anime relation created' };

      case MediaRelationType.MANGA:
        // Verify related manga exists
        const relatedManga = await this.prisma.akManga.findUnique({
          where: { idManga: dto.mediaId },
        });
        if (!relatedManga) {
          throw new NotFoundException(`Manga with ID ${dto.mediaId} not found`);
        }

        // Create relation using ak_fiche_to_fiche
        await this.prisma.$executeRawUnsafe(`
          INSERT INTO ak_fiche_to_fiche (id_fiche_depart, id_anime, id_manga, id_ost, id_jeu, id_business)
          VALUES ('manga_${mangaId}', 0, ${dto.mediaId}, 0, 0, 0)
        `);
        return { success: true, message: 'Manga relation created' };

      case MediaRelationType.GAME:
        // Verify game exists
        const game = await this.prisma.akJeuxVideo.findUnique({
          where: { idJeu: dto.mediaId },
        });
        if (!game) {
          throw new NotFoundException(`Game with ID ${dto.mediaId} not found`);
        }

        // Create game relation using ak_fiche_to_fiche
        await this.prisma.$executeRawUnsafe(`
          INSERT INTO ak_fiche_to_fiche (id_fiche_depart, id_anime, id_manga, id_ost, id_jeu, id_business)
          VALUES ('manga_${mangaId}', 0, 0, 0, ${dto.mediaId}, 0)
        `);
        return { success: true, message: 'Game relation created' };

      case MediaRelationType.BUSINESS:
        // Verify business exists
        const business = await this.prisma.akBusiness.findUnique({
          where: { idBusiness: dto.mediaId },
        });
        if (!business) {
          throw new NotFoundException(`Business with ID ${dto.mediaId} not found`);
        }

        // Create relation using ak_fiche_to_fiche
        await this.prisma.$executeRawUnsafe(`
          INSERT INTO ak_fiche_to_fiche (id_fiche_depart, id_anime, id_manga, id_ost, id_jeu, id_business)
          VALUES ('manga_${mangaId}', 0, 0, 0, 0, ${dto.mediaId})
        `);
        return { success: true, message: 'Business relation created' };

      case MediaRelationType.ARTICLE:
        // Create article relation using ak_webzine_to_fiches
        await this.prisma.$executeRawUnsafe(`
          INSERT INTO ak_webzine_to_fiches (id_article, id_fiche, type_fiche)
          VALUES (${dto.mediaId}, ${mangaId}, 'manga')
        `);
        return { success: true, message: 'Article relation created' };

      default:
        throw new BadRequestException(`Unsupported media type: ${dto.mediaType}`);
    }
  }

  /**
   * Remove a cross-media relation from a manga
   */
  async removeMediaRelation(mangaId: number, mediaType: string, mediaId: number) {
    // Use raw SQL for all relation types using ak_fiche_to_fiche
    switch (mediaType) {
      case 'anime':
        await this.prisma.$executeRawUnsafe(`
          DELETE FROM ak_fiche_to_fiche
          WHERE id_fiche_depart = 'manga_${mangaId}' AND id_anime = ${mediaId}
        `);
        break;

      case 'manga':
        await this.prisma.$executeRawUnsafe(`
          DELETE FROM ak_fiche_to_fiche
          WHERE id_fiche_depart = 'manga_${mangaId}' AND id_manga = ${mediaId}
        `);
        break;

      case 'game':
        await this.prisma.$executeRawUnsafe(`
          DELETE FROM ak_fiche_to_fiche
          WHERE id_fiche_depart = 'manga_${mangaId}' AND id_jeu = ${mediaId}
        `);
        break;

      case 'business':
        await this.prisma.$executeRawUnsafe(`
          DELETE FROM ak_fiche_to_fiche
          WHERE id_fiche_depart = 'manga_${mangaId}' AND id_business = ${mediaId}
        `);
        break;

      case 'article':
        await this.prisma.$executeRawUnsafe(`
          DELETE FROM ak_webzine_to_fiches
          WHERE id_fiche = ${mangaId} AND id_article = ${mediaId} AND type_fiche = 'manga'
        `);
        break;

      default:
        throw new BadRequestException(`Unsupported media type: ${mediaType}`);
    }

    return { success: true, message: 'Relation removed successfully' };
  }

  // ==================== IMAGE MANAGEMENT METHODS ====================

  /**
   * Find mangas without cover images
   */
  async findMangasWithoutImage(page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.akManga.findMany({
        where: {
          OR: [
            { image: null },
            { image: '' },
          ],
          statut: 1, // Only published mangas
        },
        select: {
          idManga: true,
          titre: true,
          titreFr: true,
          titreOrig: true,
          annee: true,
          nbVolumes: true,
          auteur: true,
          statut: true,
        },
        skip,
        take: limit,
        orderBy: { dateAjout: 'desc' },
      }),
      this.prisma.akManga.count({
        where: {
          OR: [{ image: null }, { image: '' }],
          statut: 1,
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Batch update images for multiple mangas from Jikan/MyAnimeList
   */
  async batchUpdateImagesFromJikan(mangaIds?: number[], limit: number = 10) {
    let mangas;

    if (mangaIds && mangaIds.length > 0) {
      mangas = await this.prisma.akManga.findMany({
        where: { idManga: { in: mangaIds } },
        select: { idManga: true, titre: true, titreOrig: true, titreFr: true },
      });
    } else {
      mangas = await this.prisma.akManga.findMany({
        where: {
          OR: [{ image: null }, { image: '' }],
          statut: 1,
        },
        select: { idManga: true, titre: true, titreOrig: true, titreFr: true },
        take: limit,
        orderBy: { dateAjout: 'desc' },
      });
    }

    const results = [];

    for (const manga of mangas) {
      try {
        const result = await this.updateMangaImageFromJikan(manga.idManga);
        results.push({
          mangaId: manga.idManga,
          titre: manga.titre,
          success: true,
          imageUrl: result.imageUrl,
        });
      } catch (error) {
        results.push({
          mangaId: manga.idManga,
          titre: manga.titre,
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return {
      processed: results.length,
      success: successCount,
      failed: failureCount,
      results,
    };
  }

  /**
   * Auto-update manga image (wrapper around updateMangaImageFromJikan)
   */
  async autoUpdateMangaImage(mangaId: number) {
    return this.updateMangaImageFromJikan(mangaId);
  }

  /**
   * Update manga cover image by fetching from Jikan/MyAnimeList API
   */
  async updateMangaImageFromJikan(mangaId: number) {
    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: mangaId },
      select: { titre: true, titreOrig: true, titreFr: true },
    });

    if (!manga) {
      throw new NotFoundException(`Manga ${mangaId} not found`);
    }

    // Search Jikan API - try original title first, then French, then main title
    const searchTitle = manga.titreOrig || manga.titreFr || manga.titre;
    const jikanUrl = `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(searchTitle)}&limit=1`;

    const response = await fetch(jikanUrl);
    if (!response.ok) {
      throw new BadRequestException('Jikan API error');
    }

    const data = await response.json();
    if (!data.data || data.data.length === 0) {
      throw new NotFoundException('No manga found on MyAnimeList');
    }

    const jikanManga = data.data[0];
    const imageUrl = jikanManga.images?.jpg?.large_image_url ||
      jikanManga.images?.jpg?.image_url;

    if (!imageUrl) {
      throw new BadRequestException('No image found in Jikan response');
    }

    // Download and upload to R2
    return this.updateMangaImageFromUrl(mangaId, imageUrl);
  }

  /**
   * Update manga cover image from a direct image URL
   */
  async updateMangaImageFromUrl(mangaId: number, imageUrl: string) {
    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: mangaId },
    });

    if (!manga) {
      throw new NotFoundException(`Manga ${mangaId} not found`);
    }

    // Download image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new BadRequestException('Failed to download image');
    }

    const buffer = Buffer.from(await imageResponse.arrayBuffer());

    // Upload to R2
    const filename = `manga_${mangaId}_${Date.now()}.jpg`;
    const uploadResult = await this.r2Service.uploadImage(
      buffer,
      filename,
      '/images/mangas',
    );

    // Update manga
    await this.prisma.akManga.update({
      where: { idManga: mangaId },
      data: { image: uploadResult.url },
    });

    return {
      success: true,
      mangaId,
      imageUrl: uploadResult.url,
      source: imageUrl,
    };
  }
}
