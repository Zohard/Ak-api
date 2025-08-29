import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('General')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'API Information' })
  @ApiResponse({ status: 200, description: 'API information and status' })
  getApiInfo() {
    return {
      message: 'Anime-Kun NestJS API v3.0',
      framework: 'NestJS',
      database: 'PostgreSQL with Prisma',
      status: 'active',
      documentation: '/docs',
      endpoints: {
        authentication: '/api/auth/*',
        users: '/api/users',
        animes: '/api/animes',
        mangas: '/api/mangas',
        reviews: '/api/reviews',
        admin: '/api/admin/*',
        business: '/api/business/*',
      },
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'Health Check' })
  @ApiResponse({ status: 200, description: 'Service health status' })
  async getHealth() {
    return this.appService.getHealth();
  }
}
