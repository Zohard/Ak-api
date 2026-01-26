import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('General')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

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

  @Get('ak-tags')
  @ApiOperation({ summary: 'Get all AK tags with tag names' })
  @ApiResponse({
    status: 200,
    description: 'List of all AK tags with their names and metadata',
    schema: {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id_tag: { type: 'integer' },
              tag_name: { type: 'string' },
              tag_nice_url: { type: 'string' },
              description: { type: 'string' },
              categorie: { type: 'string' }
            }
          }
        },
        count: { type: 'integer' }
      }
    }
  })
  async getAkTags() {
    return this.appService.getAkTags();
  }

  @Get('imagekit/auth')
  @ApiOperation({ summary: 'Get ImageKit authentication parameters' })
  @ApiResponse({
    status: 200,
    description: 'Authentication parameters for ImageKit uploads',
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string' },
        expire: { type: 'number' },
        signature: { type: 'string' }
      }
    }
  })
  async getImageKitAuth() {
    return this.appService.getImageKitAuth();
  }

  @Get('debug-sentry')
  @ApiOperation({ summary: 'Test Sentry reporting' })
  getError() {
    throw new Error('My first Sentry error!');
  }
}
