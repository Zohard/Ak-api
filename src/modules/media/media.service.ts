import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { ImageKitService } from './imagekit.service';
import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs/promises';

@Injectable()
export class MediaService {
  constructor(
    private prisma: PrismaService,
    private imagekitService: ImageKitService,
  ) {}

  private readonly allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
  ];

  async uploadImage(
    file: Express.Multer.File,
    type: 'anime' | 'manga' | 'avatar' | 'cover',
    relatedId?: number,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only images are allowed.',
      );
    }

    // Generate unique filename
    const fileExtension = path.extname(file.originalname);
    const filename = `${type}_${Date.now()}_${Math.random().toString(36).substring(7)}${fileExtension}`;

    try {
      // Process image with Sharp
      const processedImage = await this.processImage(file.buffer, type);

      // Upload to ImageKit
      const folderPath = `images/${type}s`; // images/animes, images/mangas, etc.
      const uploadResult = await this.imagekitService.uploadImage(
        processedImage,
        filename,
        folderPath
      );

      // Save to database
      const result = await this.prisma.$queryRaw`
        INSERT INTO ak_screenshots (url_screen, id_titre, type, upload_date)
        VALUES (${uploadResult.name}, ${relatedId || 0}, ${this.getTypeId(type)}, NOW())
        RETURNING id_screen
      `;

      return {
        id: (result as any[])[0]?.id_screen,
        filename: uploadResult.name,
        originalName: file.originalname,
        size: processedImage.length,
        type,
        url: uploadResult.url,
        relatedId,
        imagekitFileId: uploadResult.fileId,
      };
    } catch (error) {
      throw error;
    }
  }

  async getMediaById(id: number) {
    const media = await this.prisma.$queryRaw`
      SELECT
        id_screen as id,
        url_screen as filename,
        id_titre as related_id,
        type,
        upload_date
      FROM ak_screenshots
      WHERE id_screen = ${id}
    `;

    if (!media || (media as any[]).length === 0) {
      throw new NotFoundException('Media not found');
    }

    const result = (media as any[])[0];
    const typeName = this.getTypeName(result.type);

    // Check if it's an ImageKit URL or filename
    let url: string;
    if (result.filename.startsWith('https://ik.imagekit.io/')) {
      url = result.filename;
    } else {
      // Generate ImageKit URL from filename
      const folderPath = `images/${typeName}s`;
      url = this.imagekitService.getImageUrl(`${folderPath}/${result.filename}`);
    }

    return {
      id: Number(result.id),
      filename: result.filename,
      relatedId: Number(result.related_id),
      type: typeName,
      uploadDate: result.upload_date,
      url: url,
    };
  }

  async getMediaByRelatedId(relatedId: number, type: 'anime' | 'manga') {
    const typeId = this.getTypeId(type);
    const media = await this.prisma.$queryRaw`
      SELECT
        id_screen as id,
        url_screen as filename,
        upload_date
      FROM ak_screenshots
      WHERE id_titre = ${relatedId} AND type = ${typeId}
      ORDER BY upload_date DESC
    `;

    // Convert database results to use ImageKit URLs
    const processedMedia: any[] = [];

    for (const item of media as any[]) {
      try {
        let url: string;
        let cleanFilename: string;

        // Handle different filename formats
        if (item.filename.startsWith('screenshots/')) {
          cleanFilename = item.filename.replace(/^screenshots\//, '');
        } else {
          cleanFilename = item.filename;
        }

        // Check if it's already an ImageKit URL
        if (item.filename.startsWith('https://ik.imagekit.io/')) {
          url = item.filename;
        } else {
          // Generate ImageKit URL from filename
          const folderPath = `images/${type}s`;
          url = this.imagekitService.getImageUrl(`${folderPath}/${cleanFilename}`);
        }

        processedMedia.push({
          id: Number(item.id),
          filename: cleanFilename,
          uploadDate: item.upload_date,
          url: url,
        });
      } catch (error) {
        console.error('Error processing media item:', error);
        continue;
      }
    }

    return processedMedia;
  }

  async deleteMedia(id: number, userId: number) {
    const media = await this.getMediaById(id);

    // Delete file from filesystem
    const filePath = path.join(this.uploadPath, media.filename);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.warn('File not found on filesystem:', error.message);
    }

    // Delete from database
    await this.prisma.$executeRaw`
      DELETE FROM ak_screenshots WHERE id_screen = ${id}
    `;

    return { message: 'Media deleted successfully' };
  }

  private async processImage(buffer: Buffer, type: string): Promise<Buffer> {
    let processor = sharp(buffer);

    // Get image metadata
    const metadata = await processor.metadata();

    // Define size constraints based on type
    const sizeConstraints = {
      avatar: { width: 150, height: 150 },
      cover: { width: 400, height: 600 },
      anime: { width: 800, height: 600 },
      manga: { width: 400, height: 600 },
    };

    const constraints = sizeConstraints[type] || sizeConstraints.anime;

    // Resize if image is larger than constraints
    if (
      metadata.width > constraints.width ||
      metadata.height > constraints.height
    ) {
      processor = processor.resize(constraints.width, constraints.height, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Optimize and convert to WebP for better compression
    return processor.webp({ quality: 85 }).toBuffer();
  }


  private getTypeId(type: string): number {
    const typeMap = {
      anime: 1,
      manga: 2,
      avatar: 3,
      cover: 4,
    };
    return typeMap[type] || 1;
  }

  private getTypeName(typeId: number): string {
    const typeMap = {
      1: 'anime',
      2: 'manga',
      3: 'avatar',
      4: 'cover',
    };
    return typeMap[typeId] || 'anime';
  }

  async getUploadStats() {
    const stats = await this.prisma.$queryRaw`
      SELECT 
        type,
        COUNT(*) as count,
        MAX(upload_date) as latest_upload
      FROM ak_screenshots 
      GROUP BY type
      ORDER BY type
    `;

    return (stats as any[]).map((stat) => ({
      type: this.getTypeName(stat.type),
      count: Number(stat.count),
      latestUpload: stat.latest_upload,
    }));
  }

  // TODO: Add external image proxy/caching system later

  async generatePlaceholder(type: 'anime' | 'manga' | 'article', filename: string) {
    // Generate a simple placeholder image using Sharp
    const width = type === 'anime' ? 400 : type === 'article' ? 600 : 300;
    const height = type === 'anime' ? 300 : type === 'article' ? 400 : 450;
    
    // Extract title from filename (remove extension and numbers)
    const title = filename
      .replace(/\.[^/.]+$/, '') // Remove extension
      .replace(/-\d+-\d+$/, '') // Remove ID numbers
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const placeholderText = title.length > 20 ? title.substring(0, 20) + '...' : title;

    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f0f0f0" stroke="#ddd" stroke-width="2"/>
        <text x="50%" y="40%" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#666">
          ${type.toUpperCase()}
        </text>
        <text x="50%" y="60%" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#999">
          ${placeholderText}
        </text>
        <text x="50%" y="80%" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#ccc">
          Image not available
        </text>
      </svg>
    `;

    const buffer = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();

    return {
      buffer,
      contentType: 'image/png',
    };
  }

  async serveImage(type: string, filename: string) {
    // Generate ImageKit URL and return redirect information
    const folderPath = `images/${type}s`;
    const imageUrl = this.imagekitService.getImageUrl(`${folderPath}/${filename}`);

    return {
      redirect: true,
      url: imageUrl,
    };
  }
}
