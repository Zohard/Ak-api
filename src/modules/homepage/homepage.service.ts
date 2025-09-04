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
    const cached = await this.cache.getHomepageData(cacheKey);
    if (cached) return cached;

    try {
      const [
        latestReviews,
        articles,
        currentSeason,
        forum,
        animeCount,
        mangaCount,
        reviewsCount,
      ] = await Promise.all([
        this.reviewsService.findAll({ limit: 6, sortBy: 'dateCritique', sortOrder: 'desc' } as any),
        this.articlesService.findAll({ limit: 6, sort: 'date', order: 'DESC', status: 'published' } as any),
        this.seasonsService.findCurrent(),
        this.forumsService.getLatestMessages({ limit: 3 } as any),
        this.prisma.akAnime.count(),
        this.prisma.akManga.count(),
        this.reviewsService.getReviewsCount(),
      ]);

      let seasonAnimes: any[] = [];
      if (currentSeason && currentSeason.id_saison) {
        try {
          const list = await this.seasonsService.getSeasonAnimes(currentSeason.id_saison);
          // Shuffle and take up to 10
          seasonAnimes = (list as any[])
            .sort(() => Math.random() - 0.5)
            .slice(0, 10);
        } catch (e) {
          this.logger.warn('Failed loading season animes, skipping:', e);
        }
      }

      const payload = {
        hero: {
          // Hand off raw data; UI builds image URLs and links
          reviews: Array.isArray((latestReviews as any)?.reviews) ? (latestReviews as any).reviews : [],
          articles: Array.isArray((articles as any)?.articles) ? (articles as any).articles : [],
        },
        season: {
          current: currentSeason || null,
          animes: seasonAnimes,
        },
        forum: forum || { messages: [], total: 0, limit: 3, offset: 0 },
        stats: {
          animes: Number(animeCount || 0),
          mangas: Number(mangaCount || 0),
          reviews: Number((reviewsCount as any)?.count || 0),
        },
        generatedAt: new Date().toISOString(),
      };

      await this.cache.setHomepageData(cacheKey, payload, 300); // 5 minutes
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
}

