import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { SentryService, SentryIssue, SentryStats } from './sentry.service';

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
  ): Promise<{ success: boolean; data: SentryIssue[]; meta: { count: number; timestamp: string }; error?: string }> {
    try {
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
    } catch (error) {
      // Log error but return graceful response instead of 500
      console.error('Error in getIssues controller:', error);
      return {
        success: false,
        data: [],
        meta: {
          count: 0,
          timestamp: new Date().toISOString(),
        },
        error: 'Unable to fetch Sentry issues. Please check your Sentry configuration.',
      };
    }
  }

  /**
   * Get issue statistics
   */
  @Get('stats')
  async getStats(): Promise<{ success: boolean; data: SentryStats; timestamp: string }> {
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
