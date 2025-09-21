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
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { ArticlePermissionsGuard } from '../guards/article-permissions.guard';
import {
  CanWriteArticles,
  CanEditArticles,
  CanPublishArticles,
  CanDeleteArticles,
  CanManageCategories,
} from '../decorators/article-permissions.decorator';
import { ArticlesService } from '../articles.service';
import { CreateArticleDto } from '../dto/create-article.dto';
import { UpdateArticleDto } from '../dto/update-article.dto';
import { ArticleQueryDto } from '../dto/article-query.dto';
import { PublishArticleDto } from '../dto/publish-article.dto';
import {
  ImportImageDto,
  BulkImportImagesDto,
  ImportImageKitDto,
  BulkImportImageKitDto
} from '../dto/import-image.dto';

@ApiTags('Admin - Articles')
@Controller('admin/articles')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Post()
  @UseGuards(ArticlePermissionsGuard)
  @CanWriteArticles()
  @ApiOperation({ summary: 'Create a new article (Admin)' })
  @ApiResponse({ status: 201, description: 'Article created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  create(@Body() createArticleDto: CreateArticleDto, @Request() req) {
    return this.articlesService.create(createArticleDto, req.user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Get all articles (including drafts)' })
  @ApiResponse({ status: 200, description: 'Articles retrieved successfully' })
  findAll(@Query() query: ArticleQueryDto, @Request() req) {
    // Allow admins to see all articles regardless of status
    if (!req.user.isAdmin && query.status === 'all') {
      // Non-admin users can only see their own articles or published ones
      query.authorId = req.user.sub;
    }
    return this.articlesService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get articles statistics' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  getStats() {
    return this.articlesService.getStats();
  }

  @Get('drafts')
  @ApiOperation({ summary: 'Get draft articles' })
  @ApiResponse({
    status: 200,
    description: 'Draft articles retrieved successfully',
  })
  getDrafts(@Query() query: ArticleQueryDto, @Request() req) {
    query.status = 'draft';
    if (!req.user.isAdmin) {
      query.authorId = req.user.sub; // Non-admins can only see their own drafts
    }
    return this.articlesService.findAll(query);
  }

  @Get('pending-publication')
  @UseGuards(ArticlePermissionsGuard)
  @CanPublishArticles()
  @ApiOperation({ summary: 'Get articles pending publication' })
  @ApiResponse({
    status: 200,
    description: 'Pending articles retrieved successfully',
  })
  getPendingPublication(@Query() query: ArticleQueryDto) {
    query.status = 'draft';
    return this.articlesService.findAll(query);
  }

  @Get('my-articles')
  @ApiOperation({ summary: 'Get current user articles' })
  @ApiResponse({
    status: 200,
    description: 'User articles retrieved successfully',
  })
  getMyArticles(@Query() query: ArticleQueryDto, @Request() req) {
    query.authorId = req.user.sub;
    return this.articlesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get article by ID (Admin)' })
  @ApiResponse({ status: 200, description: 'Article retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.articlesService.getById(id);
  }

  @Patch(':id')
  @UseGuards(ArticlePermissionsGuard)
  @CanEditArticles()
  @ApiOperation({ summary: 'Update an article (Admin)' })
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
      req.user.sub,
      req.user.isAdmin,
    );
  }

  @Patch(':id/publish')
  @UseGuards(ArticlePermissionsGuard)
  @CanPublishArticles()
  @ApiOperation({ summary: 'Publish or unpublish an article (Admin)' })
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
      req.user.sub,
      req.user.isAdmin,
    );
  }

  @Get('featured')
  @UseGuards(ArticlePermissionsGuard)
  @CanPublishArticles()
  @ApiOperation({ summary: 'Get featured articles management' })
  @ApiResponse({
    status: 200,
    description: 'Featured articles retrieved successfully',
  })
  getFeaturedManagement(@Query('limit') limit?: number) {
    return this.articlesService.getFeaturedArticles(limit || 10);
  }

  @Post(':id/feature')
  @UseGuards(ArticlePermissionsGuard)
  @CanPublishArticles()
  @ApiOperation({ summary: 'Feature an article on homepage' })
  @ApiResponse({ status: 200, description: 'Article featured successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  featureArticle(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { order?: number },
  ) {
    return this.articlesService.featureArticle(id, body.order);
  }

  @Delete(':id/feature')
  @UseGuards(ArticlePermissionsGuard)
  @CanPublishArticles()
  @ApiOperation({ summary: 'Unfeature an article from homepage' })
  @ApiResponse({ status: 200, description: 'Article unfeatured successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  unfeatureArticle(@Param('id', ParseIntPipe) id: number) {
    return this.articlesService.unfeatureArticle(id);
  }

  @Patch('featured/reorder')
  @UseGuards(ArticlePermissionsGuard)
  @CanPublishArticles()
  @ApiOperation({ summary: 'Reorder featured articles' })
  @ApiResponse({
    status: 200,
    description: 'Featured articles reordered successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  reorderFeatured(
    @Body() body: { articles: Array<{ articleId: number; order: number }> },
  ) {
    return this.articlesService.reorderFeaturedArticles(body.articles);
  }

  @Delete(':id')
  @UseGuards(ArticlePermissionsGuard)
  @CanDeleteArticles()
  @ApiOperation({ summary: 'Delete an article (Admin only)' })
  @ApiResponse({ status: 200, description: 'Article deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.articlesService.remove(id, req.user.sub, req.user.isAdmin);
  }

  @Post('bulk-publish')
  @UseGuards(ArticlePermissionsGuard)
  @CanPublishArticles()
  @ApiOperation({ summary: 'Bulk publish articles' })
  @ApiResponse({ status: 200, description: 'Articles published successfully' })
  async bulkPublish(
    @Body() body: { articleIds: number[]; publish: boolean },
    @Request() req,
  ) {
    const { articleIds, publish } = body;
    const results: Array<{
      id: number;
      status: string;
      data?: any;
      message?: string;
    }> = [];

    for (const articleId of articleIds) {
      try {
        const result = await this.articlesService.publish(
          articleId,
          { publish },
          req.user.sub,
          req.user.isAdmin,
        );
        results.push({ id: articleId, status: 'success', data: result });
      } catch (error) {
        results.push({
          id: articleId,
          status: 'error',
          message: error.message,
        });
      }
    }

    return {
      message: 'Bulk operation completed',
      results,
    };
  }

  @Post('bulk-delete')
  @UseGuards(ArticlePermissionsGuard)
  @CanDeleteArticles()
  @ApiOperation({ summary: 'Bulk delete articles (Admin only)' })
  @ApiResponse({ status: 200, description: 'Articles deleted successfully' })
  async bulkDelete(@Body() body: { articleIds: number[] }, @Request() req) {
    const { articleIds } = body;
    const results: Array<{ id: number; status: string; message: string }> = [];

    for (const articleId of articleIds) {
      try {
        await this.articlesService.remove(
          articleId,
          req.user.sub,
          req.user.isAdmin,
        );
        results.push({ id: articleId, status: 'success', message: 'Deleted' });
      } catch (error) {
        results.push({
          id: articleId,
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

  @Post(':id/images/import-url')
  @UseGuards(ArticlePermissionsGuard)
  @CanEditArticles()
  @ApiOperation({ summary: 'Import image from URL and upload to ImageKit' })
  @ApiResponse({ status: 201, description: 'Image imported and uploaded successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  importImageFromUrl(
    @Param('id', ParseIntPipe) id: number,
    @Body() importImageDto: ImportImageDto,
  ) {
    return this.articlesService.importImageFromUrl(
      id,
      importImageDto.imageUrl,
      importImageDto.customFileName
    );
  }

  @Post(':id/images/import-imagekit')
  @UseGuards(ArticlePermissionsGuard)
  @CanEditArticles()
  @ApiOperation({ summary: 'Associate existing ImageKit file with article' })
  @ApiResponse({ status: 201, description: 'ImageKit file associated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  importImageKitFile(
    @Param('id', ParseIntPipe) id: number,
    @Body() importImageKitDto: ImportImageKitDto,
  ) {
    return this.articlesService.importImageKitFile(id, importImageKitDto.imagePath);
  }

  @Post(':id/images/bulk-import-urls')
  @UseGuards(ArticlePermissionsGuard)
  @CanEditArticles()
  @ApiOperation({ summary: 'Bulk import images from URLs and upload to ImageKit' })
  @ApiResponse({ status: 201, description: 'Images imported and uploaded successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  bulkImportImagesFromUrls(
    @Param('id', ParseIntPipe) id: number,
    @Body() bulkImportDto: BulkImportImagesDto,
  ) {
    return this.articlesService.bulkImportImagesFromUrls(id, bulkImportDto.imageUrls);
  }

  @Post(':id/images/bulk-import-imagekit')
  @UseGuards(ArticlePermissionsGuard)
  @CanEditArticles()
  @ApiOperation({ summary: 'Bulk associate existing ImageKit files with article' })
  @ApiResponse({ status: 201, description: 'ImageKit files associated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  bulkImportImageKitFiles(
    @Param('id', ParseIntPipe) id: number,
    @Body() bulkImportImageKitDto: BulkImportImageKitDto,
  ) {
    return this.articlesService.bulkImportImageKitFiles(id, bulkImportImageKitDto.imagePaths);
  }

  @Get(':id/images')
  @ApiOperation({ summary: 'Get images for article' })
  @ApiResponse({ status: 200, description: 'Images retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  getArticleImages(@Param('id', ParseIntPipe) id: number) {
    return this.articlesService.getArticleImages(id);
  }

  @Delete('images/:imageId')
  @UseGuards(ArticlePermissionsGuard)
  @CanEditArticles()
  @ApiOperation({ summary: 'Remove image from article' })
  @ApiResponse({ status: 200, description: 'Image removed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Image not found' })
  removeImage(@Param('imageId', ParseIntPipe) imageId: number) {
    return this.articlesService.removeImage(imageId);
  }
}
