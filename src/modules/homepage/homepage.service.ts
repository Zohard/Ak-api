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
  ) {}

  async getHomePageData() {
    const cacheKey = 'v1';
    
    // Skip cache for debugging - force fresh data
    this.logger.log('🏠 Homepage data requested, bypassing cache for debugging');
    
    try {
      this.logger.log('📊 Starting homepage data aggregation...');
      
      const [
        latestReviews,
        articles,
        currentSeason,
        forum,
        animeCount,
        mangaCount,
        reviewsCount,
      ] = await Promise.allSettled([
        this.reviewsService.findAll({ limit: 6, sortBy: 'dateCritique', sortOrder: 'desc' } as any),
        this.articlesService.findAll({ limit: 6, sort: 'date', order: 'DESC', status: 'published' } as any),
        this.seasonsService.findCurrent(),
        this.forumsService.getLatestMessages({ limit: 3 } as any),
        this.prisma.akAnime.count(),
        this.prisma.akManga.count(),
        this.reviewsService.getReviewsCount(),
      ]);

      // Log each result for debugging
      this.logger.log('📝 Reviews result:', latestReviews.status === 'fulfilled' ? 'SUCCESS' : `FAILED: ${(latestReviews as any).reason?.message}`);
      this.logger.log('📰 Articles result:', articles.status === 'fulfilled' ? 'SUCCESS' : `FAILED: ${(articles as any).reason?.message}`);
      this.logger.log('🗓️ Season result:', currentSeason.status === 'fulfilled' ? 'SUCCESS' : `FAILED: ${(currentSeason as any).reason?.message}`);
      this.logger.log('💬 Forum result:', forum.status === 'fulfilled' ? 'SUCCESS' : `FAILED: ${(forum as any).reason?.message}`);
      this.logger.log('📊 Stats results:', {
        animes: animeCount.status === 'fulfilled' ? 'SUCCESS' : 'FAILED',
        mangas: mangaCount.status === 'fulfilled' ? 'SUCCESS' : 'FAILED',
        reviews: reviewsCount.status === 'fulfilled' ? 'SUCCESS' : 'FAILED'
      });

      // Extract successful results or use fallbacks
      const reviewsData = latestReviews.status === 'fulfilled' ? latestReviews.value : null;
      const articlesData = articles.status === 'fulfilled' ? articles.value : null;
      const seasonData = currentSeason.status === 'fulfilled' ? currentSeason.value : null;
      const forumData = forum.status === 'fulfilled' ? forum.value : null;
      const animeCountData = animeCount.status === 'fulfilled' ? animeCount.value : 0;
      const mangaCountData = mangaCount.status === 'fulfilled' ? mangaCount.value : 0;
      const reviewsCountData = reviewsCount.status === 'fulfilled' ? reviewsCount.value : { count: 0 };

      let seasonAnimes: any[] = [];
      if (seasonData && seasonData.id_saison) {
        try {
          this.logger.log('🗓️ Loading season animes for season:', seasonData.id_saison);
          const list = await this.seasonsService.getSeasonAnimes(seasonData.id_saison);
          // Shuffle and take up to 10
          seasonAnimes = (list as any[])
            .sort(() => Math.random() - 0.5)
            .slice(0, 10);
          this.logger.log('🎌 Season animes loaded:', seasonAnimes.length);
        } catch (e) {
          this.logger.warn('Failed loading season animes, skipping:', e);
        }
      }

      const payload = {
        hero: {
          // Hand off raw data; UI builds image URLs and links
          reviews: Array.isArray((reviewsData as any)?.reviews) ? (reviewsData as any).reviews : 
                  Array.isArray((reviewsData as any)?.data) ? (reviewsData as any).data : 
                  Array.isArray(reviewsData) ? reviewsData : [],
          articles: Array.isArray((articlesData as any)?.articles) ? (articlesData as any).articles : 
                   Array.isArray((articlesData as any)?.data) ? (articlesData as any).data : 
                   Array.isArray(articlesData) ? articlesData : [],
        },
        season: {
          current: seasonData || null,
          animes: seasonAnimes,
        },
        forum: forumData || { messages: [], total: 0, limit: 3, offset: 0 },
        stats: {
          animes: Number(animeCountData || 0),
          mangas: Number(mangaCountData || 0),
          reviews: Number((reviewsCountData as any)?.count || reviewsCountData || 0),
        },
        generatedAt: new Date().toISOString(),
      };

      this.logger.log('📦 Final payload summary:', {
        reviewsCount: payload.hero.reviews.length,
        articlesCount: payload.hero.articles.length,
        seasonAnimes: payload.season.animes.length,
        forumMessages: payload.forum.messages?.length || 0,
        stats: payload.stats
      });

      // Skip cache for now to debug
      // await this.cache.setHomepageData(cacheKey, payload, 300); // 5 minutes
      return payload;
    } catch (error) {
      this.logger.error('Homepage aggregation error:', error);
      // Do not fail the request—return a minimal fallback
      return {
        hero: { reviews: [], articles: [] },
        season: { current: null, animes: [] },
        forum: { messages: [], total: 0, limit: 3, offset: 0 },
        stats: { animes: 0, mangas: 0, reviews: 0 },
        generatedAt: new Date().toISOString(),
      };
    }
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
      const reviewsResult = await this.reviewsService.findAll({ limit: 3, sortBy: 'dateCritique', sortOrder: 'desc' } as any);
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
}

