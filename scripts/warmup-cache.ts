import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';

import { CacheService } from '../src/shared/services/cache.service';
import { AnimesService } from '../src/modules/animes/animes.service';
import { MangasService } from '../src/modules/mangas/mangas.service';
import { ListsService } from '../src/modules/lists/lists.service';
import { UnifiedSearchService } from '../src/shared/services/unified-search.service';
import { HomePageService } from '../src/modules/homepage/homepage.service';
import { ArticlesService } from '../src/modules/articles/articles.service';
import { ReviewsService } from '../src/modules/reviews/reviews.service';

async function main() {
  const logger = new Logger('CacheWarmup');

  logger.log('Starting cache warm-up...');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    const cache = app.get(CacheService);
    const animes = app.get(AnimesService);
    const mangas = app.get(MangasService);
    const lists = app.get(ListsService);
    const search = app.get(UnifiedSearchService);
    const homepage = app.get(HomePageService);
    const articles = app.get(ArticlesService);
    const reviews = app.get(ReviewsService);

    const healthy = await cache.isHealthy();
    if (!healthy) {
      logger.warn('Cache not healthy or REDIS_URL not set. Proceeding will fetch data but not cache.');
    }

    // 1) Homepage
    try {
      logger.log('Warming: homepage payload');
      const payload = await homepage.getHomePageData();
      await cache.setHomepageData('v1', payload, 300);
      logger.log('Warmed: homepage');
    } catch (e: any) {
      logger.error(`Homepage warm-up failed: ${e?.message || e}`);
    }

    // 2) Top content
    try {
      logger.log('Warming: top animes (10, 20)');
      await animes.getTopAnimes(10);
      await animes.getTopAnimes(20);
      logger.log('Warming: top mangas (10, 20)');
      await mangas.getTopMangas(10);
      await mangas.getTopMangas(20);
    } catch (e: any) {
      logger.error(`Top content warm-up failed: ${e?.message || e}`);
    }

    // 3) Public lists
    try {
      logger.log('Warming: public lists (recent/popular) for anime/manga');
      await lists.getPublicLists('anime', 'recent', 10);
      await lists.getPublicLists('anime', 'popular', 10);
      await lists.getPublicLists('manga', 'recent', 10);
      await lists.getPublicLists('manga', 'popular', 10);
    } catch (e: any) {
      logger.error(`Public lists warm-up failed: ${e?.message || e}`);
    }

    // 4) Articles
    try {
      logger.log('Warming: featured articles');
      await articles.getFeaturedArticles(5);
      logger.log('Warming: recent articles page 1');
      await articles.findAll({ page: 1, limit: 10, status: 'published', sort: 'postDate', order: 'DESC' } as any);
    } catch (e: any) {
      logger.error(`Articles warm-up failed: ${e?.message || e}`);
    }

    // 5) Reviews (top)
    try {
      logger.log('Warming: top reviews (both/anime/manga)');
      await reviews.getTopReviews(10, 'both' as any);
      await reviews.getTopReviews(10, 'anime');
      await reviews.getTopReviews(10, 'manga');
    } catch (e: any) {
      logger.error(`Reviews warm-up failed: ${e?.message || e}`);
    }

    // 6) Search suggestions and common queries
    try {
      const defaultQueries = ['naruto', 'one piece', 'bleach', 'dragon', 'my hero', 'attack'];
      const rawEnv = process.env.CACHE_WARM_QUERIES || '';
      const envQueries = rawEnv
        .split(',')
        .map((q) => q.trim())
        .filter(Boolean);
      const queries = envQueries.length ? envQueries : defaultQueries;

      logger.log(`Warming: search cache for queries: ${queries.join(', ')}`);
      for (const q of queries) {
        await search.search({ query: q, type: 'all', limit: 20 });
        await search.getAutocomplete(q, 'all', 10);
      }
    } catch (e: any) {
      logger.error(`Search warm-up failed: ${e?.message || e}`);
    }

    logger.log('Cache warm-up completed.');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Cache warm-up script failed:', err);
  process.exitCode = 1;
});

