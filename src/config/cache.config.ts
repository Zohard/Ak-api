import { CacheModuleOptions } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';

export const cacheConfig = (): CacheModuleOptions => {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    // Use Redis when URL is provided
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
      // Add TLS support for Upstash Redis
      socket: {
        tls: true,
        rejectUnauthorized: false,
      },
    };
  } else {
    // Development: Use in-memory cache
    return {
      ttl: 300, // 5 minutes
      max: 100, // Maximum number of items in cache
    };
  }
};