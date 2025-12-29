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
import { ImageKitService } from '../media/imagekit.service';
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
    private readonly imageKitService: ImageKitService,
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
          const anilistData = this.aniListService.mapToCreateAnimeDto(anilistAnime);
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
      where.dateAjout = { not: null };
    }

    // Exclude null annee when sorting by it
    if (sortBy === 'annee') {
      where.annee = { not: null };
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

    const result = {
      animes: animes.map(this.formatAnime),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / (limit || 20)),
      },
    };

    // Cache the result (TTL based on query complexity)
    const ttl = search || genre ? 180 : 300; // 3 mins for search, 5 mins for general lists
    await this.cacheService.setAnimeList(cacheKey, result, ttl);

    return result;
  }

  async findOne(id: number, includeReviews = false, includeEpisodes = false, includeTrailers = false, user?: any) {
    // Try to get from cache first (v2 includes season data fix)
    const cacheKey = `${id}_${includeReviews}_${includeEpisodes}_${includeTrailers}_v2`;
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

    const formattedAnime = {
      ...this.formatAnime(anime, season, tags),
      articlesCount,
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
          const anilistData = this.aniListService.mapToCreateAnimeDto(anilistAnime);
          // Merge AniList data with provided data, giving priority to provided data
          updateData = {
            ...anilistData,
            ...updateData,
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

    // If replacing or deleting image and previous image is an ImageKit URL, attempt deletion in IK
    try {
      const isImageBeingRemoved = updateData.image === null || updateData.image === '';
      const isImageBeingReplaced = typeof updateData.image === 'string' && updateData.image && updateData.image !== anime.image;

      if (
        (isImageBeingRemoved || isImageBeingReplaced) &&
        typeof anime.image === 'string' &&
        anime.image &&
        /imagekit\.io/.test(anime.image)
      ) {
        await this.imageKitService.deleteImageByUrl(anime.image);
        console.log(`Deleted ImageKit image: ${anime.image}`);
      }
    } catch (e) {
      // Non-blocking: log and continue update
      console.warn('Failed to delete previous ImageKit image:', (e as Error).message);
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
    try {
      // Query to find the season where this anime ID is in the json_data
      // Updated to correctly parse JSON object with 'animes' array
      const seasons = await this.prisma.$queryRaw<Array<{
        id_saison: number;
        saison: number;
        annee: number;
        json_data: string;
      }>>`
        SELECT id_saison, saison, annee, json_data
        FROM ak_animes_saisons
        WHERE (
          json_data LIKE ${'%[' + id + ',%'} OR
          json_data LIKE ${'%,' + id + ',%'} OR
          json_data LIKE ${'%,' + id + ']%'} OR
          json_data LIKE ${'%[' + id + ']%'} OR
          json_data LIKE ${'%["' + id + '",%'} OR
          json_data LIKE ${'%,"' + id + '",%'} OR
          json_data LIKE ${'%,"' + id + '"]%'} OR
          json_data LIKE ${'%["' + id + '"]%'}
        )
        AND statut = 1
        ORDER BY annee DESC, saison DESC
        LIMIT 1
      `;

      if (seasons && seasons.length > 0) {
        const seasonData = seasons[0];
        // Verify the anime ID is actually in the JSON array
        try {
          const parsedData = JSON.parse(seasonData.json_data);
          const animeIds = parsedData.animes || parsedData;
          if (Array.isArray(animeIds) && (animeIds.includes(id) || animeIds.includes(String(id)))) {
            const seasonNames = {
              1: 'Hiver',
              2: 'Printemps',
              3: 'Été',
              4: 'Automne',
            };
            return {
              season: seasonNames[seasonData.saison] || 'Inconnu',
              year: seasonData.annee,
              id: seasonData.id_saison,
            };
          }
        } catch (e) {
          console.error('Error parsing season json_data:', e);
        }
      }
      return null;
    } catch (error) {
      console.error('Error fetching anime season:', error);
      return null;
    }
  }

  // Use inherited autocomplete() method

  async getAnimeRelations(id: number): Promise<RelationsResponse> {
    // Try to get from cache first (15 minutes TTL)
    const cacheKey = `anime_relations:${id}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached as RelationsResponse;
    }

    try {
      console.log(`Starting getAnimeRelations for anime ID: ${id}`);

      // First check if anime exists
      const anime = await this.prisma.akAnime.findUnique({
        where: { idAnime: id, statut: 1 },
        select: { idAnime: true },
      });

      if (!anime) {
        throw new NotFoundException('Anime introuvable');
      }
      console.log(`Anime ${id} exists and is validated`);

      // Get BIDIRECTIONAL relations: where anime is source OR target
      // This matches the old PHP logic: WHERE id_fiche_depart = 'anime{id}' OR id_anime = {id}
      console.log(`Querying relations for: anime${id}`);
      const relations = await this.prisma.$queryRaw`
        SELECT id_relation, id_fiche_depart, id_anime, id_manga
        FROM ak_fiche_to_fiche
        WHERE id_fiche_depart = ${`anime${id}`} OR id_anime = ${id}
      ` as any[];

      console.log(`Found ${relations.length} relations:`, relations);

      const relatedContent: RelatedContentItem[] = [];

      // Process each relation to get the actual content
      for (const relation of relations) {
        // Case 1: This anime is the SOURCE (id_fiche_depart = 'anime{id}')
        if (relation.id_fiche_depart === `anime${id}`) {
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
        // Case 2: This anime is the TARGET (id_anime = {id}) - REVERSE relation
        // Need to fetch the SOURCE fiche from id_fiche_depart
        else if (relation.id_fiche_depart !== `anime${id}`) {
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
          type: 'anime',
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

      const result = {
        anime_id: id,
        relations: relatedContent,
        total: relatedContent.length,
      };

      // Cache for 15 minutes (900 seconds)
      await this.cacheService.set(cacheKey, result, 900);

      return result;
    } catch (error) {
      console.error('Error in getAnimeRelations:', error);
      throw error;
    }
  }

  async getAnimeArticles(id: number) {
    // Try to get from cache first (10 minutes TTL)
    const cacheKey = `anime_articles:${id}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    // First check if anime exists
    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: id, statut: 1 },
      select: { idAnime: true },
    });

    if (!anime) {
      throw new NotFoundException('Anime introuvable');
    }

    // Get articles linked to this anime
    const articles = await this.prisma.akWebzineToFiches.findMany({
      where: {
        idFiche: id,
        type: 'anime',
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
    const result = articles
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

    // Cache for 10 minutes (600 seconds)
    await this.cacheService.set(cacheKey, result, 600);

    return result;
  }

  async getAnimeStaff(id: number) {
    return this.animeStaffService.getAnimeStaff(id);
  }

  async getSimilarAnimes(id: number, limit: number = 6) {
    // Try to get from cache first (30 minutes TTL)
    const cacheKey = `similar_animes:${id}:${limit}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    // First check if anime exists
    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: id, statut: 1 },
      select: {
        idAnime: true,
        titre: true,
        titreOrig: true,
        studio: true,
        format: true,
        annee: true,
      },
    });

    if (!anime) {
      throw new NotFoundException('Anime introuvable');
    }

  // Optimized query using UNION strategy for better performance
  // Prioritize shared content (tags, similar titles), then format/year, then studio
  const similarAnimes = await this.prisma.$queryRaw`
        WITH results AS (
            -- Priority 1: Shared tags (highest relevance - same themes/genres)
            (SELECT
                 a.id_anime as "idAnime",
                 a.titre,
                 a.titre_orig as "titreOrig",
                 a.studio,
                 a.format,
                 a.annee,
                 a.image,
                 a.nb_ep as "nbEp",
                 a.moyennenotes as "moyenneNotes",
                 a.statut,
                 a.nice_url as "niceUrl",
                 5 as similarity_score
             FROM ak_animes a
                      INNER JOIN ak_tag2fiche tf ON tf.id_fiche = a.id_anime AND tf.type = 'anime'
             WHERE tf.id_tag IN (
                 SELECT tf2.id_tag
                 FROM ak_tag2fiche tf2
                 WHERE tf2.id_fiche = ${id} AND tf2.type = 'anime'
                 LIMIT 10
            )
            AND a.id_anime != ${id}
            AND a.statut = 1
        ORDER BY a.moyennenotes DESC NULLS LAST
            LIMIT ${limit * 2})

        UNION ALL

        -- Priority 2: Similar titles (but not too similar to avoid same series)
        (SELECT
            a.id_anime as "idAnime",
            a.titre,
            a.titre_orig as "titreOrig",
            a.studio,
            a.format,
            a.annee,
            a.image,
            a.nb_ep as "nbEp",
            a.moyennenotes as "moyenneNotes",
            a.statut,
            a.nice_url as "niceUrl",
            4 as similarity_score
        FROM ak_animes a
        WHERE a.id_anime != ${id}
          AND a.statut = 1
          AND (
            (similarity(a.titre, ${anime.titre}) BETWEEN 0.6 AND 0.9)
           OR
            (a.titre_orig IS NOT NULL
          AND ${anime.titreOrig || ''} != ''
          AND similarity(a.titre_orig, ${anime.titreOrig || ''}) BETWEEN 0.6 AND 0.9)
            )
        ORDER BY
            GREATEST(
            similarity(a.titre, ${anime.titre}),
            COALESCE(similarity(a.titre_orig, ${anime.titreOrig || ''}), 0)
            ) DESC,
            a.moyennenotes DESC NULLS LAST
            LIMIT ${limit * 2})

        UNION ALL

        -- Priority 3: Same format and similar year
        (SELECT
            a.id_anime as "idAnime",
            a.titre,
            a.titre_orig as "titreOrig",
            a.studio,
            a.format,
            a.annee,
            a.image,
            a.nb_ep as "nbEp",
            a.moyennenotes as "moyenneNotes",
            a.statut,
            a.nice_url as "niceUrl",
            3 as similarity_score
        FROM ak_animes a
        WHERE a.format = ${anime.format}
          AND ABS(a.annee - ${anime.annee || 0}) <= 2
          AND a.id_anime != ${id}
          AND a.statut = 1
        ORDER BY a.moyennenotes DESC NULLS LAST
            LIMIT ${limit * 2})

        UNION ALL

        -- Priority 4: Same studio (lowest priority - just production company)
        (SELECT
            a.id_anime as "idAnime",
            a.titre,
            a.titre_orig as "titreOrig",
            a.studio,
            a.format,
            a.annee,
            a.image,
            a.nb_ep as "nbEp",
            a.moyennenotes as "moyenneNotes",
            a.statut,
            a.nice_url as "niceUrl",
            2 as similarity_score
        FROM ak_animes a
        WHERE a.studio = ${anime.studio}
          AND a.id_anime != ${id}
          AND a.statut = 1
          AND a.studio IS NOT NULL
        ORDER BY a.moyennenotes DESC NULLS LAST
            LIMIT ${limit * 2})
            )
        SELECT DISTINCT ON ("idAnime")
            "idAnime",
            titre,
            "titreOrig",
            studio,
            format,
            annee,
            image,
            "nbEp",
            "moyenneNotes",
            statut,
            "niceUrl",
            MAX(similarity_score) as similarity_score
        FROM results
        GROUP BY "idAnime", titre, "titreOrig", studio, format, annee, image, "nbEp", "moyenneNotes", statut, "niceUrl"
        ORDER BY "idAnime", similarity_score DESC, "moyenneNotes" DESC NULLS LAST
            LIMIT ${limit}
    ` as any[];

    const result = {
      anime_id: id,
      similar: similarAnimes.map((a: any) => ({
        id: a.idAnime,
        titre: a.titre,
        titreOrig: a.titreOrig,
        studio: a.studio,
        format: a.format,
        annee: a.annee,
        image: a.image,
        nbEp: a.nbEp,
        moyenneNotes: a.moyenneNotes,
        statut: a.statut,
        niceUrl: a.niceUrl,
        similarityScore: Number(a.similarity_score),
      })),
    };

    // Cache for 30 minutes (1800 seconds)
    await this.cacheService.set(cacheKey, result, 1800);

    return result;
  }

  private formatAnime(anime: any, season?: any, tags?: any[]) {
    const { idAnime, dateAjout, image, lienForum, businessRelations, studio: dbStudio, dateDiffusion, ...otherFields } = anime;

    // Find studio ID and name from business relations
    let idStudio = null;
    let studioName = dbStudio || null; // Use existing studio field as fallback
    if (businessRelations && Array.isArray(businessRelations)) {
      const studioRelation = businessRelations.find((rel: any) =>
        rel.type === "Studio d'animation" || rel.type === "Studio d'animation (sous-traitance)"
      );
      if (studioRelation) {
        idStudio = studioRelation.idBusiness;
        // If studio field is empty but we have business relation, use business name
        if (studioRelation.business?.denomination && !studioName) {
          studioName = studioRelation.business.denomination;
        }
      }
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
    await this.cacheService.invalidateAnime(id);
    // Also invalidate related caches
    await this.cacheService.invalidateSearchCache();
    // Invalidate rankings as anime updates may affect top/flop lists
    await this.cacheService.invalidateRankings('anime');

    // Invalidate specific endpoint caches for this anime
    await Promise.all([
      this.cacheService.del(`anime_staff:${id}`),
      this.cacheService.del(`anime_relations:${id}`),
      this.cacheService.del(`anime_articles:${id}`),
      this.cacheService.del(`similar_animes:${id}:6`), // Default limit is 6
    ]);

    // Invalidate cache of all related animes (when image changes, related pages must refresh)
    try {
      // Get relations where this anime is source or target
      const relations = await this.prisma.$queryRaw<Array<{ id_fiche_depart: string; id_anime: number; id_manga: number }>>`
        SELECT id_fiche_depart, id_anime, id_manga
        FROM ak_fiche_to_fiche
        WHERE id_fiche_depart = ${`anime${id}`} OR id_anime = ${id}
      `;

      // Collect all related anime IDs
      const relatedAnimeIds = new Set<number>();

      for (const relation of relations) {
        // Case 1: This anime is source - check if target is an anime
        if (relation.id_fiche_depart === `anime${id}` && relation.id_anime && relation.id_anime > 0) {
          relatedAnimeIds.add(relation.id_anime);
        }
        // Case 2: This anime is target - check if source is an anime
        else if (relation.id_anime === id) {
          const ficheMatch = relation.id_fiche_depart?.match(/^anime(\d+)$/);
          if (ficheMatch) {
            relatedAnimeIds.add(parseInt(ficheMatch[1]));
          }
        }
      }

      // Invalidate cache for each related anime
      if (relatedAnimeIds.size > 0) {
        await Promise.all(
          Array.from(relatedAnimeIds).map(relatedId => this.cacheService.invalidateAnime(relatedId))
        );
        console.log(`Invalidated cache for ${relatedAnimeIds.size} related animes of anime ${id}`);
      }
    } catch (error) {
      console.error(`Failed to invalidate related animes cache for anime ${id}:`, error);
    }
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
    // Check if anime exists
    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: animeId },
    });

    if (!anime) {
      throw new NotFoundException('Anime introuvable');
    }

    // Get all business relationships for this anime
    const relationships = await this.prisma.$queryRaw<Array<{
      id_relation: number;
      id_business: number;
      type: string;
      precisions: string | null;
      denomination: string;
      origine: string | null;
    }>>`
      SELECT
        bta.id_relation,
        bta.id_business,
        bta.type,
        bta.precisions,
        b.denomination,
        b.origine
      FROM ak_business_to_animes bta
      INNER JOIN ak_business b ON b.id_business = bta.id_business
      WHERE bta.id_anime = ${animeId}
        AND bta.doublon = 0
      ORDER BY bta.type, b.denomination
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

  async addAnimeBusiness(
    animeId: number,
    businessId: number,
    type: string,
    precisions?: string,
  ) {
    // Check if anime exists
    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: animeId },
    });

    if (!anime) {
      throw new NotFoundException('Anime introuvable');
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
      FROM ak_business_to_animes
      WHERE id_anime = ${animeId}
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
      INSERT INTO ak_business_to_animes (id_anime, id_business, type, precisions, doublon)
      VALUES (${animeId}, ${businessId}, ${type}, ${precisions || null}, 0)
      RETURNING id_relation
    `;

    // Invalidate anime cache
    await this.cacheService.invalidateAnime(animeId);

    return {
      relationId: result[0].id_relation,
      animeId,
      businessId,
      type,
      precisions,
      denomination: business.denomination,
    };
  }

  async removeAnimeBusiness(animeId: number, businessId: number) {
    // Find the relationship
    const relationship = await this.prisma.$queryRaw<Array<{ id_relation: number }>>`
      SELECT id_relation
      FROM ak_business_to_animes
      WHERE id_anime = ${animeId}
        AND id_business = ${businessId}
        AND doublon = 0
      LIMIT 1
    `;

    if (!relationship || relationship.length === 0) {
      throw new NotFoundException('Relation business introuvable');
    }

    // Delete the relationship
    await this.prisma.$queryRaw`
      DELETE FROM ak_business_to_animes
      WHERE id_relation = ${relationship[0].id_relation}
    `;

    // Invalidate anime cache
    await this.cacheService.invalidateAnime(animeId);

    return { message: 'Relation business supprimée avec succès' };
  }

  // Utility method to create consistent cache keys
  private hashQuery(query: string): string {
    // Simple hash function for query strings
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

}
