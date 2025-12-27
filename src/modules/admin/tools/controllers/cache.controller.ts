import {
  Controller,
  Get,
  Delete,
  Param,
  UseGuards,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { CacheService } from '../../../../shared/services/cache.service';

@Controller('admin/cache')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminCacheController {
  constructor(private readonly cacheService: CacheService) {}

  @Get('stats')
  async getCacheStats() {
    try {
      const stats = await this.cacheService.getCacheStats();
      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error: {
            message: error.message || 'Failed to fetch cache stats',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('keys')
  async getAllKeysByCategory() {
    try {
      const keysByCategory = await this.cacheService.getKeysByCategory();
      return {
        success: true,
        data: keysByCategory,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error: {
            message: error.message || 'Failed to fetch cache keys',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('clear/:category')
  async clearCacheByCategory(@Param('category') category: string) {
    try {
      const deletedCount = await this.cacheService.clearCacheByCategory(
        category,
      );
      return {
        success: true,
        data: {
          category,
          deletedKeys: deletedCount,
        },
        message: `Cleared ${deletedCount} cache keys for category: ${category}`,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error: {
            message: error.message || 'Failed to clear cache',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('health')
  async checkCacheHealth() {
    try {
      const isHealthy = await this.cacheService.isHealthy();
      return {
        success: true,
        data: {
          healthy: isHealthy,
          status: isHealthy ? 'connected' : 'disconnected',
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error: {
            message: error.message || 'Failed to check cache health',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
