import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleInit {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis;

  constructor(private configService: ConfigService) { }

  async onModuleInit() {
    const host = this.configService.get<string>('redis.host');
    const port = this.configService.get<number>('redis.port');
    const password = this.configService.get<string>('redis.password');
    const tls = this.configService.get<any>('redis.tls');
    const url = this.configService.get<string>('redis.url');
    const isUpstash = this.configService.get<boolean>('redis.isUpstash');

    if (url || (host && port)) {
      this.logger.log(`🔧 Initializing Redis connection (upstash=${isUpstash}, tls=${!!tls})`);
      this.redis = new Redis({
        host,
        port,
        password,
        tls,
        maxRetriesPerRequest: 3,
        connectTimeout: 30000,
        keepAlive: isUpstash ? 10000 : 30000, // Shorter keepalive for Upstash
        lazyConnect: true,
        retryStrategy: (times) => {
          const delay = Math.min(times * 1000, 30000);
          this.logger.log(`🔄 Retrying Redis connection in ${delay}ms (attempt ${times})`);
          return delay;
        },
        reconnectOnError: (err) => {
          const recoverableErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'Connection is closed'];
          const shouldReconnect = recoverableErrors.some(e => err.message.includes(e));
          if (shouldReconnect) {
            this.logger.log(`🔄 Reconnecting due to: ${err.message}`);
          }
          return shouldReconnect;
        }
      });

      this.redis.on('connect', () => this.logger.log('✅ Redis connected'));
      this.redis.on('ready', () => this.logger.log('✅ Redis ready'));
      this.redis.on('error', (err) => this.logger.error(`❌ Redis error: ${err.message}`, err.stack));
      this.redis.on('close', () => this.logger.warn('⚠️ Redis connection closed'));
      this.redis.on('reconnecting', () => this.logger.log('🔄 Redis reconnecting...'));

      // Explicitly connect
      try {
        await this.redis.connect();
        this.logger.log(`🚀 CacheService initialized with Redis (${host}:${port})`);
      } catch (error) {
        this.logger.error('❌ Failed to connect to Redis:', error.message);
        this.logger.warn('⚠️ CacheService will operate in degraded mode (no caching)');
      }
    } else {
      this.logger.warn('⚠️  No Redis configuration found - caching disabled');
    }
  }

  // Helper method to check if Redis is connected
  private isConnected(): boolean {
    if (!this.redis) return false;
    return this.redis.status === 'ready' || this.redis.status === 'connect';
  }

  // Generic get method
  async get<T>(key: string): Promise<T | undefined> {
    if (!this.isConnected()) {
      this.logger.debug(`Redis not connected, skipping cache get for key: ${key}`);
      return undefined;
    }

    try {
      this.logger.log(`🔍 Checking cache for key: ${key}`);
      const value = await this.redis.get(key);
      if (value) {
        this.logger.log(`✅ Cache HIT for key: ${key}`);
        return JSON.parse(value) as T;
      } else {
        this.logger.log(`❌ Cache MISS for key: ${key}`);
        return undefined;
      }
    } catch (error) {
      this.logger.error(`Cache get error for key ${key}:`, error.message);
      return undefined;
    }
  }

  // Generic set method
  async set<T>(key: string, value: T, ttl: number = 300): Promise<void> {
    if (!this.isConnected()) {
      this.logger.debug(`Redis not connected, skipping cache set for key: ${key}`);
      return;
    }

    try {
      this.logger.log(`💾 Attempting to cache key: ${key}, TTL: ${ttl}s`);
      const serialized = JSON.stringify(value);
      await this.redis.setex(key, ttl, serialized);
      this.logger.log(`✅ Successfully cached key: ${key}`);
    } catch (error) {
      this.logger.error(`❌ Cache set error for key ${key}:`, error.message);
    }
  }

  // Delete specific key
  async del(key: string): Promise<void> {
    if (!this.isConnected()) {
      this.logger.debug(`Redis not connected, skipping cache delete for key: ${key}`);
      return;
    }

    try {
      const result = await this.redis.del(key);
      this.logger.debug(`Cache deleted for key: ${key}, result: ${result}`);
    } catch (error) {
      this.logger.error(`❌ Cache delete error for key ${key}:`, error.message);
    }
  }

  // Clear cache by pattern using SCAN (non-blocking, safe for production)
  async delByPattern(pattern: string): Promise<void> {
    if (!this.isConnected()) {
      this.logger.debug(`Redis not connected, skipping pattern delete for: ${pattern}`);
      return;
    }

    try {
      this.logger.debug(`Cache pattern delete requested for: ${pattern}`);
      let cursor = '0';
      let deletedCount = 0;

      // Use SCAN instead of KEYS to avoid blocking Redis
      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;

        if (keys.length > 0) {
          await this.redis.del(...keys);
          deletedCount += keys.length;
        }
      } while (cursor !== '0');

      if (deletedCount > 0) {
        this.logger.debug(`Deleted ${deletedCount} keys matching pattern: ${pattern}`);
      }
    } catch (error) {
      this.logger.error(`Cache pattern delete error for pattern ${pattern}:`, error.message);
    }
  }

  // Anime-specific cache methods
  async getAnime(id: number): Promise<any> {
    return this.get(`anime:${id}`);
  }

  async setAnime(id: number, anime: any, ttl = 600): Promise<void> {
    await this.set(`anime:${id}`, anime, ttl); // 10 minutes
  }

  async getAnimeList(key: string): Promise<any> {
    return this.get(`anime_list:${key}`);
  }

  async setAnimeList(key: string, animes: any, ttl = 300): Promise<void> {
    await this.set(`anime_list:${key}`, animes, ttl); // 5 minutes
  }

  // Manga-specific cache methods
  async getManga(id: number): Promise<any> {
    return this.get(`manga:${id}`);
  }

  async setManga(id: number, manga: any, ttl = 600): Promise<void> {
    await this.set(`manga:${id}`, manga, ttl); // 10 minutes
  }

  async getMangaList(key: string): Promise<any> {
    return this.get(`manga_list:${key}`);
  }

  async setMangaList(key: string, mangas: any, ttl = 300): Promise<void> {
    await this.set(`manga_list:${key}`, mangas, ttl); // 5 minutes
  }

  // Manga Planning cache
  async getMangaPlanning(key: string): Promise<any> {
    return this.get(`planning:manga:${key}`);
  }

  async setMangaPlanning(key: string, data: any, ttl = 7200): Promise<void> {
    await this.set(`planning:manga:${key}`, data, ttl); // 2 hours
  }

  async invalidateMangaPlanning(): Promise<void> {
    await this.delByPattern('planning:manga:*');
    this.logger.debug('Invalidated manga planning cache');
  }

  // User collections cache methods
  async getUserCollections(userId: number, key: string): Promise<any> {
    return this.get(`user_collections:${userId}:${key}`);
  }

  async setUserCollections(userId: number, key: string, data: any, ttl = 300): Promise<void> {
    await this.set(`user_collections:${userId}:${key}`, data, ttl); // 5 minutes
  }

  // OPTIMIZED: Delete known collection cache keys instead of SCAN
  async invalidateUserCollections(userId: number): Promise<void> {
    // Collections have short TTL (5 min), only delete the most common keys
    const types = ['anime', 'manga', 'jeu-video'];
    const statuses = ['all', 'watching', 'completed', 'plantowatch', 'onhold', 'dropped'];

    const keysToDelete: Promise<void>[] = [];
    for (const type of types) {
      for (const status of statuses) {
        keysToDelete.push(this.del(`user_collections:${userId}:${type}:${status}`));
      }
    }

    await Promise.all(keysToDelete);
  }

  // Search cache methods
  async getSearchResult(query: string, type: string): Promise<any> {
    const key = `search:${type}:${this.hashQuery(query)}`;
    return this.get(key);
  }

  async setSearchResult(query: string, type: string, result: any, ttl = 180): Promise<void> {
    const key = `search:${type}:${this.hashQuery(query)}`;
    await this.set(key, result, ttl); // 3 minutes for search results
  }

  // Top/popular content cache
  async getTopContent(type: string, limit: number): Promise<any> {
    return this.get(`top:${type}:${limit}`);
  }

  async setTopContent(type: string, limit: number, content: any, ttl = 900): Promise<void> {
    await this.set(`top:${type}:${limit}`, content, ttl); // 15 minutes
  }

  // Rankings cache methods (1 hour TTL)
  async getRankings(mediaType: 'anime' | 'manga', rankingType: 'top' | 'flop', type: string, limit: number): Promise<any> {
    return this.get(`rankings:${mediaType}:${rankingType}:${type}:${limit}`);
  }

  async setRankings(mediaType: 'anime' | 'manga' | 'jeu-video', rankingType: 'top' | 'flop', type: string, limit: number, content: any, ttl = 3600): Promise<void> {
    await this.set(`rankings:${mediaType}:${rankingType}:${type}:${limit}`, content, ttl); // 1 hour
  }

  // OPTIMIZED: Avoid SCAN operations on Upstash - delete known ranking keys
  async invalidateRankings(mediaType: 'anime' | 'manga' | 'jeu-video'): Promise<void> {
    // Delete common ranking cache keys instead of using SCAN
    const limits = [10, 20, 50, 100];
    const types = ['top', 'flop'];
    const rankingTypes = ['popularity', 'rating', 'recent'];

    const keysToDelete: Promise<void>[] = [];
    for (const type of types) {
      for (const rankType of rankingTypes) {
        for (const limit of limits) {
          keysToDelete.push(this.del(`rankings:${mediaType}:${type}:${rankType}:${limit}`));
        }
      }
    }

    await Promise.all(keysToDelete);
    this.logger.debug(`Invalidated rankings cache for ${mediaType} (${keysToDelete.length} keys)`);
  }

  // Lists cache methods
  async getPublicLists(mediaType: string, sort: string, limit: number): Promise<any> {
    return this.get(`lists:${mediaType}:${sort}:${limit}`);
  }

  async setPublicLists(mediaType: string, sort: string, limit: number, lists: any, ttl = 14400): Promise<void> {
    await this.set(`lists:${mediaType}:${sort}:${limit}`, lists, ttl); // 4 hours (14400 seconds)
  }

  // Reviews cache
  async getReviews(animeId: number, mangaId: number): Promise<any> {
    const id = animeId || mangaId;
    const type = animeId ? 'anime' : 'manga';
    return this.get(`reviews:${type}:${id}`);
  }

  async setReviews(animeId: number, mangaId: number, reviews: any, ttl = 300): Promise<void> {
    const id = animeId || mangaId;
    const type = animeId ? 'anime' : 'manga';
    await this.set(`reviews:${type}:${id}`, reviews, ttl); // 5 minutes
  }

  // Reviews list cache (for paginated reviews)
  async getReviewsList(cacheKey: string): Promise<any> {
    return this.get(`reviews_list:${cacheKey}`);
  }

  async setReviewsList(cacheKey: string, reviews: any, ttl = 300): Promise<void> {
    await this.set(`reviews_list:${cacheKey}`, reviews, ttl); // 5 minutes
  }

  // Reviews count cache
  async getReviewsCount(): Promise<any> {
    return this.get('reviews:count');
  }

  async setReviewsCount(count: number, ttl = 600): Promise<void> {
    await this.set('reviews:count', count, ttl); // 10 minutes
  }

  // Top reviews cache
  async getTopReviews(limit: number, type?: string): Promise<any> {
    const typeKey = type || 'both';
    return this.get(`reviews:top:${typeKey}:${limit}`);
  }

  async setTopReviews(limit: number, type: string | undefined, reviews: any, ttl = 600): Promise<void> {
    const typeKey = type || 'both';
    await this.set(`reviews:top:${typeKey}:${limit}`, reviews, ttl); // 10 minutes
  }

  // Invalidate all reviews cache
  // OPTIMIZED: Avoid SCAN operations on Upstash - only delete known critical keys
  // Other cached reviews will expire via TTL (5-10 minutes)
  async invalidateAllReviews(): Promise<void> {
    // Only delete the most critical cached keys, let others expire via TTL
    await Promise.all([
      this.del('reviews:count'),
      this.del('reviews:top:both:10'),
      this.del('reviews:top:anime:10'),
      this.del('reviews:top:manga:10'),
    ]);
    this.logger.debug('Invalidated critical reviews cache (TTL handles the rest)');
  }

  // Invalidation methods
  async invalidateAnime(id: number): Promise<void> {
    await Promise.all([
      this.del(`anime:${id}`),
      this.del(`reviews:anime:${id}`),
      this.del(`anime_staff:${id}`),
      this.del(`anime_relations:${id}`),
      this.del(`anime_articles:${id}`),
      this.del(`similar_animes:${id}:6`),
    ]);
  }

  async invalidateManga(id: number): Promise<void> {
    await Promise.all([
      this.del(`manga:${id}`),
      this.del(`reviews:manga:${id}`),
      this.del(`manga_staff:${id}`),
      this.del(`manga_relations:${id}`),
      this.del(`manga_articles:${id}`),
      this.del(`similar_mangas:${id}:6`),
    ]);
  }

  async invalidateGame(id: number): Promise<void> {
    await Promise.all([
      this.del(`game:${id}`),
      this.del(`reviews:game:${id}`),
      this.del(`game_staff:${id}`),
      this.del(`game_relations:${id}`),
      this.del(`game_articles:${id}`),
      this.del(`similar_games:${id}:6`),
    ]);
  }

  async invalidateSearchCache(): Promise<void> {
    // In a full Redis implementation, we'd use SCAN to find and delete search:* keys
    this.logger.debug('Search cache invalidation requested');
  }

  // Paginated lists cache methods
  async getPublicListsPaged(mediaType: string, sort: string, type: string, page: number, limit: number): Promise<any> {
    const key = `lists_paged:${mediaType}:${sort}:${type || 'all'}:${page}:${limit}`;
    return this.get(key);
  }

  async setPublicListsPaged(mediaType: string, sort: string, type: string, page: number, limit: number, lists: any, ttl = 300): Promise<void> {
    const key = `lists_paged:${mediaType}:${sort}:${type || 'all'}:${page}:${limit}`;
    await this.set(key, lists, ttl); // 5 minutes
  }

  // OPTIMIZED: Avoid SCAN operations on Upstash
  async invalidatePublicLists(mediaType: 'anime' | 'manga' | 'jeu-video'): Promise<void> {
    // Delete known list cache keys instead of using SCAN
    const sorts = ['recent', 'popular', 'top'];
    const limits = [10, 20, 50];

    const keysToDelete: Promise<void>[] = [];
    for (const sort of sorts) {
      for (const limit of limits) {
        keysToDelete.push(this.del(`lists:${mediaType}:${sort}:${limit}`));
      }
    }

    await Promise.all(keysToDelete);
    this.logger.debug(`Invalidated public lists cache for ${mediaType} (TTL handles paged lists)`);
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

  // Homepage-specific cache methods
  async getHomepageData(key: string): Promise<any> {
    const value = await this.get(`homepage:${key}`);
    try {
      if (this.isEmptyHomepagePayload(value)) {
        this.logger.warn(`🚫 Ignoring cached empty payload for homepage:${key}`);
        return undefined;
      }
    } catch (e) {
      // If validation fails, return the value to avoid accidental cache misses
      this.logger.warn(
        `⚠️  Homepage payload validation error on get: ${(e as Error).message}`
      );
    }
    return value;
  }

  async setHomepageData(key: string, data: any, ttl = 1800): Promise<void> {
    // Do not cache empty/minimal homepage payloads
    try {
      const isEmpty = this.isEmptyHomepagePayload(data);
      if (isEmpty) {
        this.logger.warn(
          `⏭️  Skipping cache for homepage:${key} — payload considered empty`
        );
        return;
      }
    } catch (e) {
      // If validation throws, log and proceed with caching to avoid false negatives
      this.logger.warn(
        `⚠️  Homepage payload validation error, proceeding to cache: ${(e as Error).message}`
      );
    }

    await this.set(`homepage:${key}`, data, ttl); // 30 minutes default for homepage data
  }

  // Heuristic to determine if homepage payload is "empty" and not worth caching
  private isEmptyHomepagePayload(payload: any): boolean {
    if (!payload || typeof payload !== 'object') return true;

    const heroReviews = Array.isArray(payload?.hero?.reviews)
      ? payload.hero.reviews.length
      : 0;
    const heroArticles = Array.isArray(payload?.hero?.articles)
      ? payload.hero.articles.length
      : 0;
    const seasonAnimes = Array.isArray(payload?.season?.animes)
      ? payload.season.animes.length
      : 0;
    const forumMessages = Array.isArray(payload?.forum?.messages)
      ? payload.forum.messages.length
      : 0;

    const stats = payload?.stats || {};
    const statAnimes = Number(stats?.animes || 0);
    const statMangas = Number(stats?.mangas || 0);
    const statReviews = Number(stats?.reviews || 0);

    // Consider payload empty if no lists have items AND all stats are zero
    const hasAnyListItems =
      heroReviews > 0 || heroArticles > 0 || seasonAnimes > 0 || forumMessages > 0;
    const allStatsZero = statAnimes === 0 && statMangas === 0 && statReviews === 0;

    return !hasAnyListItems && allStatsZero;
  }

  // Homepage cache invalidation methods
  async invalidateHomepageReviews(): Promise<void> {
    await this.del('homepage:reviews');
    this.logger.debug('Invalidated homepage:reviews');
  }

  async invalidateHomepageArticles(): Promise<void> {
    await this.del('homepage:articles');
    this.logger.debug('Invalidated homepage:articles');
  }

  async invalidateHomepageSeason(): Promise<void> {
    await this.del('homepage:season');
    this.logger.debug('Invalidated homepage:season');
  }

  async invalidateHomepageForum(): Promise<void> {
    await this.del('homepage:forum');
    this.logger.debug('Invalidated homepage:forum');
  }

  async invalidateHomepageStats(): Promise<void> {
    await this.del('homepage:stats');
    this.logger.debug('Invalidated homepage:stats');
  }

  async invalidateAllHomepage(): Promise<void> {
    await Promise.all([
      this.del('homepage:reviews'),
      this.del('homepage:articles'),
      this.del('homepage:season'),
      this.del('homepage:forum'),
      this.del('homepage:stats'),
      this.del('mobile-homepage:aggregated'),
    ]);
    this.logger.debug('Invalidated all homepage cache');
  }

  async invalidateMobileHomepage(): Promise<void> {
    await this.del('mobile-homepage:aggregated');
    this.logger.debug('Invalidated mobile-homepage cache');
  }

  // Articles cache methods
  async getArticlesList(key: string): Promise<any> {
    return this.get(`articles_list:${key}`);
  }

  async setArticlesList(key: string, articles: any, ttl = 600): Promise<void> {
    await this.set(`articles_list:${key}`, articles, ttl); // 10 minutes for articles lists
  }

  async getArticle(id: number): Promise<any> {
    return this.get(`article:${id}`);
  }

  async setArticle(id: number, article: any, ttl = 1800): Promise<void> {
    await this.set(`article:${id}`, article, ttl); // 30 minutes for individual articles
  }

  async getArticleBySlug(slug: string): Promise<any> {
    return this.get(`article_slug:${slug}`);
  }

  async setArticleBySlug(slug: string, article: any, ttl = 1800): Promise<void> {
    await this.set(`article_slug:${slug}`, article, ttl); // 30 minutes for articles by slug
  }

  async getFeaturedArticles(): Promise<any> {
    return this.get('featured_articles');
  }

  async setFeaturedArticles(articles: any, ttl = 3600): Promise<void> {
    await this.set('featured_articles', articles, ttl); // 1 hour for featured articles
  }

  // OPTIMIZED: Delete specific keys instead of SCAN pattern
  async invalidateArticle(id: number): Promise<void> {
    await Promise.all([
      this.del(`article:${id}`),
      this.del('featured_articles'),
      this.del('homepage:articles'),
      // Article lists will expire via TTL (10 min)
    ]);
    this.logger.debug(`Invalidated article cache for ID: ${id}`);
  }

  async invalidateArticleBySlug(slug: string): Promise<void> {
    await Promise.all([
      this.del(`article_slug:${slug}`),
    ]);
    this.logger.debug(`Invalidated article cache for slug: ${slug}`);
  }

  // Events cache methods
  async getEvent(id: number): Promise<any> {
    return this.get(`event:${id}`);
  }

  async setEvent(id: number, event: any, ttl = 300): Promise<void> {
    await this.set(`event:${id}`, event, ttl); // 5 minutes for individual events
  }

  async getEventsList(key: string): Promise<any> {
    return this.get(`events:${key}`);
  }

  async setEventsList(key: string, events: any, ttl = 300): Promise<void> {
    await this.set(`events:${key}`, events, ttl); // 5 minutes for events lists
  }

  // OPTIMIZED: Delete specific key, let lists expire via TTL
  async invalidateEvent(id: number): Promise<void> {
    await this.del(`event:${id}`);
    // Events lists have short TTL (5 min), let them expire naturally
    this.logger.debug(`Invalidated event cache for ID: ${id}`);
  }

  // OPTIMIZED: Let events expire via TTL instead of SCAN
  async invalidateAllEvents(): Promise<void> {
    // Events have short TTL (5 min), let them expire naturally
    this.logger.debug('Events cache will expire via TTL');
  }

  // Forums cache methods
  async getForumCategories(userId?: number): Promise<any> {
    const userKey = userId ? `:user${userId}` : ':public';
    return this.get(`forums:categories${userKey}`);
  }

  async setForumCategories(categories: any, userId?: number, ttl = 600): Promise<void> {
    const userKey = userId ? `:user${userId}` : ':public';
    await this.set(`forums:categories${userKey}`, categories, ttl); // 10 minutes
  }

  async getForumBoard(boardId: number, page: number, limit: number, userId?: number): Promise<any> {
    const userKey = userId ? `:user${userId}` : ':public';
    return this.get(`forums:board:${boardId}:page${page}:limit${limit}${userKey}`);
  }

  async setForumBoard(boardId: number, page: number, limit: number, data: any, userId?: number, ttl = 120): Promise<void> {
    const userKey = userId ? `:user${userId}` : ':public';
    await this.set(`forums:board:${boardId}:page${page}:limit${limit}${userKey}`, data, ttl); // 2 minutes
  }

  async getForumTopic(topicId: number, page: number, limit: number): Promise<any> {
    return this.get(`forums:topic:${topicId}:page${page}:limit${limit}`);
  }

  async setForumTopic(topicId: number, page: number, limit: number, data: any, ttl = 60): Promise<void> {
    await this.set(`forums:topic:${topicId}:page${page}:limit${limit}`, data, ttl); // 1 minute
  }

  async getLatestForumMessages(limit: number, offset: number, boardId?: number): Promise<any> {
    const boardKey = boardId ? `:board${boardId}` : ':all';
    return this.get(`forums:messages:latest:limit${limit}:offset${offset}${boardKey}`);
  }

  async setLatestForumMessages(limit: number, offset: number, boardId: number | undefined, messages: any, ttl = 30): Promise<void> {
    const boardKey = boardId ? `:board${boardId}` : ':all';
    await this.set(`forums:messages:latest:limit${limit}:offset${offset}${boardKey}`, messages, ttl); // 30 seconds
  }

  // OPTIMIZED: Delete known pagination keys instead of SCAN
  async invalidateForumTopic(topicId: number): Promise<void> {
    // Delete first few pages which are most commonly accessed
    const pages = [1, 2, 3, 4, 5];
    const limits = [20, 50];

    const keysToDelete: Promise<void>[] = [];
    for (const page of pages) {
      for (const limit of limits) {
        keysToDelete.push(this.del(`forums:topic:${topicId}:page${page}:limit${limit}`));
      }
    }

    await Promise.all(keysToDelete);
    this.logger.debug(`Invalidated forum topic cache for ID: ${topicId}`);
  }

  // OPTIMIZED: Delete known pagination keys instead of SCAN
  async invalidateForumBoard(boardId: number): Promise<void> {
    const pages = [1, 2, 3];
    const limits = [20, 50];
    const userTypes = [':public', ''];

    const keysToDelete: Promise<void>[] = [];
    for (const page of pages) {
      for (const limit of limits) {
        for (const userType of userTypes) {
          keysToDelete.push(this.del(`forums:board:${boardId}:page${page}:limit${limit}${userType}`));
        }
      }
    }

    await Promise.all(keysToDelete);
    this.logger.debug(`Invalidated forum board cache for ID: ${boardId}`);
  }

  // Invalidate user-specific forum board cache (for mark as read)
  async invalidateUserForumBoard(boardId: number, userId: number): Promise<void> {
    const pages = [1, 2, 3, 4, 5];
    const limits = [20, 50];

    const keysToDelete: Promise<void>[] = [];
    for (const page of pages) {
      for (const limit of limits) {
        keysToDelete.push(this.del(`forums:board:${boardId}:page${page}:limit${limit}:user${userId}`));
      }
    }

    await Promise.all(keysToDelete);
    this.logger.debug(`Invalidated user forum board cache for board ${boardId}, user ${userId}`);
  }

  // OPTIMIZED: Let forums expire via TTL instead of SCAN
  async invalidateAllForums(): Promise<void> {
    // Forums have short TTL (1-10 min), let them expire naturally
    this.logger.debug('Forums cache will expire via TTL');
  }

  // Health check method
  async isHealthy(): Promise<boolean> {
    if (!this.isConnected()) return false;

    try {
      const testKey = 'health_check';
      const testValue = Date.now().toString();
      await this.set(testKey, testValue, 10);
      const retrieved = await this.get(testKey);
      await this.del(testKey);
      return retrieved === testValue;
    } catch (error) {
      this.logger.error('Cache health check failed:', error.message);
      return false;
    }
  }

  // Admin cache management methods - uses SCAN for production safety
  async getAllKeys(pattern: string = '*'): Promise<string[]> {
    if (!this.isConnected()) return [];

    try {
      const allKeys: string[] = [];
      let cursor = '0';

      // Use SCAN instead of KEYS to avoid blocking Redis with 100k+ keys
      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
        cursor = nextCursor;
        allKeys.push(...keys);
      } while (cursor !== '0');

      return allKeys;
    } catch (error) {
      this.logger.error(`Error getting keys with pattern ${pattern}:`, error.message);
      return [];
    }
  }

  async getKeysByCategory(): Promise<Record<string, string[]>> {
    const categories = {
      anime: 'anime:*',
      anime_staff: 'anime_staff:*',
      anime_relations: 'anime_relations:*',
      anime_articles: 'anime_articles:*',
      anime_similar: 'similar_animes:*',
      anime_exists: 'anime_exists:*',
      anilist_data: 'anilist_season_data:*',
      anilist_search: 'anilist_search:*',
      manga: 'manga:*',
      planning_manga: 'planning:manga:*',
      game: 'game:*',
      business: 'business:*',
      homepage: 'homepage:*',
      mobile_homepage: 'mobile-homepage:*',
      season: 'season:*',
      season_animes: 'season_animes:*',
      episodes_schedule: 'episodes_schedule:*',
      season_episodes: 'season_episodes_schedule:*',
      articles: 'article*',
      reviews: 'reviews*',
      search: 'search:*',
      rankings: 'rankings:*',
      lists: 'lists*',
      collections: 'user_collections:*',
      media_collections: 'media_collections_users:*',
      favorites: 'user:*:favorites',
      top: 'top:*',
      events: 'events:*',
      forums: 'forums:*',
      forums_stats: 'forums:stats*',
      user_profiles: 'user_profile:*',
      user_stats: 'user_stats:*',
      user_reviews: 'user_reviews:*',
      user_activity: 'user_activity:*'
    };

    const result: Record<string, string[]> = {};
    const categorizedKeys = new Set<string>();

    // Get keys for each specific category
    for (const [category, pattern] of Object.entries(categories)) {
      const keys = await this.getAllKeys(pattern);
      result[category] = keys;
      // Track all categorized keys
      keys.forEach(key => categorizedKeys.add(key));
    }

    // Get "other" keys - only those not matching any specific category
    const allKeys = await this.getAllKeys('*');
    result['other'] = allKeys.filter(key => !categorizedKeys.has(key));

    return result;
  }

  async getCacheStats(): Promise<{
    totalKeys: number;
    categoryCounts: Record<string, number>;
    memoryUsage?: string;
  }> {
    if (!this.isConnected()) {
      return { totalKeys: 0, categoryCounts: {} };
    }

    try {
      const keysByCategory = await this.getKeysByCategory();
      const categoryCounts: Record<string, number> = {};
      let totalKeys = 0;

      for (const [category, keys] of Object.entries(keysByCategory)) {
        const count = keys.length;
        categoryCounts[category] = count;
        totalKeys += count;
      }

      // Get memory info
      let memoryUsage: string | undefined;
      try {
        const info = await this.redis.info('memory');
        const match = info.match(/used_memory_human:([^\r\n]+)/);
        if (match) {
          memoryUsage = match[1];
        }
      } catch (err) {
        this.logger.warn('Could not fetch memory usage');
      }

      return {
        totalKeys,
        categoryCounts,
        memoryUsage
      };
    } catch (error) {
      this.logger.error('Error getting cache stats:', error.message);
      return { totalKeys: 0, categoryCounts: {} };
    }
  }

  async clearCacheByCategory(category: string): Promise<number> {
    const patterns: Record<string, string> = {
      anime: 'anime:*',
      anime_staff: 'anime_staff:*',
      anime_relations: 'anime_relations:*',
      anime_articles: 'anime_articles:*',
      anime_similar: 'similar_animes:*',
      anime_exists: 'anime_exists:*',
      anilist_data: 'anilist_season_data:*',
      anilist_search: 'anilist_search:*',
      manga: 'manga:*',
      planning_manga: 'planning:manga:*',
      game: 'game:*',
      business: 'business:*',
      homepage: 'homepage:*',
      season: 'season:*',
      season_animes: 'season_animes:*',
      episodes_schedule: 'episodes_schedule:*',
      season_episodes: 'season_episodes_schedule:*',
      articles: 'article*',
      reviews: 'reviews*',
      search: 'search:*',
      rankings: 'rankings:*',
      lists: 'lists*',
      collections: 'user_collections:*',
      media_collections: 'media_collections_users:*',
      favorites: 'user:*:favorites',
      top: 'top:*',
      events: 'events:*',
      forums: 'forums:*',
      forums_stats: 'forums:stats*',
      user_profiles: 'user_profile:*',
      user_stats: 'user_stats:*',
      user_reviews: 'user_reviews:*',
      user_activity: 'user_activity:*',
      all: '*'
    };

    const pattern = patterns[category];
    if (!pattern) {
      throw new Error(`Unknown cache category: ${category}`);
    }

    if (!this.isConnected()) return 0;

    try {
      // Use SCAN instead of KEYS to avoid blocking Redis with many keys
      let cursor = '0';
      let deletedCount = 0;

      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
        cursor = nextCursor;

        if (keys.length > 0) {
          await this.redis.del(...keys);
          deletedCount += keys.length;
        }
      } while (cursor !== '0');

      if (deletedCount > 0) {
        this.logger.log(`✅ Cleared ${deletedCount} keys for category: ${category}`);
      }
      return deletedCount;
    } catch (error) {
      this.logger.error(`Error clearing cache for category ${category}:`, error.message);
      throw error;
    }
  }
  // Friends Activity cache methods
  async getFriendsActivity(userId: number, page: number, limit: number, type: string, contentType: string): Promise<any> {
    const key = `friends_activity:${userId}:${page}:${limit}:${type}:${contentType}`;
    return this.get(key);
  }

  async setFriendsActivity(userId: number, page: number, limit: number, type: string, contentType: string, data: any, ttl = 120): Promise<void> {
    const key = `friends_activity:${userId}:${page}:${limit}:${type}:${contentType}`;
    await this.set(key, data, ttl); // 2 minutes default
  }

  // OPTIMIZED: Let friends activity expire via TTL (2 min) instead of SCAN
  async invalidateFriendsActivity(userId: number): Promise<void> {
    // Friends activity has short TTL, let it expire naturally
    this.logger.debug(`Friends activity for user ${userId} will expire via TTL`);
  }

  // User public profile cache methods
  async getUserProfile(pseudo: string): Promise<any> {
    return this.get(`user_profile:${pseudo.toLowerCase()}`);
  }

  async setUserProfile(pseudo: string, data: any, ttl = 300): Promise<void> {
    await this.set(`user_profile:${pseudo.toLowerCase()}`, data, ttl); // 5 minutes
  }

  async getUserStats(pseudo: string): Promise<any> {
    return this.get(`user_stats:${pseudo.toLowerCase()}`);
  }

  async setUserStats(pseudo: string, data: any, ttl = 300): Promise<void> {
    await this.set(`user_stats:${pseudo.toLowerCase()}`, data, ttl); // 5 minutes
  }

  async getUserReviews(pseudo: string, key: string): Promise<any> {
    return this.get(`user_reviews:${pseudo.toLowerCase()}:${key}`);
  }

  async setUserReviews(pseudo: string, key: string, data: any, ttl = 180): Promise<void> {
    await this.set(`user_reviews:${pseudo.toLowerCase()}:${key}`, data, ttl); // 3 minutes
  }

  async getUserActivity(pseudo: string, limit: number): Promise<any> {
    return this.get(`user_activity:${pseudo.toLowerCase()}:${limit}`);
  }

  async setUserActivity(pseudo: string, limit: number, data: any, ttl = 120): Promise<void> {
    await this.set(`user_activity:${pseudo.toLowerCase()}:${limit}`, data, ttl); // 2 minutes
  }

  // OPTIMIZED: Delete specific keys instead of SCAN pattern
  async invalidateUserProfile(pseudo: string): Promise<void> {
    const lowerPseudo = pseudo.toLowerCase();
    // Only delete core profile keys, let reviews/activity expire via TTL (2-3 min)
    await Promise.all([
      this.del(`user_profile:${lowerPseudo}`),
      this.del(`user_stats:${lowerPseudo}`),
    ]);
    this.logger.debug(`Invalidated user profile cache for: ${pseudo}`);
  }
}
