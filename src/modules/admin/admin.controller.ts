import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AdminService } from './admin.service';

@ApiTags('Admin - Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get comprehensive admin dashboard statistics' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        users: {
          type: 'object',
          properties: {
            total_users: { type: 'number' },
            active_users: { type: 'number' },
            banned_users: { type: 'number' },
            admin_users: { type: 'number' },
            moderator_users: { type: 'number' },
            new_users_month: { type: 'number' },
          },
        },
        content: {
          type: 'object',
          properties: {
            active_animes: { type: 'number' },
            inactive_animes: { type: 'number' },
            active_mangas: { type: 'number' },
            inactive_mangas: { type: 'number' },
            active_business: { type: 'number' },
            active_articles: { type: 'number' },
            pending_reviews: { type: 'number' },
            pending_synopses: { type: 'number' },
          },
        },
        moderation: {
          type: 'object',
          properties: {
            pending_reviews: { type: 'number' },
            approved_reviews: { type: 'number' },
            rejected_reviews: { type: 'number' },
            pending_reports: { type: 'number' },
            resolved_reports: { type: 'number' },
          },
        },
        recent_activity: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              date: { type: 'number' },
              title: { type: 'string' },
              description: { type: 'string' },
              target_id: { type: 'number' },
              target_type: { type: 'string' },
            },
          },
        },
        system_health: {
          type: 'object',
          properties: {
            database: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                response_time_ms: { type: 'number' },
                database_size: { type: 'string' },
                active_connections: { type: 'number' },
              },
            },
            storage: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                media_files: { type: 'object' },
              },
            },
            performance: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                top_tables: { type: 'array' },
              },
            },
            status: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async getDashboard() {
    return this.adminService.getDashboardStats();
  }

  @Get('dashboard/charts')
  @ApiOperation({ summary: 'Get chart data for admin dashboard (7-day trends + content breakdown)' })
  @ApiQuery({ name: 'refresh', required: false, description: 'Set to true to invalidate cache', type: Boolean })
  @ApiResponse({ status: 200, description: 'Chart data retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async getChartData(@Query('refresh') refresh?: string) {
    return this.adminService.getChartData(refresh === 'true');
  }

  @Get('activity')
  @ApiOperation({ summary: 'Get recent admin and system activity' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of activities to return',
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Recent activity retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          date: { type: 'number' },
          title: { type: 'string' },
          description: { type: 'string' },
          target_id: { type: 'number' },
          target_type: { type: 'string' },
        },
      },
    },
  })
  async getRecentActivity(@Query('limit', ParseIntPipe) limit: number = 20) {
    return this.adminService.getRecentActivity(limit);
  }

  @Get('system/health')
  @ApiOperation({ summary: 'Get system health status' })
  @ApiResponse({
    status: 200,
    description: 'System health retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        database: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            response_time_ms: { type: 'number' },
            database_size: { type: 'string' },
            active_connections: { type: 'number' },
          },
        },
        storage: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            media_files: { type: 'object' },
          },
        },
        performance: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            top_tables: { type: 'array' },
          },
        },
        status: { type: 'string' },
      },
    },
  })
  async getSystemHealth() {
    return this.adminService.getSystemHealth();
  }

  @Get('actions')
  @ApiOperation({ summary: 'Get admin action logs' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of actions to return',
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Admin actions retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        actions: { type: 'array' },
      },
    },
  })
  async getAdminActions(@Query('limit') limitStr?: string) {
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    return this.adminService.getAdminActions(limit);
  }

  @Post('export')
  @ApiOperation({ summary: 'Export data in various formats' })
  @ApiResponse({
    status: 200,
    description: 'Data export initiated successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        export_id: { type: 'string' },
        estimated_completion: { type: 'string' },
      },
    },
  })
  @HttpCode(HttpStatus.OK)
  async exportData(
    @Body('type') type: string,
    @Body('format') format: string = 'csv',
  ) {
    return this.adminService.exportData(type, format);
  }

  @Get('settings')
  @ApiOperation({ summary: 'Get system settings' })
  @ApiResponse({
    status: 200,
    description: 'System settings retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        site_name: { type: 'string' },
        maintenance_mode: { type: 'boolean' },
        registration_enabled: { type: 'boolean' },
        review_moderation_enabled: { type: 'boolean' },
        max_upload_size: { type: 'string' },
        supported_image_formats: { type: 'array', items: { type: 'string' } },
        cache_enabled: { type: 'boolean' },
        backup_frequency: { type: 'string' },
      },
    },
  })
  async getSystemSettings() {
    return this.adminService.getSystemSettings();
  }

  @Put('settings')
  @ApiOperation({ summary: 'Update system settings' })
  @ApiResponse({
    status: 200,
    description: 'System settings updated successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        updated_settings: { type: 'object' },
      },
    },
  })
  async updateSystemSettings(@Body() settings: Record<string, any>) {
    return this.adminService.updateSystemSettings(settings);
  }
}
