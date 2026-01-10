import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { RolesGuard } from '../../../auth/roles.guard';
import { Roles } from '../../../auth/roles.decorator';
import { SentryService } from './sentry.service';

@Controller('admin/sentry')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'moderator')
export class SentryController {
  constructor(private readonly sentryService: SentryService) {}

  /**
   * Check if Sentry is configured
   */
  @Get('status')
  async getStatus() {
    return {
      configured: this.sentryService.isConfigured(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get issues from Sentry
   */
  @Get('issues')
  async getIssues(
    @Query('limit') limit?: number,
    @Query('query') query?: string,
    @Query('statsPeriod') statsPeriod?: string,
    @Query('status') status?: string,
  ) {
    const issues = await this.sentryService.getIssues({
      limit: limit ? Number(limit) : 25,
      query,
      statsPeriod: statsPeriod || '24h',
      status,
    });

    return {
      success: true,
      data: issues,
      meta: {
        count: issues.length,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Get issue statistics
   */
  @Get('stats')
  async getStats() {
    const stats = await this.sentryService.getStats();
    return {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get specific issue details
   */
  @Get('issues/:id')
  async getIssueDetails(@Param('id') id: string) {
    const details = await this.sentryService.getIssueDetails(id);
    return {
      success: true,
      data: details,
      timestamp: new Date().toISOString(),
    };
  }
}
