import { Injectable } from '@nestjs/common';
import { PrismaService } from './shared/services/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

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

    return {
      tags,
      count: Array.isArray(tags) ? tags.length : 0,
    };
  }
}
