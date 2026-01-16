import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { BaseContentService } from '../../shared/services/base-content.service';
import { AdminLoggingService } from '../admin/logging/admin-logging.service';
import { CreateAnimeDto } from './dto/create-anime.dto';
import { UpdateAnimeDto } from './dto/update-anime.dto';
import { AnimeQueryDto } from './dto/anime-query.dto';
import { RelatedContentItem, RelationsResponse } from '../shared/types/relations.types';
import { R2Service } from '../media/r2.service';
import { AniListService } from '../anilist/anilist.service';
import { Prisma } from '@prisma/client';
import { hasAdminAccess } from '../../shared/constants/rbac.constants';
import { AnimeRelationsService } from './services/anime-relations.service';
import { AnimeStaffService } from './services/anime-staff.service';
import { AnimeTrailersService } from './services/anime-trailers.service';
import { AnimeRankingsService } from './services/anime-rankings.service';
import { AnimeExternalService } from './services/anime-external.service';
import { AnimeCacheService } from './services/anime-cache.service';

@Injectable()
export class AnimesService extends BaseContentService<
  any,
  CreateAnimeDto,
  UpdateAnimeDto,
  AnimeQueryDto
> {
  constructor(
    prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly r2Service: R2Service,
    private readonly aniListService: AniListService,
    private readonly adminLoggingService: AdminLoggingService,
    private readonly animeRelationsService: AnimeRelationsService,
    private readonly animeStaffService: AnimeStaffService,
    private readonly animeTrailersService: AnimeTrailersService,
    private readonly animeRankingsService: AnimeRankingsService,
    private readonly animeExternalService: AnimeExternalService,
    private readonly animeCacheService: AnimeCacheService,
  ) {
    super(prisma);
  }

  protected get model() {
    return this.prisma.akAnime;
  }

  protected get idField() {
    return 'idAnime';
  }

  protected get tableName() {
    return 'ak_animes';
  }

  protected getAutocompleteSelectFields() {
    return {
      idAnime: true,
      titre: true,
      annee: true,
      image: true,
    };
  }

  protected formatAutocompleteItem(anime: any) {
    return {
      id_anime: anime.idAnime,
      titre: anime.titre,
      annee: anime.annee,
      image: anime.image,
    };
  }

  protected formatItem(anime: any) {
    return this.formatAnime(anime);
  }

  async create(createAnimeDto: CreateAnimeDto, userId: number) {
    let data: any = { ...createAnimeDto };

    // If anilistId is provided, fetch data from AniList and merge it
    if (createAnimeDto.anilistId) {
      try {
        const anilistAnime = await this.aniListService.getAnimeById(createAnimeDto.anilistId);
        if (anilistAnime) {
          const anilistData = await this.aniListService.mapToCreateAnimeDto(anilistAnime);
          // Merge AniList data with provided data, giving priority to provided data
          data = {
            ...anilistData,
            ...data,
            // Always preserve the AniList ID in the comment field
            commentaire: JSON.stringify({
              anilistId: createAnimeDto.anilistId,
              ...(data.commentaire ? JSON.parse(data.commentaire) : {}),
              originalData: anilistAnime,
            }),
          };
        }
      } catch (error) {
        console.warn(`Failed to fetch AniList data for ID ${createAnimeDto.anilistId}:`, error.message);
      }
    }

    // Normalize incoming payload (handle legacy alias and format mapping already in DTO)
    if (!data.titreOrig && data.titreOrign) {
      data.titreOrig = data.titreOrign;
    }
    delete data.titreOrign;
    delete data.anilistId; // Remove anilistId from data before saving

    // Convert dateDiffusion string to Date object if provided
    if (data.dateDiffusion && typeof data.dateDiffusion === 'string') {
      data.dateDiffusion = new Date(data.dateDiffusion);
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

      const duplicateCheck = await this.prisma.akAnime.findFirst({
        where: {
          OR: whereConditions,
        },
        select: {
          idAnime: true,
          titre: true,
          titreOrig: true,
        },
      });

      if (duplicateCheck) {
        throw new BadRequestException(
          `Un anime avec ce titre existe déjà (ID: ${duplicateCheck.idAnime}). ` +
          `Titre: "${duplicateCheck.titre}"${duplicateCheck.titreOrig ? `, Titre original: "${duplicateCheck.titreOrig}"` : ''}`
        );
      }
    }

    const anime = await this.prisma.akAnime.create({
      data: {
        ...data,
        dateAjout: new Date(),
        statut: data.statut ?? 0, // Default to pending approval
      } as any, // Temporary fix for Prisma type issue
      include: {
        reviews: {
          select: {
            idCritique: true,
            titre: true,
            notation: true,
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
        episodes: {
          select: {
            idEpisode: true,
            numero: true,
            titre: true,
          },
          orderBy: { numero: 'asc' },
          take: 5,
        },
      },
    });

    // Invalidate caches after creation
    await this.cacheService.invalidateSearchCache();
    await this.cacheService.invalidateRankings('anime');

    // Invalidate anime existence cache for the created anime's titles
    const titlesToInvalidate: any = {
      romaji: anime.titreOrig || undefined,
      english: anime.titre || undefined,
      native: undefined,
      alternatifs: anime.titresAlternatifs ? anime.titresAlternatifs.split('\n').filter(Boolean) : undefined,
    };

    // If sources contains AniList URL, fetch all title variations from AniList
    if (anime.sources) {
      const anilistMatch = anime.sources.match(/anilist\.co\/anime\/(\d+)/);
      if (anilistMatch) {
        const anilistId = parseInt(anilistMatch[1]);
        try {
          const anilistData = await this.aniListService.getAnimeById(anilistId);
          if (anilistData?.title) {
            // Add all title variations from AniList
            titlesToInvalidate.romaji = anilistData.title.romaji || titlesToInvalidate.romaji;
            titlesToInvalidate.english = anilistData.title.english || titlesToInvalidate.english;
            titlesToInvalidate.native = anilistData.title.native || undefined;
            // Add synonyms as alternatifs
            if (anilistData.synonyms && anilistData.synonyms.length > 0) {
              const existingAlternatifs = titlesToInvalidate.alternatifs || [];
              titlesToInvalidate.alternatifs = [...existingAlternatifs, ...anilistData.synonyms];
            }
          }
        } catch (error) {
          console.warn(`Failed to fetch AniList data for cache invalidation: ${error.message}`);
          // Continue with basic invalidation
        }
      }
    }

    await this.animeExternalService.invalidateAnimeExistsCache(titlesToInvalidate);

    return this.formatAnime(anime);
  }

  async findAll(query: AnimeQueryDto) {
    const {
      page,
      limit,
      search,
      studio,
      annee,
      year,
      statut,
      ficheComplete,
      format,
      genre,
      sortBy,
      sortOrder,
      includeReviews,
      includeEpisodes,
    } = query;

    // Create cache key from query parameters
    const cacheKey = this.createCacheKey(query);

    // Try to get from cache first
    const cached = await this.cacheService.getAnimeList(cacheKey);
    if (cached) {
      return cached;
    }

    const skip = ((page || 1) - 1) * (limit || 20);

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { titre: { contains: search, mode: 'insensitive' } },
        { titreOrig: { contains: search, mode: 'insensitive' } },
        { titreFr: { contains: search, mode: 'insensitive' } },
        { titresAlternatifs: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (studio) {
      where.businessRelations = {
        some: {
          type: {
            in: ["Studio d'animation", "Studio d'animation (sous-traitance)"],
          },
          business: {
            denomination: { contains: studio, mode: 'insensitive' },
          },
        },
      };
    }

    // Accept both annee and year parameters (year is an alias)
    if (annee || year) {
      where.annee = annee || year;
    }

    if (statut !== undefined) {
      where.statut = statut;
    } else {
      // Default to published anime only for public listings
      where.statut = 1;
    }

    if (ficheComplete !== undefined) {
      where.ficheComplete = ficheComplete;
    }

    if (format) {
      where.format = { equals: format, mode: 'insensitive' };
    }

    // Handle genre filtering via tags
    if (genre && genre.length > 0) {
      // URL decode all genre parameters
      const decodedGenres = genre.map(g => decodeURIComponent(g.replace(/\+/g, ' ')));

      // Get anime IDs that have ALL the specified genre tags (AND logic)
      let animeIdsWithGenres: any[];

      // Use a single grouped query to enforce AND semantics for multiple genres
      if (decodedGenres.length > 0) {
        const genresLower = decodedGenres.map(g => g.toLowerCase());
        animeIdsWithGenres = await this.prisma.$queryRaw<Array<{ id_fiche: number }>>`
          SELECT tf.id_fiche
          FROM ak_tags t
          INNER JOIN ak_tag2fiche tf ON t.id_tag = tf.id_tag
          WHERE LOWER(t.tag_name) IN (${Prisma.join(genresLower)})
            AND tf.type = 'anime'
          GROUP BY tf.id_fiche
          HAVING COUNT(DISTINCT LOWER(t.tag_name)) = ${genresLower.length}
        `;
      } else {
        animeIdsWithGenres = [];
      }

      const animeIdsArray = (animeIdsWithGenres as any[]) || [];
      const animeIds = animeIdsArray.map(row => row.id_fiche).filter(id => id !== undefined);

      if (animeIds.length > 0) {
        where.idAnime = { in: animeIds };
      } else {
        // If no animes found with these genres, return empty result
        where.idAnime = { in: [] };
      }
    }

    // Exclude null dateAjout when sorting by it
    if (sortBy === 'dateAjout' || !sortBy) {
      where.NOT = where.NOT || [];
      where.NOT.push({ dateAjout: null });
    }

    // Exclude null annee when sorting by it
    if (sortBy === 'annee') {
      where.NOT = where.NOT || [];
      where.NOT.push({ annee: null });
    }

    // Exclude unranked anime (classement = 0 or null) when sorting by popularity
    if (sortBy === 'classementPopularite') {
      where.classementPopularite = { gt: 0 };
    }

    // Build order by clause with secondary sort by idAnime for stable pagination
    const orderBy: any = [
      { [sortBy || 'dateAjout']: sortOrder || 'desc' },
      { idAnime: 'asc' as const } // Secondary sort for stable pagination when primary values are equal
    ];

    // Build include clause
    const include: any = {};
    if (includeReviews) {
      include.reviews = {
        where: { statut: 0 }, // Only include published/visible reviews
        select: {
          idCritique: true,
          titre: true,
          notation: true,
          dateCritique: true,
          membre: {
            select: {
              idMember: true,
              memberName: true,
            },
          },
        },
        take: 5,
        orderBy: { dateCritique: 'desc' },
      };
    }

    if (includeEpisodes) {
      include.episodes = {
        select: {
          idEpisode: true,
          numero: true,
          titre: true,
        },
        orderBy: { numero: 'asc' },
        take: 10,
      };
    }

    const [animes, total] = await Promise.all([
      this.prisma.executeWithRetry(() =>
        this.prisma.akAnime.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          include,
        })
      ),
      this.prisma.executeWithRetry(() =>
        this.prisma.akAnime.count({ where })
      ),
    ]);

    // For popularity rankings, fetch users in collection count
    let formattedAnimes = animes.map(this.formatAnime);
    if (sortBy === 'classementPopularite' && animes.length > 0) {
      const animeIds = animes.map(a => a.idAnime);
      const collectionCounts = await this.prisma.$queryRaw<Array<{ id_anime: number; count: bigint }>>`
        SELECT id_anime, COUNT(DISTINCT id_membre) as count
        FROM collection_animes
        WHERE id_anime IN (${Prisma.join(animeIds)})
        GROUP BY id_anime
      `;

      const countsMap = new Map(
        collectionCounts.map(c => [Number(c.id_anime), Number(c.count)])
      );

      formattedAnimes = formattedAnimes.map(anime => ({
        ...anime,
        usersInCollection: countsMap.get(anime.id) || 0,
      }));
    }

    const result = {
      animes: formattedAnimes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / (limit || 20)),
      },
    };

    // Cache the result (TTL based on query complexity)
    const ttl = search || genre ? 180 : 1200; // 3 mins for search, 20 mins for general lists
    await this.cacheService.setAnimeList(cacheKey, result, ttl);

    return result;
  }

  async findOne(id: number, includeReviews = false, includeEpisodes = false, includeTrailers = false, user?: any) {
    // Try to get from cache first (v3 includes collection score)
    const cacheKey = `${id}_${includeReviews}_${includeEpisodes}_${includeTrailers}_v3`;
    const cached = await this.cacheService.getAnime(parseInt(cacheKey.replace(/[^0-9]/g, '')));
    if (cached && cached.includeReviews === includeReviews && cached.includeEpisodes === includeEpisodes && cached.includeTrailers === includeTrailers) {
      return cached.data;
    }

    const include: any = {
      // Always include business relations to get studio ID and name
      businessRelations: {
        select: {
          idBusiness: true,
          type: true,
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

    if (includeEpisodes) {
      include.episodes = {
        orderBy: { numero: 'asc' },
      };
    }

    if (includeTrailers) {
      include.trailers = {
        where: { statut: 1 }, // Only include visible trailers
        orderBy: { ordre: 'asc' },
      };
    }

    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: id },
      include,
    });

    if (!anime) {
      throw new NotFoundException('Anime introuvable');
    }

    // Only allow access to published anime (statut=1) for public endpoints
    // Allow admins to view unpublished content
    const isAdmin = user && (hasAdminAccess(user.groupId) || user.isAdmin);
    if (anime.statut !== 1 && !isAdmin) {
      throw new NotFoundException('Anime introuvable');
    }

    // Get season information
    const season = await this.getAnimeSeason(id);

    // Get tags
    const tagsResponse = await this.getTags(id, 'anime');
    const tags = (tagsResponse?.tags as any[]) || [];

    // Get articles count
    const articlesCount = await this.prisma.akWebzineToFiches.count({
      where: {
        idFiche: id,
        type: 'anime',
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
      FROM collection_animes
      WHERE id_anime = ${id}
        AND evaluation > 0.0
    `;

    const collectionScore = collectionStats[0]?.avg ? Number(collectionStats[0].avg) : null;
    const collectionEvaluationsCount = collectionStats[0]?.count ? Number(collectionStats[0].count) : 0;

    // Get users in collection count
    const usersInCollectionResult = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT id_membre) as count
      FROM collection_animes
      WHERE id_anime = ${id}
    `;
    const usersInCollection = Number(usersInCollectionResult[0]?.count || 0);

    // Use pre-calculated popularity rank from database (updated by cron job)
    // This avoids expensive real-time calculations on every page load
    const popularityRank = anime.classementPopularite || 0;

    const formattedAnime = {
      ...this.formatAnime(anime, season, tags),
      articlesCount,
      collectionScore,
      collectionEvaluationsCount,
      usersInCollection,
      popularityRank,
    };

    // Cache the result
    const cacheData = {
      data: formattedAnime,
      includeReviews,
      includeEpisodes,
      includeTrailers,
    };
    await this.cacheService.setAnime(id, cacheData, 600); // 10 minutes

    return formattedAnime;
  }

  async findByIds(ids: number[]) {
    if (!ids || ids.length === 0) {
      return [];
    }

    // Fetch all animes in a single query
    const animes = await this.prisma.akAnime.findMany({
      where: {
        idAnime: { in: ids },
        statut: 1, // Only return published animes
      },
    });

    // Create a map for quick lookup
    const animeMap = new Map(animes.map(anime => [anime.idAnime, anime]));

    // Return animes in the same order as the input IDs
    return ids
      .map(id => animeMap.get(id))
      .filter(Boolean)
      .map(anime => this.formatAnime(anime));
  }

  async update(
    id: number,
    updateAnimeDto: UpdateAnimeDto,
    userId: number,
    isAdmin = false,
  ) {
    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: id },
    });

    if (!anime) {
      throw new NotFoundException('Anime introuvable');
    }

    // Only admin can update published animes or change status
    if (anime.statut === 1 && !isAdmin) {
      throw new ForbiddenException(
        'Seul un administrateur peut modifier un anime validé',
      );
    }

    let updateData: any = { ...updateAnimeDto };

    // If anilistId is provided, fetch data from AniList and merge it
    if (updateAnimeDto.anilistId) {
      try {
        const anilistAnime = await this.aniListService.getAnimeById(updateAnimeDto.anilistId);
        if (anilistAnime) {
          const anilistData = await this.aniListService.mapToCreateAnimeDto(anilistAnime);

          // Preserve existing titre if not empty and not being explicitly updated
          const preserveTitre = anime.titre && !updateData.titre;

          // Merge AniList data with provided data, giving priority to provided data
          updateData = {
            ...anilistData,
            ...updateData,
            // Preserve existing titre if needed
            ...(preserveTitre && { titre: anime.titre }),
            // Always preserve the AniList ID in the comment field
            commentaire: JSON.stringify({
              anilistId: updateAnimeDto.anilistId,
              ...(updateData.commentaire ? JSON.parse(updateData.commentaire) : {}),
              originalData: anilistAnime,
            }),
          };
        }
      } catch (error) {
        console.warn(`Failed to fetch AniList data for ID ${updateAnimeDto.anilistId}:`, error.message);
      }
    }

    // If replacing or deleting image and previous image is an R2 URL, attempt deletion in IK
    try {
      const isImageBeingRemoved = updateData.image === null || updateData.image === '';
      const isImageBeingReplaced = typeof updateData.image === 'string' && updateData.image && updateData.image !== anime.image;

      if (
        (isImageBeingRemoved || isImageBeingReplaced) &&
        typeof anime.image === 'string' &&
        anime.image &&
        /imagekit\.io/.test(anime.image)
      ) {
        await this.r2Service.deleteImageByUrl(anime.image);
        // Log removed
      }
    } catch (e) {
      // Non-blocking: log and continue update
      console.warn('Failed to delete previous R2 image:', (e as Error).message);
    }

    // Normalize incoming payload for update (handle legacy alias)
    if (!updateData.titreOrig && updateData.titreOrign) {
      updateData.titreOrig = updateData.titreOrign;
    }
    delete updateData.titreOrign;
    delete updateData.anilistId; // Remove anilistId from data before saving

    // Convert dateDiffusion string to Date object if provided
    if (updateData.dateDiffusion && typeof updateData.dateDiffusion === 'string') {
      updateData.dateDiffusion = new Date(updateData.dateDiffusion);
    }

    const updatedAnime = await this.prisma.akAnime.update({
      where: { idAnime: id },
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
    await this.invalidateAnimeCache(id);

    return this.formatAnime(updatedAnime);
  }

  async remove(id: number, userId: number, isAdmin = false) {
    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: id },
    });

    if (!anime) {
      throw new NotFoundException('Anime introuvable');
    }

    // Only admin can delete animes
    if (!isAdmin) {
      throw new ForbiddenException(
        'Seul un administrateur peut supprimer un anime',
      );
    }

    // Delete associated activity logs first
    await this.prisma.$executeRaw`
      DELETE FROM ak_logs_admin WHERE anime = ${id}
    `;

    await this.prisma.akAnime.delete({
      where: { idAnime: id },
    });

    // Invalidate caches after removal
    await this.invalidateAnimeCache(id);

    return { message: 'Anime supprimé avec succès' };
  }

  async getTopAnimes(limit = 10, type = 'reviews-bayes') {
    return this.animeRankingsService.getTopAnimes(limit, type);
  }

  async getFlopAnimes(limit = 20, type = 'reviews-bayes') {
    return this.animeRankingsService.getFlopAnimes(limit, type);
  }

  async getRandomAnime() {
    const randomResult = await this.animeRankingsService.getRandomAnime();
    return this.findOne(randomResult.id);
  }

  // Use inherited getGenres() method

  async getItemsByGenre(genre: string, limit = 20, statusFilter = 1) {
    // URL decode the genre parameter
    const decodedGenre = decodeURIComponent(genre.replace(/\+/g, ' '));

    // Get anime IDs that have the specified genre tag
    const animeIdsWithGenre = await this.prisma.$queryRaw`
      SELECT DISTINCT tf.id_fiche
      FROM ak_tags t
      INNER JOIN ak_tag2fiche tf ON t.id_tag = tf.id_tag
      WHERE LOWER(t.tag_name) = LOWER(${decodedGenre})
        AND tf.type = 'anime'
    `;

    const animeIds = (animeIdsWithGenre as any[]).map(row => row.id_fiche);

    if (animeIds.length === 0) {
      return {
        genre: decodedGenre,
        ak_animes: [],
        count: 0,
      };
    }

    const animes = await this.prisma.akAnime.findMany({
      where: {
        idAnime: { in: animeIds },
        statut: statusFilter,
      },
      take: limit,
      orderBy: { moyenneNotes: 'desc' },
    });

    return {
      genre: decodedGenre,
      ak_animes: animes.map(this.formatAnime.bind(this)),
      count: animes.length,
    };
  }

  async getAnimesByGenre(genre: string, limit = 20) {
    const result = await this.getItemsByGenre(genre, limit);
    return {
      genre: result.genre,
      animes: result.ak_animes,
      count: result.count,
    };
  }

  async getMostPopularAnimeTags(limit = 20) {
    const cacheKey = `popular_anime_tags:${limit}`;

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
      INNER JOIN ak_animes a ON tf.id_fiche = a.id_anime
      WHERE tf.type = 'anime' AND a.statut = 1
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

  async searchAniList(query: string, limit = 10) {
    return this.animeExternalService.searchAniList(query, limit);
  }

  async importSeasonalAnimeFromAniList(season: string, year: number, limit = 50) {
    return this.animeExternalService.importSeasonalAnimeFromAniList(season, year, limit);
  }

  async getAnimeTags(id: number) {
    return this.getTags(id, 'anime');
  }

  async getAnimeSeason(id: number): Promise<{ season: string; year: number; id: number } | null> {
    return this.animeRelationsService.getAnimeSeason(id);
  }

  // Use inherited autocomplete() method

  async getAnimeRelations(id: number): Promise<RelationsResponse> {
    return this.animeRelationsService.getAnimeRelations(id);
  }

  async getAnimeArticles(id: number) {
    return this.animeRelationsService.getAnimeArticles(id);
  }

  async getAnimeStaff(id: number) {
    return this.animeStaffService.getAnimeStaff(id);
  }

  async getSimilarAnimes(id: number, limit: number = 6) {
    return this.animeRelationsService.getSimilarAnimes(id, limit);
  }

  private formatAnime(anime: any, season?: any, tags?: any[]) {
    const { idAnime, dateAjout, image, lienForum, businessRelations, studio: dbStudio, dateDiffusion, ...otherFields } = anime;

    // Find studio ID and name from business relations
    let idStudio = null;
    let studioName = null;

    if (businessRelations && Array.isArray(businessRelations)) {
      const studioRelation = businessRelations.find((rel: any) =>
        rel.type === "Studio d'animation" || rel.type === "Studio d'animation (sous-traitance)"
      );
      if (studioRelation) {
        idStudio = studioRelation.idBusiness;
        studioName = studioRelation.business?.denomination || null;
      }
    }

    // Use dbStudio as fallback only if we didn't find a business relation
    if (!studioName && dbStudio) {
      studioName = dbStudio;
    }

    // Format dateDiffusion as YYYY-MM-DD string for frontend
    let formattedDateDiffusion: string | null = null;
    if (dateDiffusion) {
      const date = dateDiffusion instanceof Date ? dateDiffusion : new Date(dateDiffusion);
      if (!isNaN(date.getTime())) {
        formattedDateDiffusion = date.toISOString().split('T')[0];
      }
    }

    return {
      id: idAnime,
      addedDate: dateAjout?.toISOString(),
      image: image ? (typeof image === 'string' && /^https?:\/\//.test(image) ? image : `/api/media/serve/anime/${image}`) : null,
      lienforum: lienForum || null,
      idStudio,
      studio: studioName,
      autresTitres: otherFields.titresAlternatifs || null,
      season: season || null,
      tags: tags || [],
      dateDiffusion: formattedDateDiffusion,
      ...otherFields,
    };
  }

  // Cache helper methods
  private createCacheKey(query: AnimeQueryDto): string {
    return this.animeCacheService.createCacheKey(query);
  }

  // Cache invalidation methods
  async invalidateAnimeCache(id: number): Promise<void> {
    return this.animeCacheService.invalidateAnimeCache(id);
  }

  // ===== Trailer Management =====

  async createTrailer(createTrailerDto: any, username?: string) {
    return this.animeTrailersService.createTrailer(createTrailerDto, username);
  }

  async updateTrailer(trailerId: number, updateTrailerDto: any, username?: string) {
    return this.animeTrailersService.updateTrailer(trailerId, updateTrailerDto, username);
  }

  async removeTrailer(trailerId: number, username?: string) {
    return this.animeTrailersService.removeTrailer(trailerId, username);
  }

  // ===== Business Relationships Management =====

  async getAnimeBusinesses(animeId: number) {
    return this.animeStaffService.getAnimeBusinesses(animeId);
  }

  async addAnimeBusiness(
    animeId: number,
    businessId: number,
    type: string,
    precisions?: string,
  ) {
    return this.animeStaffService.addAnimeBusiness(animeId, businessId, type, precisions);
  }

  async removeAnimeBusiness(animeId: number, businessId: number) {
    return this.animeStaffService.removeAnimeBusiness(animeId, businessId);
  }

  private hashQuery(query: string): string {
    return this.animeCacheService.hashQuery(query);
  }

}
