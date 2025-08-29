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
    @Body('type') type: 'anime' | 'manga' | 'avatar' | 'cover',
    @Body('relatedId') relatedId?: string,
    @CurrentUser() user?: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!type) {
      throw new BadRequestException('Media type is required');
    }

    const validTypes = ['anime', 'manga', 'avatar', 'cover'];
    if (!validTypes.includes(type)) {
      throw new BadRequestException(
        'Invalid media type. Must be one of: anime, manga, avatar, cover',
      );
    }

    const parsedRelatedId = relatedId ? parseInt(relatedId, 10) : undefined;
    if (relatedId && parsedRelatedId && isNaN(parsedRelatedId)) {
      throw new BadRequestException('Invalid relatedId. Must be a number');
    }

    return this.mediaService.uploadImage(file, type, parsedRelatedId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get media by ID' })
  @ApiResponse({ status: 200, description: 'Media found' })
  @ApiResponse({ status: 404, description: 'Media not found' })
  async getMediaById(@Param('id', ParseIntPipe) id: number) {
    return this.mediaService.getMediaById(id);
  }

  @Get('content/:relatedId')
  @ApiOperation({ summary: 'Get media by related content ID' })
  @ApiResponse({ status: 200, description: 'Media list retrieved' })
  async getMediaByContentId(
    @Param('relatedId', ParseIntPipe) relatedId: number,
    @Query('type') type: 'anime' | 'manga' = 'anime',
  ) {
    if (!['anime', 'manga'].includes(type)) {
      throw new BadRequestException('Type must be either anime or manga');
    }

    return this.mediaService.getMediaByRelatedId(relatedId, type);
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
    @Body('type') type: 'anime' | 'manga' | 'avatar' | 'cover',
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

      res.set({
        'Content-Type': result.contentType,
        'Cache-Control': 'public, max-age=31536000', // 1 year cache
        ETag: result.etag,
      });

      return res.send(result.buffer);
    } catch (error) {
      throw new NotFoundException('Image not found');
    }
  }

  // TODO: Add external image proxy endpoint later
}