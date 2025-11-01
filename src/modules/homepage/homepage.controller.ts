import { Controller, Get, Logger, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HomePageService } from './homepage.service';
import { CacheService } from '../../shared/services/cache.service';

@ApiTags('Homepage')
@Controller('homepage')
export class HomePageController {
  private readonly logger = new Logger(HomePageController.name);

  constructor(
    private readonly homePageService: HomePageService,
    private readonly cache: CacheService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Aggregated data for homepage' })
  @ApiResponse({ status: 200, description: 'Homepage aggregated payload' })
  async getHomePageData() {
    return this.homePageService.getHomePageData();
  }

  @Post('clear-cache')
  @ApiOperation({ summary: 'Clear homepage cache for debugging' })
  @ApiResponse({ status: 200, description: 'Cache cleared successfully' })
  async clearCache() {
    await this.cache.delByPattern('homepage:*');
    return { message: 'Homepage cache cleared' };
  }

  @Get('debug')
  @ApiOperation({ summary: 'Debug homepage data sources individually' })
  @ApiResponse({ status: 200, description: 'Debug information' })
  async debugHomepage() {
    return this.homePageService.debugDataSources();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get public site statistics' })
  @ApiResponse({
    status: 200,
    description: 'Site statistics',
    schema: {
      type: 'object',
      properties: {
        animes: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            reviews: { type: 'number' },
          },
        },
        mangas: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            reviews: { type: 'number' },
          },
        },
      },
    },
  })
  async getStats() {
    return this.homePageService.getPublicStats();
  }
}

