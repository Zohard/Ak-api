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
  HttpStatus, Put,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { ArticlePermissionsGuard } from './guards/article-permissions.guard';
import {
  CanWriteArticles,
  CanEditArticles,
  CanPublishArticles,
} from './decorators/article-permissions.decorator';
import { ArticlesService } from './articles.service';
import { CommentsService } from './comments/comments.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { ArticleQueryDto } from './dto/article-query.dto';
import { PublishArticleDto } from './dto/publish-article.dto';
import { CreateCommentDto } from './comments/dto/create-comment.dto';
import { UpdateCommentDto } from './comments/dto/update-comment.dto';
import { CommentQueryDto } from './comments/dto/comment-query.dto';

@ApiTags('Articles')
@Controller('articles')
export class ArticlesController {
  constructor(
    private readonly articlesService: ArticlesService,
    private readonly commentsService: CommentsService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, ArticlePermissionsGuard)
  @CanWriteArticles()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new article' })
  @ApiResponse({ status: 201, description: 'Article created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  create(@Body() createArticleDto: CreateArticleDto, @Request() req) {
    return this.articlesService.create(createArticleDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all published articles' })
  @ApiResponse({ status: 200, description: 'Articles retrieved successfully' })
  findAll(@Query() query: ArticleQueryDto) {
    // Force status to 'published' for public endpoint
    query.status = 'published';
    return this.articlesService.findAll(query);
  }

  @Get('featured')
  @ApiOperation({ summary: 'Get featured articles' })
  @ApiResponse({
    status: 200,
    description: 'Featured articles retrieved successfully',
  })
  getFeatured(@Query('limit') limit?: number) {
    return this.articlesService.getFeaturedArticles(limit || 5);
  }

  @Get('category/:categoryId')
  @ApiOperation({ summary: 'Get articles by category' })
  @ApiResponse({ status: 200, description: 'Articles retrieved successfully' })
  getByCategory(
    @Param('categoryId', ParseIntPipe) categoryId: number,
    @Query() query: ArticleQueryDto,
  ) {
    query.status = 'published';
    query.categoryId = categoryId;
    return this.articlesService.findAll(query);
  }

  @Get('author/:authorId')
  @ApiOperation({ summary: 'Get articles by author' })
  @ApiResponse({ status: 200, description: 'Articles retrieved successfully' })
  getByAuthor(
    @Param('authorId', ParseIntPipe) authorId: number,
    @Query() query: ArticleQueryDto,
  ) {
    query.status = 'published';
    query.authorId = authorId;
    return this.articlesService.findAll(query);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search articles' })
  @ApiResponse({
    status: 200,
    description: 'Search results retrieved successfully',
  })
  search(@Query() query: ArticleQueryDto) {
    query.status = 'published';
    return this.articlesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get article by ID' })
  @ApiResponse({ status: 200, description: 'Article retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.articlesService.getById(id);
  }

  @Get('slug/:niceUrl')
  @ApiOperation({ summary: 'Get article by URL slug' })
  @ApiResponse({ status: 200, description: 'Article retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  findBySlug(@Param('niceUrl') niceUrl: string) {
    return this.articlesService.getByNiceUrl(niceUrl);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, ArticlePermissionsGuard)
  @CanEditArticles()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an article' })
  @ApiResponse({ status: 200, description: 'Article updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateArticleDto: UpdateArticleDto,
    @Request() req,
  ) {
    return this.articlesService.update(
      id,
      updateArticleDto,
      req.user.id,
      req.user.isAdmin,
    );
  }

  @Patch(':id/publish')
  @UseGuards(JwtAuthGuard, ArticlePermissionsGuard)
  @CanPublishArticles()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish or unpublish an article' })
  @ApiResponse({
    status: 200,
    description: 'Article publication status updated',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  publish(
    @Param('id', ParseIntPipe) id: number,
    @Body() publishDto: PublishArticleDto,
    @Request() req,
  ) {
    return this.articlesService.publish(
      id,
      publishDto,
      req.user.id,
      req.user.isAdmin,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, ArticlePermissionsGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an article (Admin only)' })
  @ApiResponse({ status: 204, description: 'Article deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.articlesService.remove(id, req.user.id, req.user.isAdmin);
  }

  @Post(':id/view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track article view (increment view counter)' })
  @ApiResponse({ status: 200, description: 'View tracked successfully' })
  trackView(@Param('id', ParseIntPipe) id: number) {
    // This endpoint just increments the view counter
    // The actual increment happens in getById method
    return this.articlesService
      .getById(id, false)
      .then(() => ({ success: true }));
  }

  // ============ COMMENTS ENDPOINTS ============

  @Get(':id/comments')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get comments for a specific article' })
  @ApiResponse({ status: 200, description: 'Comments retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  getArticleComments(
    @Param('id', ParseIntPipe) articleId: number,
    @Query() query: CommentQueryDto,
    @Request() req,
  ) {
    query.status = 'approved';
    query.articleId = articleId;
    // Include private fields (email, moderation, ip) if user is admin
    const includePrivateFields = req.user?.isAdmin || false;
    // Pass user ID if authenticated (optional - no guard required)
    const userId = req.user?.id;
    return this.commentsService.findAll(query, includePrivateFields, userId);
  }

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a comment on an article' })
  @ApiResponse({ status: 201, description: 'Comment created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  @ApiResponse({ status: 400, description: 'Invalid comment or spam detected' })
  createArticleComment(
    @Param('id', ParseIntPipe) articleId: number,
    @Body() createCommentDto: CreateCommentDto,
    @Request() req,
  ) {
    // Ensure the articleId in the DTO matches the URL param
    createCommentDto.articleId = articleId;
    return this.commentsService.create(
      createCommentDto,
      req.user?.id,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Put('comments/:commentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a comment by ID' })
  @ApiResponse({ status: 200, description: 'Comment updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  updateCommentById(
    @Param('commentId', ParseIntPipe) commentId: number,
    @Body() updateCommentDto: UpdateCommentDto,
    @Request() req,
  ) {
    return this.commentsService.update(
      commentId,
      updateCommentDto,
      req.user?.id,
      req.user?.isAdmin,
    );
  }
}
