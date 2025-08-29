import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
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
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../../common/guards/admin.guard';
import { CommentsService } from '../comments.service';
import { UpdateCommentDto } from '../dto/update-comment.dto';
import { CommentQueryDto } from '../dto/comment-query.dto';
import { ModerateCommentDto } from '../dto/moderate-comment.dto';

@ApiTags('Admin - Comments')
@Controller('admin/comments')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminCommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all comments (including pending moderation)' })
  @ApiResponse({ status: 200, description: 'Comments retrieved successfully' })
  findAll(@Query() query: CommentQueryDto) {
    // Allow admins to see all comments
    return this.commentsService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get comments statistics' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  getStats() {
    return this.commentsService.getStats();
  }

  @Get('pending')
  @ApiOperation({ summary: 'Get comments pending moderation' })
  @ApiResponse({
    status: 200,
    description: 'Pending comments retrieved successfully',
  })
  getPending(@Query() query: CommentQueryDto) {
    query.status = 'pending';
    return this.commentsService.findAll(query);
  }

  @Get('spam')
  @ApiOperation({ summary: 'Get rejected/spam comments' })
  @ApiResponse({
    status: 200,
    description: 'Spam comments retrieved successfully',
  })
  getSpam(@Query() query: CommentQueryDto) {
    query.status = 'rejected';
    return this.commentsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get comment by ID (Admin)' })
  @ApiResponse({ status: 200, description: 'Comment retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.commentsService.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a comment (Admin)' })
  @ApiResponse({ status: 200, description: 'Comment updated successfully' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCommentDto: UpdateCommentDto,
    @Request() req,
  ) {
    return this.commentsService.update(
      id,
      updateCommentDto,
      req.user.sub,
      true,
    );
  }

  @Patch(':id/moderate')
  @ApiOperation({ summary: 'Moderate a comment (approve/reject)' })
  @ApiResponse({ status: 200, description: 'Comment moderated successfully' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  moderate(
    @Param('id', ParseIntPipe) id: number,
    @Body() moderateDto: ModerateCommentDto,
    @Request() req,
  ) {
    return this.commentsService.moderate(id, moderateDto, req.user.sub, true);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a comment (Admin only)' })
  @ApiResponse({ status: 200, description: 'Comment deleted successfully' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.commentsService.remove(id, req.user.sub, true);
  }

  @Post('bulk-moderate')
  @ApiOperation({ summary: 'Bulk moderate comments' })
  @ApiResponse({ status: 200, description: 'Comments moderated successfully' })
  async bulkModerate(
    @Body() body: { commentIds: number[]; status: string; reason?: string },
  ) {
    const { commentIds, status, reason } = body;
    return this.commentsService.bulkModerate(commentIds, status, reason);
  }

  @Post('bulk-delete')
  @ApiOperation({ summary: 'Bulk delete comments (Admin only)' })
  @ApiResponse({ status: 200, description: 'Comments deleted successfully' })
  async bulkDelete(@Body() body: { commentIds: number[] }, @Request() req) {
    const { commentIds } = body;
    const results: Array<{ id: number; status: string; message: string }> = [];

    for (const commentId of commentIds) {
      try {
        await this.commentsService.remove(commentId, req.user.sub, true);
        results.push({ id: commentId, status: 'success', message: 'Deleted' });
      } catch (error) {
        results.push({
          id: commentId,
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
