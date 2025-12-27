import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
  HttpStatus,
  Res,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { MediaService } from './media.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Media')
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload image file' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid file or missing parameters',
  })
  @ApiBearerAuth()
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type: 'anime' | 'manga' | 'avatar' | 'cover' | 'game' | 'business',
    @Body('relatedId') relatedId?: string,
    @Body('isScreenshot') isScreenshot?: string,
    @CurrentUser() user?: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!type) {
      throw new BadRequestException('Media type is required');
    }

    const validTypes = ['anime', 'manga', 'avatar', 'cover', 'game', 'business'];
    if (!validTypes.includes(type)) {
      throw new BadRequestException(
        'Invalid media type. Must be one of: anime, manga, avatar, cover, game, business',
      );
    }

    const parsedRelatedId = relatedId ? parseInt(relatedId, 10) : undefined;
    if (relatedId && parsedRelatedId && isNaN(parsedRelatedId)) {
      throw new BadRequestException('Invalid relatedId. Must be a number');
    }

    const isScreenshotBool = isScreenshot === 'true' || isScreenshot === '1';

    return this.mediaService.uploadImage(file, type, parsedRelatedId, isScreenshotBool);
  }

  @Get('url-metadata')
  @ApiOperation({ summary: 'Fetch URL metadata (Open Graph, Twitter Cards)' })
  @ApiResponse({ status: 200, description: 'URL metadata retrieved' })
  @ApiResponse({ status: 400, description: 'Invalid URL' })
  async getUrlMetadata(@Query('url') url: string) {
    if (!url) {
      throw new BadRequestException('URL parameter is required');
    }

    return this.mediaService.fetchUrlMetadata(url);
  }

  @Get('admin/stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Get media upload statistics (Admin only)' })
  @ApiResponse({ status: 200, description: 'Upload statistics retrieved' })
  @ApiBearerAuth()
  async getUploadStats() {
    return this.mediaService.getUploadStats();
  }

  @Post('admin/bulk-upload')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @UseInterceptors(FileInterceptor('files'))
  @ApiOperation({ summary: 'Bulk upload images (Admin only)' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Bulk upload completed' })
  @ApiBearerAuth()
  async bulkUpload(
    @UploadedFile() files: Express.Multer.File | Express.Multer.File[],
    @Body('type') type: 'anime' | 'manga' | 'avatar' | 'cover' | 'game' | 'business',
    @CurrentUser() user: any,
  ) {
    const fileArray = Array.isArray(files) ? files : files ? [files] : [];

    if (fileArray.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    const results: Array<{
      status: 'success' | 'error';
      result?: any;
      error?: string;
      filename?: string;
    }> = [];
    for (const file of fileArray) {
      try {
        const result = await this.mediaService.uploadImage(file, type);
        results.push({ status: 'success', result });
      } catch (error) {
        results.push({
          status: 'error',
          error: error.message,
          filename: file.originalname,
        });
      }
    }

    return {
      message: 'Bulk upload completed',
      results,
      successCount: results.filter((r) => r.status === 'success').length,
      errorCount: results.filter((r) => r.status === 'error').length,
    };
  }

  @Post('upload-from-url')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upload image from external URL' })
  @ApiResponse({ status: 201, description: 'Image uploaded successfully from URL' })
  @ApiResponse({ status: 400, description: 'Invalid URL or parameters' })
  @ApiBearerAuth()
  async uploadImageFromUrl(
    @Body('imageUrl') imageUrl: string,
    @Body('type') type: 'anime' | 'manga' | 'avatar' | 'cover' | 'game' | 'business',
    @Body('relatedId') relatedId?: number,
    @Body('saveAsScreenshot') saveAsScreenshot?: boolean,
    @Body('title') title?: string,
  ) {
    if (!imageUrl || !imageUrl.trim()) {
      throw new BadRequestException('Image URL is required');
    }

    if (!['anime', 'manga', 'avatar', 'cover', 'game', 'business'].includes(type)) {
      throw new BadRequestException('Invalid type. Must be anime, manga, avatar, cover, game, or business');
    }

    return this.mediaService.uploadImageFromUrl(imageUrl, type, relatedId, saveAsScreenshot, title);
  }

  @Get('serve/:type/:filename')
  @ApiOperation({ summary: 'Serve image file' })
  @ApiResponse({ status: 200, description: 'Image file served' })
  @ApiResponse({ status: 404, description: 'Image not found' })
  async serveImage(
    @Param('type') type: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    try {
      const result = await this.mediaService.serveImage(type, filename);

      if (result.redirect) {
        return res.redirect(result.url);
      }

      // This case is not currently used since serveImage always returns redirect
      throw new NotFoundException('Image not found');
    } catch (error) {
      throw new NotFoundException('Image not found');
    }
  }

  @Get('content/:relatedId')
  @ApiOperation({ summary: 'Get media by related content ID' })
  @ApiResponse({ status: 200, description: 'Media list retrieved' })
  async getMediaByContentId(
    @Param('relatedId', ParseIntPipe) relatedId: number,
    @Query('type') type: 'anime' | 'manga' | 'game' | 'jeu-video' = 'anime',
  ) {
    if (!['anime', 'manga', 'game', 'jeu-video'].includes(type)) {
      throw new BadRequestException('Type must be anime, manga, or game/jeu-video');
    }

    // Map 'jeu-video' to 'game' for internal use
    const serviceType = type === 'jeu-video' ? 'game' : type;
    return this.mediaService.getMediaByRelatedId(relatedId, serviceType as 'anime' | 'manga' | 'game');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get media by ID' })
  @ApiResponse({ status: 200, description: 'Media found' })
  @ApiResponse({ status: 404, description: 'Media not found' })
  async getMediaById(@Param('id', ParseIntPipe) id: number) {
    return this.mediaService.getMediaById(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete media file' })
  @ApiResponse({ status: 200, description: 'Media deleted successfully' })
  @ApiResponse({ status: 404, description: 'Media not found' })
  @ApiBearerAuth()
  async deleteMedia(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.mediaService.deleteMedia(id, user.id);
  }
}