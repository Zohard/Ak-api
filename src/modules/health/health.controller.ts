import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('Health')
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
   * Preloads minimal cache without heavy DB queries
   */
  @Get('warmup')
  @ApiOperation({ summary: 'Warmup endpoint for cold start prevention' })
  @ApiResponse({ status: 200, description: 'Service warmed up' })
  async warmup() {
    await this.healthService.warmup();

    return {
      status: 'warmed',
      timestamp: new Date().toISOString(),
      message: 'Service warmed up successfully',
    };
  }
}
