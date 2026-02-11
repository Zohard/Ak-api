import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/services/prisma.service';
import { CacheService } from '../../../shared/services/cache.service';

@Injectable()
export class AnimeRankingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) { }

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

  // --- Weekly Ranking (Internal Data) ---

  async getWeeklyRanking(year: number, season: string, week: number) {
    // Try cache first (10 min TTL — rankings only change once per week)
    const cacheKey = `rankings:weekly:${year}:${season}:${week}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const rankings = await this.prisma.animeWeeklyRanking.findMany({
      where: {
        year,
        season,
        week,
      },
      orderBy: {
        rank: 'asc',
      },
      include: {
        anime: {
          select: {
            idAnime: true,
            titre: true,
            titreFr: true,
            image: true,
            classementPopularite: true,
            statut: true,
          }
        }
      }
    });

    const result = rankings.map(r => ({
      ...r,
      // Calculate trend icon/color purely on frontend based on 'trend' value
      anime: {
        ...r.anime,
        image: r.anime.image ? (typeof r.anime.image === 'string' && /^https?:\/\//.test(r.anime.image) ? r.anime.image : `/api/media/serve/anime/${r.anime.image}`) : null
      }
    }));

    // Cache for 10 minutes (rankings change weekly)
    if (result.length > 0) {
      await this.cacheService.set(cacheKey, result, 600);
    }

    return result;
  }

  async generateWeeklyRanking(year: number, season: string, week: number) {
    // 1. Convert season string to number (WINTER=1, SPRING=2, SUMMER=3, FALL=4)
    const saisonNumber = this._seasonStringToNumber(season);

    // 2. Get the season record from ak_animes_saisons
    const saisonRecord = await this.prisma.akAnimesSaisons.findFirst({
      where: {
        annee: year,
        saison: saisonNumber,
      },
    });

    if (!saisonRecord) {
      return { message: `No season found for ${season} ${year}` };
    }

    // 3. Parse json_data to get anime IDs (stored as ["id1","id2",...])
    let animeIds: number[] = [];
    try {
      const jsonData = JSON.parse(saisonRecord.jsonData);
      animeIds = Array.isArray(jsonData) ? jsonData.map(Number) : [];
    } catch (e) {
      return { message: 'Failed to parse season anime data' };
    }

    if (animeIds.length === 0) {
      return { message: 'No animes found in this season' };
    }

    // 4. Fetch top 20 animes from the season's anime list, ordered by popularity
    const topAnimes = await this.prisma.akAnime.findMany({
      where: {
        idAnime: { in: animeIds },
        statut: 1,
        classementPopularite: { gt: 0 }, // Only animes with valid popularity ranking
      },
      orderBy: {
        classementPopularite: 'asc', // Lower is better (1st, 2nd...)
      },
      take: 20,
      select: {
        idAnime: true,
        classementPopularite: true,
      }
    });

    if (topAnimes.length === 0) {
      return { message: 'No animes found for this season/period' };
    }

    // 3. Prepare data for bulk insert
    // We also need previous week's data to calculate trends
    const previousWeek = week === 1 ? 52 : week - 1;
    const previousYear = week === 1 ? year - 1 : year; // Simplified logic, ideally use ISO weeks

    const previousRankings = await this.prisma.animeWeeklyRanking.findMany({
      where: {
        year: previousYear,
        season: season, // Comparing within same season context usually
        week: previousWeek,
      },
      select: {
        animeId: true,
        rank: true,
      }
    });

    const prevRankMap = new Map(previousRankings.map(p => [p.animeId, p.rank]));

    const rankingEntries = topAnimes.map((anime, index) => {
      const currentRank = index + 1;
      const prevRank = prevRankMap.get(anime.idAnime);
      let trend = 0; // 0 = same

      if (prevRank) {
        trend = prevRank - currentRank; // Positive means moved UP (e.g. 5 -> 3 = +2)
      } else {
        trend = 0; // New entry (or first week) -> treat as same or handled by UI as "NEW"
      }

      return {
        animeId: anime.idAnime,
        year,
        season,
        week,
        rank: currentRank,
        score: null, // We don't have a specific weekly score, relying on global popularity
        trend,
      };
    });

    // 4. Save to DB using bulk upsert (single query for all 20 entries)
    if (rankingEntries.length > 0) {
      const values = rankingEntries.map(
        e => Prisma.sql`(${e.animeId}, ${e.year}, ${e.season}, ${e.week}, ${e.rank}, ${e.score}, ${e.trend})`
      );

      await this.prisma.$executeRaw`
        INSERT INTO anime_weekly_rankings (id_anime, year, season, week, rank, score, trend)
        VALUES ${Prisma.join(values)}
        ON CONFLICT (year, week, id_anime)
        DO UPDATE SET rank = EXCLUDED.rank, trend = EXCLUDED.trend
      `;
    }

    // Invalidate the cache for this week
    await this.cacheService.del(`rankings:weekly:${year}:${season}:${week}`);

    return { success: true, count: rankingEntries.length };
  }

  private _seasonStringToNumber(season: string): number {
    switch (season.toUpperCase()) {
      case 'WINTER': return 1;
      case 'SPRING': return 2;
      case 'SUMMER': return 3;
      case 'FALL': return 4;
      default: return 1;
    }
  }
}
