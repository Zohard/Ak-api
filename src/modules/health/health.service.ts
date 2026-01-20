import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Check database connectivity with timeout
   * Returns false instead of throwing to avoid 500 errors
   * Increased timeout to handle Neon cold starts
   */
  async checkDatabase(): Promise<boolean> {
    try {
      // Use a simple query with a longer timeout for cold starts
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Database health check timeout')), 15000)
      );

      const check = this.prisma.$queryRaw`SELECT 1 as health`;

      await Promise.race([check, timeout]);
      return true;
    } catch (error) {
      this.logger.error('Database health check failed:', error.message);
      return false;
    }
  }

  /**
   * Check Redis connectivity
   */
  async checkRedis(): Promise<boolean> {
    try {
      const testKey = 'health:check';
      await this.cacheService.set(testKey, 'ok', 10);
      const value = await this.cacheService.get(testKey);
      return value === 'ok';
    } catch (error) {
      this.logger.warn('Redis health check failed:', error.message);
      // Redis is optional, so we don't fail the health check
      return true;
    }
  }

  /**
   * Warmup function to prevent cold starts
   * Warms up both cache and database connection
   */
  async warmup(): Promise<{ database: boolean; cache: boolean; duration: number }> {
    const startTime = Date.now();
    let dbSuccess = false;
    let cacheSuccess = false;

    // Warm up database (important for Neon cold starts)
    try {
      await this.prisma.$queryRaw`SELECT 1 as warmup`;
      dbSuccess = true;
      this.logger.log('Database warmed up');
    } catch (error) {
      this.logger.error('Database warmup failed:', error.message);

      // Try to reconnect
      try {
        await this.prisma.$disconnect();
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.prisma.$connect();
        await this.prisma.$queryRaw`SELECT 1 as warmup_retry`;
        dbSuccess = true;
        this.logger.log('Database warmed up after reconnect');
      } catch (retryError) {
        this.logger.error('Database warmup retry failed:', retryError.message);
      }
    }

    // Warm up cache
    try {
      await this.cacheService.set('warmup:ping', 'ok', 60);
      await this.cacheService.get('warmup:ping');
      cacheSuccess = true;
      this.logger.log('Cache warmed up');
    } catch (error) {
      this.logger.warn('Cache warmup failed:', error.message);
      // Cache failures are not critical
      cacheSuccess = true;
    }

    const duration = Date.now() - startTime;
    this.logger.log(`Warmup completed in ${duration}ms (db: ${dbSuccess}, cache: ${cacheSuccess})`);

    return { database: dbSuccess, cache: cacheSuccess, duration };
  }
}
