import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { CacheService } from '../../../shared/services/cache.service';

@Injectable()
export class AnimeRankingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async getTopAnimes(limit = 10, type = 'reviews-bayes') {
    // Try to get from cache first (1 hour TTL)
    const cached = await this.cacheService.getRankings('anime', 'top', type, limit);
    if (cached) {
      return cached;
    }

    let animes: any[];

    // Collection-based rankings (ratings are out of 5)
    if (type === 'collection-bayes' || type === 'collection-avg') {
      const minRatings = type === 'collection-bayes' ? 10 : 3;

      // Use raw SQL to calculate average from collection ratings
      // Collection ratings are /5, so we multiply by 2 to get /10 for consistency
      const results = await this.prisma.$queryRaw<Array<{
        id_anime: number;
        avg_rating: number;
        num_ratings: number
      }>>`
        SELECT
          a.id_anime,
          (AVG(c.evaluation) * 2)::float as avg_rating,
          COUNT(c.evaluation)::int as num_ratings
        FROM ak_animes a
        INNER JOIN collection_animes c ON a.id_anime = c.id_anime
        WHERE a.statut = 1 AND c.evaluation > 0
        GROUP BY a.id_anime
        HAVING COUNT(c.evaluation) >= ${minRatings}
        ORDER BY AVG(c.evaluation) DESC, COUNT(c.evaluation) DESC
        LIMIT ${limit}
      `;

      // Fetch full anime details for each result
      const animeIds = results.map(r => r.id_anime);
      animes = await this.prisma.akAnime.findMany({
        where: { idAnime: { in: animeIds }, statut: 1 },
        include: {
          reviews: {
            take: 2,
            orderBy: { dateCritique: 'desc' },
            include: {
              membre: {
                select: { idMember: true, memberName: true },
              },
            },
          },
        },
      });

      // Sort animes in the same order as results and add collection stats
      const animeMap = new Map(animes.map(a => [a.idAnime, a]));
      animes = results.map(r => {
        const anime = animeMap.get(r.id_anime);
        return anime ? {
          ...anime,
          moyenneNotes: r.avg_rating, // Use collection average (converted to /10)
          nbReviews: r.num_ratings, // Show number of collection ratings
        } : null;
      }).filter(Boolean);

    } else {
      // Reviews-based rankings (existing logic)
      const minReviews = type === 'reviews-bayes' ? 10 : 3;
      animes = await this.prisma.executeWithRetry(() =>
        this.prisma.akAnime.findMany({
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
                  select: { idMember: true, memberName: true },
                },
              },
            },
          },
        })
      );
    }

    const result = {
      topAnimes: animes.map(this.formatAnime.bind(this)),
      rankingType: type,
      generatedAt: new Date().toISOString(),
    };

    // Cache for 1 hour (3600 seconds)
    await this.cacheService.setRankings('anime', 'top', type, limit, result);

    return result;
  }

  async getFlopAnimes(limit = 20, type = 'reviews-bayes') {
    // Try to get from cache first (1 hour TTL)
    const cached = await this.cacheService.getRankings('anime', 'flop', type, limit);
    if (cached) {
      return cached;
    }

    let animes: any[];

    // Collection-based rankings (ratings are out of 5)
    if (type === 'collection-bayes' || type === 'collection-avg') {
      const minRatings = type === 'collection-bayes' ? 10 : 3;

      // Use raw SQL to calculate average from collection ratings
      // Collection ratings are /5, so we multiply by 2 to get /10 for consistency
      const results = await this.prisma.$queryRaw<Array<{
        id_anime: number;
        avg_rating: number;
        num_ratings: number
      }>>`
        SELECT
          a.id_anime,
          (AVG(c.evaluation) * 2)::float as avg_rating,
          COUNT(c.evaluation)::int as num_ratings
        FROM ak_animes a
        INNER JOIN collection_animes c ON a.id_anime = c.id_anime
        WHERE a.statut = 1 AND c.evaluation > 0
        GROUP BY a.id_anime
        HAVING COUNT(c.evaluation) >= ${minRatings}
        ORDER BY AVG(c.evaluation) ASC, COUNT(c.evaluation) DESC
        LIMIT ${limit}
      `;

      // Fetch full anime details for each result
      const animeIds = results.map(r => r.id_anime);
      animes = await this.prisma.akAnime.findMany({
        where: { idAnime: { in: animeIds }, statut: 1 },
        include: {
          reviews: {
            take: 2,
            orderBy: { dateCritique: 'desc' },
            include: {
              membre: {
                select: { idMember: true, memberName: true },
                },
            },
          },
        },
      });

      // Sort animes in the same order as results and add collection stats
      const animeMap = new Map(animes.map(a => [a.idAnime, a]));
      animes = results.map(r => {
        const anime = animeMap.get(r.id_anime);
        return anime ? {
          ...anime,
          moyenneNotes: r.avg_rating, // Use collection average (converted to /10)
          nbReviews: r.num_ratings, // Show number of collection ratings
        } : null;
      }).filter(Boolean);

    } else {
      // Reviews-based rankings (existing logic)
      const minReviews = type === 'reviews-bayes' ? 10 : 3;
      animes = await this.prisma.executeWithRetry(() =>
        this.prisma.akAnime.findMany({
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
                  select: { idMember: true, memberName: true },
                },
              },
            },
          },
        })
      );
    }

    const result = {
      flopAnimes: animes.map(this.formatAnime.bind(this)),
      rankingType: type,
      generatedAt: new Date().toISOString(),
    };

    // Cache for 1 hour (3600 seconds)
    await this.cacheService.setRankings('anime', 'flop', type, limit, result);

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

    // Return just the ID - the main service will handle fetching full details
    return { id: randomAnime[0].id_anime };
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
}
