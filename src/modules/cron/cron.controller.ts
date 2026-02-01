import {
  Controller,
  Post,
  Headers,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { CronService } from './cron.service';

@ApiTags('Cron Jobs')
@Controller('cron')
export class CronController {
  private readonly logger = new Logger(CronController.name);

  constructor(
    private readonly cronService: CronService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * Validate the cron API key from headers
   */
  private validateApiKey(apiKey: string | undefined): void {
    const validApiKey = this.configService.get<string>('CRON_API_KEY');

    if (!validApiKey) {
      this.logger.warn('CRON_API_KEY not configured in environment');
      throw new UnauthorizedException('Cron API key not configured');
    }

    if (!apiKey || apiKey !== validApiKey) {
      this.logger.warn('Invalid or missing cron API key');
      throw new UnauthorizedException('Invalid or missing API key');
    }
  }

  @Post('update-anime-popularity')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update anime popularity rankings',
    description:
      'Calculates and updates popularity rankings for all published animes based on user collections, reviews, views, and ratings. Requires CRON_API_KEY in X-Cron-Key header.',
  })
  @ApiHeader({
    name: 'X-Cron-Key',
    description: 'API key for authenticating cron job requests',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Popularity rankings updated successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        stats: {
          type: 'object',
          properties: {
            totalAnimes: { type: 'number' },
            updatedCount: { type: 'number' },
            errorCount: { type: 'number' },
            executionTime: { type: 'string' },
          },
        },
        top10: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              rank: { type: 'number' },
              id: { type: 'number' },
              titre: { type: 'string' },
              score: { type: 'number' },
              change: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing API key',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error during popularity update',
  })
  async updateAnimePopularity(@Headers('x-cron-key') apiKey: string) {
    this.validateApiKey(apiKey);

    this.logger.log('Starting anime popularity update via cron endpoint');
    const startTime = Date.now();

    try {
      const result = await this.cronService.updateAnimePopularity();
      const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);

      this.logger.log(
        `Anime popularity update completed in ${executionTime}s - Updated: ${result.stats.updatedCount}, Errors: ${result.stats.errorCount}`,
      );

      return {
        ...result,
        stats: {
          ...result.stats,
          executionTime: `${executionTime}s`,
        },
      };
    } catch (error) {
      this.logger.error(
        `Anime popularity update failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Post('update-manga-popularity')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update manga popularity rankings',
    description:
      'Calculates and updates popularity rankings for all published mangas. Requires CRON_API_KEY in X-Cron-Key header.',
  })
  @ApiHeader({
    name: 'X-Cron-Key',
    description: 'API key for authenticating cron job requests',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Popularity rankings updated successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing API key',
  })
  async updateMangaPopularity(@Headers('x-cron-key') apiKey: string) {
    this.validateApiKey(apiKey);

    this.logger.log('Starting manga popularity update via cron endpoint');
    const startTime = Date.now();

    try {
      const result = await this.cronService.updateMangaPopularity();
      const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);

      this.logger.log(
        `Manga popularity update completed in ${executionTime}s - Updated: ${result.stats.updatedCount}`,
      );

      return {
        ...result,
        stats: {
          ...result.stats,
          executionTime: `${executionTime}s`,
        },
      };
    } catch (error) {
      this.logger.error(
        `Manga popularity update failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
  @Post('update-anime-episode-count')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update anime episode counts from episodes table',
    description:
      'Updates the nb_ep field in ak_animes table by counting actual episodes in ak_animes_episodes. Requires CRON_API_KEY in X-Cron-Key header.',
  })
  @ApiHeader({
    name: 'X-Cron-Key',
    description: 'API key for authenticating cron job requests',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Episode counts updated successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing API key',
  })
  async updateAnimeEpisodeCount(@Headers('x-cron-key') apiKey: string) {
    this.validateApiKey(apiKey);

    this.logger.log('Starting anime episode count update via cron endpoint');
    const startTime = Date.now();

    try {
      // Temporarily cast cronService to any since TypeScript might not pick up the new method immediately
      // in the current compilation context, although it exists in the file.
      const result = await this.cronService.updateAnimeEpisodeCount();
      const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);

      this.logger.log(
        `Anime episode count update completed in ${executionTime}s - Updated: ${result.stats.updatedCount}`,
      );

      return {
        ...result,
        stats: {
          ...result.stats,
          executionTime: `${executionTime}s`,
        },
      };
    } catch (error) {
      this.logger.error(
        `Anime episode count update failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
