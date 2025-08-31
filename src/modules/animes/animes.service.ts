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
    const anime = await this.prisma.akAnime.create({
      data: {
        ...createAnimeDto,
        dateAjout: new Date(),
        statut: createAnimeDto.statut ?? 0, // Default to pending approval
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

    const updatedAnime = await this.prisma.akAnime.update({
      where: { idAnime: id },
      data: updateAnimeDto,
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
    });

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
      image: image ? `/api/media/serve/anime/${image}` : null,
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
