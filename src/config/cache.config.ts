import { CacheModuleOptions } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';

export const cacheConfig = (): CacheModuleOptions => {
  const isProduction = process.env.NODE_ENV === 'production';
  const redisUrl = process.env.REDIS_URL;

  if (isProduction && redisUrl) {
    // Production: Use Redis
    return {
      store: redisStore as any,
      url: redisUrl,
      ttl: 300, // 5 minutes default TTL
      max: 1000, // Maximum number of items in cache
      retryDelayOnFailover: 100,
      retryDelayOnClusterDown: 300,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
    };
  } else {
    // Development: Use in-memory cache
    return {
      ttl: 300, // 5 minutes
      max: 100, // Maximum number of items in cache
    };
  }
};