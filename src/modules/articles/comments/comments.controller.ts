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
  HttpCode,
  HttpStatus,
  Ip,
  Headers,
  Optional,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentQueryDto } from './dto/comment-query.dto';

@ApiTags('Comments')
@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new comment' })
  @ApiResponse({ status: 201, description: 'Comment created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  @ApiResponse({ status: 400, description: 'Invalid comment or spam detected' })
  create(
    @Body() createCommentDto: CreateCommentDto,
    @Request() req,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.commentsService.create(
      createCommentDto,
      req.user?.sub,
      ip,
      userAgent,
    );
  }

  @Post('anonymous')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a comment anonymously (requires moderation)',
  })
  @ApiResponse({ status: 201, description: 'Comment submitted for moderation' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  @ApiResponse({ status: 400, description: 'Invalid comment or spam detected' })
  createAnonymous(
    @Body() createCommentDto: CreateCommentDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    // Validate required fields for anonymous comments
    if (!createCommentDto.nom || !createCommentDto.email) {
      throw new Error('Name and email are required for anonymous comments');
    }

    return this.commentsService.create(
      createCommentDto,
      undefined,
      ip,
      userAgent,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get approved comments' })
  @ApiResponse({ status: 200, description: 'Comments retrieved successfully' })
  findAll(@Query() query: CommentQueryDto) {
    // Force status to 'approved' for public endpoint
    query.status = 'approved';
    return this.commentsService.findAll(query);
  }

  @Get('article/:articleId')
  @ApiOperation({ summary: 'Get comments for a specific article' })
  @ApiResponse({ status: 200, description: 'Comments retrieved successfully' })
  getByArticle(
    @Param('articleId', ParseIntPipe) articleId: number,
    @Query() query: CommentQueryDto,
  ) {
    query.status = 'approved';
    query.articleId = articleId;
    return this.commentsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get comment by ID' })
  @ApiResponse({ status: 200, description: 'Comment retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.commentsService.getById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a comment (own comments only)' })
  @ApiResponse({ status: 200, description: 'Comment updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your comment' })
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
      req.user.isAdmin,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a comment (own comments only)' })
  @ApiResponse({ status: 204, description: 'Comment deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your comment' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.commentsService.remove(id, req.user.sub, req.user.isAdmin);
  }
}
