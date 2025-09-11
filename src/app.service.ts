import { Injectable } from '@nestjs/common';
import { PrismaService } from './shared/services/prisma.service';
import { CacheService } from './shared/services/cache.service';
import ImageKit from 'imagekit';

@Injectable()
export class AppService {
  private imagekit: ImageKit;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {
    this.imagekit = new ImageKit({
      publicKey: 'public_pjoQrRTPxVOD7iy9kWQVSXWcXCU=',
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY || '',
      urlEndpoint: 'https://ik.imagekit.io/akimages'
    });
  }

  async getHealth() {
    try {
      // Test database connection
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'healthy',
        database: 'connected',
        timestamp: new Date().toISOString(),
        version: '3.0.0',
        framework: 'NestJS',
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        database: 'disconnected',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getAkTags() {
    // Try to get from cache first
    const cached = await this.cacheService.get('ak_tags:all');
    if (cached) {
      return cached;
    }

    const tags = await this.prisma.$queryRaw`
      SELECT 
        id_tag,
        tag_name,
        tag_nice_url,
        description,
        categorie
      FROM ak_tags
      ORDER BY categorie, tag_name
    `;

    const result = {
      tags,
      count: Array.isArray(tags) ? tags.length : 0,
    };

    // Cache for 1 day (86400 seconds) - tags rarely change
    await this.cacheService.set('ak_tags:all', result, 86400);

    return result;
  }

  async getImageKitAuth() {
    try {
      const authenticationParameters = this.imagekit.getAuthenticationParameters();
      return authenticationParameters;
    } catch (error) {
      throw new Error(`ImageKit authentication failed: ${error.message}`);
    }
  }
}
