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
   */
  async checkDatabase(): Promise<boolean> {
    try {
      // Use a simple query with a timeout
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Database health check timeout')), 3000)
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
   * Performs minimal operations to keep the function warm
   * Does NOT perform heavy database queries
   */
  async warmup(): Promise<void> {
    try {
      // Just touch the cache service without DB queries
      await this.cacheService.get('warmup:ping');

      this.logger.log('Service warmed up successfully');
    } catch (error) {
      this.logger.error('Warmup failed:', error.message);
      // Don't throw - warmup failures shouldn't break the endpoint
    }
  }
}
