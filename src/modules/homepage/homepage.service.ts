import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../../shared/services/cache.service';
import { ReviewsService } from '../reviews/reviews.service';
import { SeasonsService } from '../seasons/seasons.service';
import { ForumsService } from '../forums/forums.service';
import { PrismaService } from '../../shared/services/prisma.service';
import { ArticlesService } from '../articles/articles.service';

@Injectable()
export class HomePageService {
  private readonly logger = new Logger(HomePageService.name);

  constructor(
    private readonly cache: CacheService,
    private readonly prisma: PrismaService,
    private readonly reviewsService: ReviewsService,
    private readonly seasonsService: SeasonsService,
    private readonly forumsService: ForumsService,
    private readonly articlesService: ArticlesService,
  ) { }

  async getHomePageData() {
    // Define cache keys
    const keys = {
      reviews: 'homepage:reviews',
      articles: 'homepage:articles',
      season: 'homepage:season',
      forum: 'homepage:forum',
      stats: 'homepage:stats',
      recentAnimes: 'homepage:recent_animes',
      recentMangas: 'homepage:recent_mangas',
      recentGames: 'homepage:recent_games',
    };

    // 1. Try to get all parts from cache in parallel
    const [
      cachedReviews,
      cachedArticles,
      cachedSeason,
      cachedForum,
      cachedStats,
      cachedRecentAnimes,
      cachedRecentMangas,
      cachedRecentGames,
    ] = await Promise.all([
      this.cache.get<any>(keys.reviews),
      this.cache.get<any>(keys.articles),
      this.cache.get<any>(keys.season),
      this.cache.get<any>(keys.forum),
      this.cache.get<any>(keys.stats),
      this.cache.get<any>(keys.recentAnimes),
      this.cache.get<any>(keys.recentMangas),
      this.cache.get<any>(keys.recentGames),
    ]);

    // 2. Prepare data fetch promises for missing parts
    const promises: any = {};

    if (!cachedReviews) {
      this.logger.log('MISS: Reviews');
      promises.reviews = this.reviewsService.findAll({ limit: 6, sortBy: 'dateCritique', sortOrder: 'desc', statut: 0 } as any);
    }

    if (!cachedArticles) {
      this.logger.log('MISS: Articles');
      promises.articles = this.articlesService.findAll({ limit: 6, sort: 'date', order: 'DESC', status: 'published' } as any);
    }

    if (!cachedSeason) {
      this.logger.log('MISS: Season');
      // We need to fetch season AND season animes together to ensure consistency
      promises.season = (async () => {
        try {
          const season = await this.seasonsService.findCurrent();
          if (!season || !season.id_saison) return { current: null, animes: [] };

          const animes = await this.seasonsService.getSeasonAnimes(season.id_saison);
          const shuffled = (animes as any[]).sort(() => Math.random() - 0.5).slice(0, 10);
          return { current: season, animes: shuffled };
        } catch (e) {
          this.logger.warn('Error fetching season data', e);
          return { current: null, animes: [] };
        }
      })();
    }

    if (!cachedForum) {
      this.logger.log('MISS: Forum');
      promises.forum = this.forumsService.getLatestMessages({ limit: 2 } as any);
    }

    if (!cachedStats) {
      this.logger.log('MISS: Stats');
      promises.stats = (async () => {
        const [animeCount, mangaCount, reviewsCount] = await Promise.all([
          this.prisma.akAnime.count(),
          this.prisma.akManga.count(),
          this.reviewsService.getReviewsCount()
        ]);
        return {
          animes: Number(animeCount || 0),
          mangas: Number(mangaCount || 0),
          reviews: Number((reviewsCount as any)?.count || reviewsCount || 0)
        };
      })();
    }

    // Recent anime/manga/games for "Activité récente" section
    if (!cachedRecentAnimes) {
      this.logger.log('MISS: Recent Animes');
      promises.recentAnimes = this.prisma.akAnime.findMany({
        where: { statut: 1 },
        orderBy: { dateAjout: 'desc' },
        take: 3,
        select: {
          idAnime: true,
          titre: true,
          niceUrl: true,
          image: true,
          annee: true,
          studio: true,
          origine: true,
        },
      });
    }

    if (!cachedRecentMangas) {
      this.logger.log('MISS: Recent Mangas');
      promises.recentMangas = this.prisma.akManga.findMany({
        where: { statut: 1 },
        orderBy: { dateAjout: 'desc' },
        take: 3,
        select: {
          idManga: true,
          titre: true,
          niceUrl: true,
          image: true,
          annee: true,
          editeur: true,
          origine: true,
        },
      });
    }

    if (!cachedRecentGames) {
      this.logger.log('MISS: Recent Games');
      promises.recentGames = this.prisma.akJeuxVideo.findMany({
        where: { statut: 1 },
        orderBy: { dateAjout: 'desc' },
        take: 3,
        select: {
          idJeu: true,
          titre: true,
          niceUrl: true,
          image: true,
          annee: true,
          editeur: true,
          support: true,
        },
      });
    }

    // 3. Resolve all missing data
    // We can't use Promise.allSettled on an object directly, so we map the values
    const keysToFetch = Object.keys(promises);
    if (keysToFetch.length > 0) {
      this.logger.log(`Fetching missing parts: ${keysToFetch.join(', ')}`);

      // Execute all promises
      await Promise.all(
        keysToFetch.map(async (key) => {
          try {
            const data = await promises[key];

            // Validate and process before caching
            let dataToCache = data;

            // Standardize reviews structure
            if (key === 'reviews') {
              dataToCache = Array.isArray((data as any)?.reviews) ? (data as any).reviews :
                Array.isArray((data as any)?.data) ? (data as any).data :
                  Array.isArray(data) ? data : [];
            }

            // Standardize articles structure
            if (key === 'articles') {
              dataToCache = Array.isArray((data as any)?.articles) ? (data as any).articles :
                Array.isArray((data as any)?.data) ? (data as any).data :
                  Array.isArray(data) ? data : [];
            }

            // Cache the result
            const cacheKey = keys[key as keyof typeof keys];
            if (dataToCache) {
              // Season data cached for 4 hours (14400s), other homepage data for 2 hours (7200s)
              const ttl = key === 'season' ? 14400 : 7200;
              await this.cache.set(cacheKey, dataToCache, ttl);
              this.logger.log(`✅ Cached ${key} (TTL: ${ttl}s)`);
            }

            // Update the local variable so we use the fresh data
            if (key === 'reviews') promises.reviewsResult = dataToCache;
            if (key === 'articles') promises.articlesResult = dataToCache;
            if (key === 'season') promises.seasonResult = dataToCache;
            if (key === 'forum') promises.forumResult = dataToCache;
            if (key === 'stats') promises.statsResult = dataToCache;
            if (key === 'recentAnimes') promises.recentAnimesResult = dataToCache;
            if (key === 'recentMangas') promises.recentMangasResult = dataToCache;
            if (key === 'recentGames') promises.recentGamesResult = dataToCache;

          } catch (e) {
            this.logger.error(`Failed to fetch ${key}`, e);
          }
        })
      );
    }

    // 4. Construct final payload using cached or fresh data
    const reviews = promises.reviewsResult || cachedReviews || [];
    const articles = promises.articlesResult || cachedArticles || [];
    const season = promises.seasonResult || cachedSeason || { current: null, animes: [] };
    const forum = promises.forumResult || cachedForum || { messages: [], total: 0, limit: 2, offset: 0 };
    const stats = promises.statsResult || cachedStats || { animes: 0, mangas: 0, reviews: 0 };
    const recentAnimes = promises.recentAnimesResult || cachedRecentAnimes || [];
    const recentMangas = promises.recentMangasResult || cachedRecentMangas || [];
    const recentGames = promises.recentGamesResult || cachedRecentGames || [];

    return {
      hero: {
        reviews,
        articles
      },
      season,
      forum,
      stats,
      recent: {
        animes: recentAnimes.map((a: any) => ({
          id: a.idAnime,
          idAnime: a.idAnime,
          titre: a.titre,
          niceUrl: a.niceUrl,
          image: a.image,
          annee: a.annee,
          studio: a.studio,
          origine: a.origine,
        })),
        mangas: recentMangas.map((m: any) => ({
          id: m.idManga,
          idManga: m.idManga,
          titre: m.titre,
          niceUrl: m.niceUrl,
          image: m.image,
          annee: m.annee,
          editeur: m.editeur,
          origine: m.origine,
        })),
        games: recentGames.map((g: any) => ({
          id: g.idJeu,
          idJeu: g.idJeu,
          titre: g.titre,
          niceUrl: g.niceUrl,
          image: g.image,
          annee: g.annee,
          editeur: g.editeur,
          support: g.support,
        })),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async debugDataSources() {
    this.logger.log('🔍 Starting homepage debug...');

    const debug = {
      timestamp: new Date().toISOString(),
      sources: {} as any
    };

    // Test each data source individually
    try {
      this.logger.log('🧪 Testing reviews service...');
      const reviewsResult = await this.reviewsService.findAll({ limit: 3, sortBy: 'dateCritique', sortOrder: 'desc', statut: 0 } as any); // Only public reviews
      debug.sources.reviews = {
        status: 'success',
        count: Array.isArray((reviewsResult as any)?.reviews) ? (reviewsResult as any).reviews.length :
          Array.isArray((reviewsResult as any)?.data) ? (reviewsResult as any).data.length : 0,
        sampleData: reviewsResult
      };
    } catch (error) {
      debug.sources.reviews = { status: 'error', error: error.message };
    }

    try {
      this.logger.log('🧪 Testing articles service...');
      const articlesResult = await this.articlesService.findAll({ limit: 3, sort: 'date', order: 'DESC', status: 'published' } as any);
      debug.sources.articles = {
        status: 'success',
        count: Array.isArray((articlesResult as any)?.articles) ? (articlesResult as any).articles.length : 0,
        sampleData: articlesResult
      };
    } catch (error) {
      debug.sources.articles = { status: 'error', error: error.message };
    }

    try {
      this.logger.log('🧪 Testing database counts...');
      const [animeCount, mangaCount] = await Promise.all([
        this.prisma.akAnime.count(),
        this.prisma.akManga.count(),
      ]);
      debug.sources.counts = {
        status: 'success',
        animes: animeCount,
        mangas: mangaCount
      };
    } catch (error) {
      debug.sources.counts = { status: 'error', error: error.message };
    }

    try {
      this.logger.log('🧪 Testing reviews count...');
      const reviewsCount = await this.reviewsService.getReviewsCount();
      debug.sources.reviewsCount = {
        status: 'success',
        data: reviewsCount
      };
    } catch (error) {
      debug.sources.reviewsCount = { status: 'error', error: error.message };
    }

    return debug;
  }

  async getPublicStats() {
    const cacheKey = 'public:stats';

    // Try cache first (cache for 1 hour)
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    this.logger.log('📊 Generating fresh public stats...');

    try {
      const [
        totalAnimes,
        totalMangas,
        totalGames,
        animeReviews,
        mangaReviews,
        gameReviews,
      ] = await Promise.all([
        this.prisma.akAnime.count({ where: { statut: 1 } }),
        this.prisma.akManga.count({ where: { statut: 1 } }),
        this.prisma.akJeuxVideo.count({ where: { statut: 1 } }),
        this.prisma.akCritique.count({
          where: {
            idAnime: { gt: 0 },
            statut: 0, // 0 = Published, 1 = Draft, 2 = Rejected
          },
        }),
        this.prisma.akCritique.count({
          where: {
            idManga: { gt: 0 },
            statut: 0, // 0 = Published
          },
        }),
        this.prisma.akCritique.count({
          where: {
            idJeu: { gt: 0 },
            statut: 0, // 0 = Published
          },
        }),
      ]);

      const stats = {
        animes: {
          total: totalAnimes,
          reviews: animeReviews,
        },
        mangas: {
          total: totalMangas,
          reviews: mangaReviews,
        },
        games: {
          total: totalGames,
          reviews: gameReviews,
        },
      };

      // Cache for 1 hour
      await this.cache.set(cacheKey, stats, 3600);

      return stats;
    } catch (error) {
      this.logger.error('❌ Error generating public stats:', error);
      throw error;
    }
  }
}

