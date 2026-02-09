import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service';

@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Lightweight health check endpoint
   * Does NOT query the database to avoid connection overhead
   * Use this for cold start prevention pings
   */
  @Get()
  @ApiOperation({ summary: 'Lightweight health check (no DB)' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  async check() {
    return {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      railway: {
        service: process.env.RAILWAY_SERVICE_NAME,
        environment: process.env.RAILWAY_ENVIRONMENT_NAME,
      },
    };
  }

  /**
   * Full health check with database connection test
   * Use this sparingly to verify actual database connectivity
   */
  @Get('full')
  @ApiOperation({ summary: 'Full health check (includes DB)' })
  @ApiResponse({ status: 200, description: 'Service and database are healthy' })
  @ApiResponse({ status: 503, description: 'Service unavailable' })
  async fullCheck() {
    const dbHealthy = await this.healthService.checkDatabase();
    const redisHealthy = await this.healthService.checkRedis();

    return {
      status: dbHealthy && redisHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      checks: {
        database: dbHealthy ? 'healthy' : 'unhealthy',
        redis: redisHealthy ? 'healthy' : 'unhealthy',
      },
    };
  }

  /**
   * Warmup endpoint for cold start prevention
   * Warms up both database and cache connections
   */
  @Get('warmup')
  @ApiOperation({ summary: 'Warmup endpoint for cold start prevention' })
  @ApiResponse({ status: 200, description: 'Service warmed up' })
  async warmup() {
    const result = await this.healthService.warmup();

    return {
      status: result.database ? 'warmed' : 'partial',
      timestamp: new Date().toISOString(),
      duration: result.duration,
      checks: {
        database: result.database ? 'warmed' : 'failed',
        cache: result.cache ? 'warmed' : 'failed',
      },
      message: result.database
        ? 'Service warmed up successfully'
        : 'Partial warmup - database connection failed',
    };
  }

  /**
   * Database latency diagnostic endpoint
   * Use this to diagnose Railway PostgreSQL performance issues
   */
  @Get('latency')
  @ApiOperation({ summary: 'Database latency diagnostic' })
  @ApiResponse({ status: 200, description: 'Latency measurement' })
  async latency() {
    const result = await this.healthService.measureLatency();

    return {
      timestamp: new Date().toISOString(),
      database: {
        latency_ms: result.latency,
        active_connections: result.connectionCount,
        version: result.dbVersion,
        status: result.latency < 50 ? 'excellent' : result.latency < 100 ? 'good' : result.latency < 300 ? 'acceptable' : 'slow',
      },
      recommendations: result.latency > 100 ? [
        'Consider using connection pooling (PgBouncer or Prisma Accelerate)',
        'Check if app and database are in the same region',
        'Review slow query logs for optimization opportunities',
      ] : [],
    };
  }
}
