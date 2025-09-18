import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { BaseContentService } from '../../shared/services/base-content.service';
import { CreateAnimeDto } from './dto/create-anime.dto';
import { UpdateAnimeDto } from './dto/update-anime.dto';
import { AnimeQueryDto } from './dto/anime-query.dto';
import { RelatedContentItem, RelationsResponse } from '../shared/types/relations.types';
import { ImageKitService } from '../media/imagekit.service';
import { AniListService } from '../anilist/anilist.service';
import { Prisma } from '@prisma/client';

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

    return this.formatAnime(anime);
  }

  async findAll(query: AnimeQueryDto) {
    const {
      page,
      limit,
      search,
      studio,
      annee,
      statut,
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
        { synopsis: { contains: search, mode: 'insensitive' } },
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

    if (annee) {
      where.annee = annee;
    }

    if (statut !== undefined) {
      where.statut = statut;
    }

    // Handle genre filtering via tags
    if (genre) {
      // Get anime IDs that have the specified genre tag
      const animeIdsWithGenre = await this.prisma.$queryRaw`
        SELECT DISTINCT tf.id_fiche as anime_id
        FROM ak_tags t
        INNER JOIN ak_tag2fiche tf ON t.id_tag = tf.id_tag
        WHERE LOWER(t.tag_name) = LOWER(${genre})
          AND tf.type = 'anime'
          AND t.categorie = 'Genre'
      `;
      
      const animeIds = (animeIdsWithGenre as any[]).map(row => row.anime_id);
      
      if (animeIds.length > 0) {
        where.idAnime = { in: animeIds };
      } else {
        // If no animes found with this genre, return empty result
        where.idAnime = { in: [] };
      }
    }

    // Build order by clause
    const orderBy = { [sortBy || 'dateAjout']: sortOrder || 'desc' };

    // Build include clause
    const include: any = {};
    if (includeReviews) {
      include.reviews = {
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

  async findOne(id: number, includeReviews = false, includeEpisodes = false) {
    // Try to get from cache first
    const cacheKey = `${id}_${includeReviews}_${includeEpisodes}`;
    const cached = await this.cacheService.getAnime(parseInt(cacheKey.replace(/[^0-9]/g, '')));
    if (cached && cached.includeReviews === includeReviews && cached.includeEpisodes === includeEpisodes) {
      return cached.data;
    }

    const include: any = {};

    if (includeReviews) {
      include.reviews = {
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

    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: id },
      include,
    });

    if (!anime) {
      throw new NotFoundException('Anime introuvable');
    }

    const formattedAnime = this.formatAnime(anime);
    
    // Cache the result
    const cacheData = {
      data: formattedAnime,
      includeReviews,
      includeEpisodes,
    };
    await this.cacheService.setAnime(id, cacheData, 600); // 10 minutes

    return formattedAnime;
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

    // If replacing image and previous image is an ImageKit URL, attempt deletion in IK
    try {
      if (
        typeof updateData.image === 'string' &&
        updateData.image &&
        updateData.image !== anime.image &&
        typeof anime.image === 'string' &&
        anime.image &&
        /imagekit\.io/.test(anime.image)
      ) {
        await this.imageKitService.deleteImageByUrl(anime.image);
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

  async getTopAnimes(limit = 10) {
    // Try to get from cache first
    const cached = await this.cacheService.getTopContent('anime', limit);
    if (cached) {
      return cached;
    }

    const animes = await this.prisma.executeWithRetry(() =>
      this.prisma.akAnime.findMany({
        where: {
          statut: 1,
        },
        orderBy: [{ dateAjout: 'desc' }],
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

    const result = {
      topAnimes: animes.map(this.formatAnime),
      generatedAt: new Date().toISOString(),
    };

    // Cache for 15 minutes
    await this.cacheService.setTopContent('anime', limit, result, 900);

    return result;
  }

  async getRandomAnime() {
    // Get random anime using raw SQL for better performance
    const randomAnime = await this.prisma.$queryRaw<Array<{ id_anime: number }>>`
      SELECT id_anime FROM ak_animes 
      WHERE statut = 1 
      ORDER BY RANDOM() 
      LIMIT 1
    `;

    if (randomAnime.length === 0) {
      throw new NotFoundException('Aucun anime disponible');
    }

    return this.findOne(randomAnime[0].id_anime);
  }

  // Use inherited getGenres() method

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
    try {
      const results = await this.aniListService.searchAnime(query, limit);
      return {
        animes: results,
        total: results.length,
        query,
        source: 'AniList',
      };
    } catch (error) {
      console.error('Error searching AniList:', error.message);
      throw new Error('Failed to search AniList');
    }
  }

  async importSeasonalAnimeFromAniList(season: string, year: number, limit = 50) {
    try {
      const seasonalAnime = await this.aniListService.getAnimesBySeason(season, year, limit);

      const comparisons: any[] = [];

      for (const anilistAnime of seasonalAnime) {
        const primaryTitle = anilistAnime.title.romaji || anilistAnime.title.english || anilistAnime.title.native;

        const existingAnime = await this.prisma.akAnime.findFirst({
          where: {
            OR: [
              { titre: { equals: primaryTitle, mode: Prisma.QueryMode.insensitive } },
              { titreOrig: { equals: anilistAnime.title.native, mode: Prisma.QueryMode.insensitive } },
              { titreFr: { equals: anilistAnime.title.english, mode: Prisma.QueryMode.insensitive } },
              { titresAlternatifs: { contains: primaryTitle, mode: Prisma.QueryMode.insensitive } },
              { titresAlternatifs: { contains: anilistAnime.title.english, mode: Prisma.QueryMode.insensitive } },
              { titresAlternatifs: { contains: anilistAnime.title.native, mode: Prisma.QueryMode.insensitive } },
            ].filter(Boolean),
          },
          select: {
            idAnime: true,
            titre: true,
            titreOrig: true,
            titreFr: true,
            titresAlternatifs: true,
          },
        });

        const comparison = {
          titre: primaryTitle,
          exists: !!existingAnime,
          existingAnimeId: existingAnime?.idAnime,
          anilistData: anilistAnime,
          scrapedData: this.aniListService.mapToCreateAnimeDto(anilistAnime),
        };

        comparisons.push(comparison);
      }

      return {
        season,
        year,
        total: seasonalAnime.length,
        comparisons,
        source: 'AniList',
      };
    } catch (error) {
      console.error('Error importing seasonal anime from AniList:', error.message);
      throw new Error('Failed to import seasonal anime from AniList');
    }
  }

  async getAnimeTags(id: number) {
    return this.getTags(id, 'anime');
  }

  // Use inherited autocomplete() method

  async getAnimeRelations(id: number): Promise<RelationsResponse> {
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

      // Get relations where this anime is the source using raw SQL
      console.log(`Querying relations for: anime${id}`);
      const relations = await this.prisma.$queryRaw`
        SELECT id_relation, id_fiche_depart, id_anime, id_manga 
        FROM ak_fiche_to_fiche 
        WHERE id_fiche_depart = ${`anime${id}`}
      ` as any[];
      
      console.log(`Found ${relations.length} relations:`, relations);

      const relatedContent: RelatedContentItem[] = [];

      // Process each relation to get the actual content
      for (const relation of relations) {
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
              relationType: 'related', // Default since we're not selecting type_relation
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
              relationType: 'related', // Default since we're not selecting type_relation
            });
          }
        }
      }

      return {
        anime_id: id,
        relations: relatedContent,
        total: relatedContent.length,
      };
    } catch (error) {
      console.error('Error in getAnimeRelations:', error);
      throw error;
    }
  }

  async getAnimeStaff(id: number) {
    // First check if anime exists
    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: id, statut: 1 },
      select: { idAnime: true },
    });

    if (!anime) {
      throw new NotFoundException('Anime introuvable');
    }

    // Get staff/business relations
    const staff = await this.prisma.$queryRaw`
      SELECT 
        bs.id_relation as idRelation,
        bs.id_anime as idAnime,
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
      FROM ak_business_to_animes bs
      JOIN ak_business b ON bs.id_business = b.id_business
      WHERE bs.id_anime = ${id}
      ORDER BY bs.type, b.denomination
    ` as any[];

    return {
      anime_id: id,
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

  private formatAnime(anime: any) {
    const { idAnime, dateAjout, image, ...otherFields } = anime;

    return {
      id: idAnime,
      addedDate: dateAjout?.toISOString(),
      image: image ? (typeof image === 'string' && /^https?:\/\//.test(image) ? image : `/api/media/serve/anime/${image}`) : null,
      ...otherFields,
    };
  }

  // Cache helper methods
  private createCacheKey(query: AnimeQueryDto): string {
    const {
      page = 1,
      limit = 20,
      search = '',
      studio = '',
      annee = '',
      statut = '',
      genre = '',
      sortBy = 'dateAjout',
      sortOrder = 'desc',
      includeReviews = false,
      includeEpisodes = false,
    } = query;

    return `${page}_${limit}_${search}_${studio}_${annee}_${statut}_${genre}_${sortBy}_${sortOrder}_${includeReviews}_${includeEpisodes}`;
  }

  // Cache invalidation methods
  async invalidateAnimeCache(id: number): Promise<void> {
    await this.cacheService.invalidateAnime(id);
    // Also invalidate related caches
    await this.cacheService.invalidateSearchCache();
  }

}
