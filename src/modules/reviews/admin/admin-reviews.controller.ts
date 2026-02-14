import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { ModerationGuard } from '../../../common/guards/moderation.guard';
import { ReviewsService } from '../reviews.service';
import { ModerateReviewDto } from '../dto/moderate-review.dto';
import { ReviewQueryDto } from '../dto/review-query.dto';

@ApiTags('Admin - Reviews')
@Controller('admin/reviews')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all reviews (including drafts and rejected)' })
  @ApiResponse({ status: 200, description: 'Reviews retrieved successfully' })
  findAll(@Query() query: ReviewQueryDto) {
    // For admin: show all reviews regardless of status unless a specific status is requested
    // Pass skipDefaultStatusFilter=true to bypass the default statut=0 filter
    return this.reviewsService.findAll(query, true);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get reviews statistics' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  getStats() {
    return this.reviewsService.getStats();
  }

  @Get('rejected')
  @ApiOperation({ summary: 'Get rejected reviews' })
  @ApiResponse({
    status: 200,
    description: 'Rejected reviews retrieved successfully',
  })
  getRejected(@Query() query: ReviewQueryDto) {
    query.statut = 2; // Status 2 = rejected by moderation
    return this.reviewsService.findAll(query);
  }

  @Get('pending-reReview')
  @ApiOperation({ summary: 'Get reviews pending re-review (resubmitted after rejection)' })
  @ApiResponse({
    status: 200,
    description: 'Pending re-review reviews retrieved successfully',
  })
  getPendingReReview(@Query() query: ReviewQueryDto) {
    query.statut = 3; // Status 3 = pending re-review (requires moderator approval)
    return this.reviewsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get review by ID (Admin)' })
  @ApiResponse({ status: 200, description: 'Review retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.reviewsService.findOne(id);
  }

  @Patch(':id/moderate')
  @UseGuards(JwtAuthGuard, ModerationGuard)
  @ApiOperation({ summary: 'Moderate a review (approve/reject) - Moderators only' })
  @ApiResponse({ status: 200, description: 'Review moderated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - moderation rights required' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  moderate(
    @Param('id', ParseIntPipe) id: number,
    @Body() moderateDto: ModerateReviewDto,
    @Request() req,
  ) {
    return this.reviewsService.moderate(id, moderateDto, req.user.id, true);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a review (Admin only)' })
  @ApiResponse({ status: 200, description: 'Review deleted successfully' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.reviewsService.remove(id, req.user.id, true);
  }

  @Post('bulk-moderate')
  @UseGuards(JwtAuthGuard, ModerationGuard)
  @ApiOperation({ summary: 'Bulk moderate reviews - Moderators only' })
  @ApiResponse({ status: 200, description: 'Reviews moderated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - moderation rights required' })
  async bulkModerate(
    @Body() body: { reviewIds: number[]; action: string; reason?: string },
  ) {
    const { reviewIds, action, reason } = body;
    return this.reviewsService.bulkModerate(reviewIds, action, reason);
  }

  @Post('bulk-delete')
  @ApiOperation({ summary: 'Bulk delete reviews (Admin only)' })
  @ApiResponse({ status: 200, description: 'Reviews deleted successfully' })
  async bulkDelete(@Body() body: { reviewIds: number[] }, @Request() req) {
    const { reviewIds } = body;
    const results: Array<{ id: number; status: string; message: string }> = [];

    for (const reviewId of reviewIds) {
      try {
        await this.reviewsService.remove(reviewId, req.user.id, true);
        results.push({ id: reviewId, status: 'success', message: 'Deleted' });
      } catch (error) {
        results.push({
          id: reviewId,
          status: 'error',
          message: error.message,
        });
      }
    }

    return {
      message: 'Bulk delete completed',
      results,
    };
  }
}
