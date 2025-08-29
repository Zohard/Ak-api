import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { AdminModerationService } from './admin-moderation.service';
import {
  ReviewModerationActionDto,
  BulkModerationDto,
  ModerationQueueQueryDto,
} from './dto/review-moderation.dto';
import {
  ContentModerationActionDto,
  ReportContentDto,
  ModerationReportQueryDto,
} from './dto/content-moderation.dto';

@ApiTags('Admin - Moderation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/moderation')
export class AdminModerationController {
  constructor(
    private readonly adminModerationService: AdminModerationService,
  ) {}

  @Get('queue')
  @ApiOperation({ summary: 'Get moderation queue for reviews' })
  @ApiResponse({
    status: 200,
    description: 'Moderation queue retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        reviews: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              titre: { type: 'string' },
              critique: { type: 'string' },
              notation: { type: 'number' },
              date_critique: { type: 'number' },
              statut: { type: 'number' },
              author_name: { type: 'string' },
              content_title: { type: 'string' },
              content_type: { type: 'string' },
            },
          },
        },
        pagination: {
          type: 'object',
          properties: {
            currentPage: { type: 'number' },
            totalPages: { type: 'number' },
            totalItems: { type: 'number' },
            hasNext: { type: 'boolean' },
            hasPrevious: { type: 'boolean' },
          },
        },
      },
    },
  })
  async getModerationQueue(@Query() query: ModerationQueueQueryDto) {
    return this.adminModerationService.getModerationQueue(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get moderation statistics' })
  @ApiResponse({
    status: 200,
    description: 'Moderation statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        pending_reviews: { type: 'number' },
        approved_reviews: { type: 'number' },
        rejected_reviews: { type: 'number' },
        pending_reports: { type: 'number' },
        resolved_reports: { type: 'number' },
      },
    },
  })
  async getModerationStats() {
    return this.adminModerationService.getModerationStats();
  }

  @Post('reviews/:id/moderate')
  @ApiOperation({
    summary: 'Moderate a review (approve, reject, edit, delete)',
  })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @ApiResponse({ status: 200, description: 'Review moderated successfully' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  @HttpCode(HttpStatus.OK)
  async moderateReview(
    @Param('id', ParseIntPipe) id: number,
    @Body() actionDto: ReviewModerationActionDto,
    @Request() req: any,
  ) {
    return this.adminModerationService.moderateReview(
      id,
      actionDto,
      req.user.id,
    );
  }

  @Post('reviews/bulk-moderate')
  @ApiOperation({ summary: 'Perform bulk moderation on multiple reviews' })
  @ApiResponse({ status: 200, description: 'Bulk moderation completed' })
  @HttpCode(HttpStatus.OK)
  async bulkModerateReviews(
    @Body() bulkActionDto: BulkModerationDto,
    @Request() req: any,
  ) {
    return this.adminModerationService.bulkModerateReviews(
      bulkActionDto,
      req.user.id,
    );
  }

  @Post('reports')
  @ApiOperation({ summary: 'Report content for moderation' })
  @ApiResponse({ status: 201, description: 'Content reported successfully' })
  @ApiResponse({ status: 404, description: 'Content not found' })
  async reportContent(
    @Body() reportDto: ReportContentDto,
    @Request() req: any,
  ) {
    return this.adminModerationService.reportContent(reportDto, req.user.id);
  }

  @Get('reports')
  @ApiOperation({ summary: 'Get all moderation reports' })
  @ApiResponse({
    status: 200,
    description: 'Moderation reports retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        reports: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              content_type: { type: 'string' },
              content_id: { type: 'number' },
              reason: { type: 'string' },
              details: { type: 'string' },
              status: { type: 'string' },
              reporter_name: { type: 'string' },
              moderator_name: { type: 'string' },
              created_at: { type: 'number' },
              resolved_at: { type: 'number' },
            },
          },
        },
        pagination: {
          type: 'object',
          properties: {
            currentPage: { type: 'number' },
            totalPages: { type: 'number' },
            totalItems: { type: 'number' },
          },
        },
      },
    },
  })
  async getModerationReports(@Query() query: ModerationReportQueryDto) {
    return this.adminModerationService.getModerationReports(query);
  }

  @Put('reports/:id/process')
  @ApiOperation({ summary: 'Process a moderation report' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  @ApiResponse({ status: 200, description: 'Report processed successfully' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  async processReport(
    @Param('id', ParseIntPipe) id: number,
    @Body() actionDto: ContentModerationActionDto,
    @Request() req: any,
  ) {
    return this.adminModerationService.processContentReport(
      id,
      actionDto,
      req.user.id,
    );
  }
}
