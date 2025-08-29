import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs/promises';

@Injectable()
export class MediaService {
  constructor(private prisma: PrismaService) {}

  private readonly uploadPath = './uploads';
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

    // Ensure upload directory exists
    await this.ensureUploadDirectory();

    // Generate unique filename
    const fileExtension = path.extname(file.originalname);
    const filename = `${type}_${Date.now()}_${Math.random().toString(36).substring(7)}${fileExtension}`;
    const filePath = path.join(this.uploadPath, filename);

    try {
      // Process and save image with Sharp
      const processedImage = await this.processImage(file.buffer, type);
      await fs.writeFile(filePath, processedImage);

      // Save to database
      const result = await this.prisma.$queryRaw`
        INSERT INTO ak_screenshots (url_screen, id_titre, type, upload_date)
        VALUES (${filename}, ${relatedId || 0}, ${this.getTypeId(type)}, NOW())
        RETURNING id_screen
      `;

      return {
        id: (result as any[])[0]?.id_screen,
        filename,
        originalName: file.originalname,
        size: processedImage.length,
        type,
        url: `/uploads/${filename}`,
        relatedId,
      };
    } catch (error) {
      // Clean up file if database insert fails
      try {
        await fs.unlink(filePath);
      } catch (unlinkError) {
        console.error('Failed to clean up file:', unlinkError);
      }
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
    return {
      id: Number(result.id),
      filename: result.filename,
      relatedId: Number(result.related_id),
      type: this.getTypeName(result.type),
      uploadDate: result.upload_date,
      url: `/uploads/${result.filename}`,
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

    // Filter files and check if they exist in the new organized directory structure
    const existingMedia: any[] = [];
    
    for (const item of media as any[]) {
      try {
        let filePath: string;
        let cleanFilename: string;
        let urlPath: string;
        
        // Handle different path structures - prioritize new structure
        if (item.filename.startsWith('screenshots/')) {
          // Database has 'screenshots/filename.jpg' - could be legacy
          cleanFilename = item.filename.replace(/^screenshots\//, '');
        } else {
          cleanFilename = item.filename;
        }
        
        // Try to find file in prioritized order
        const searchPaths = [
          // 1. NEW STRUCTURE: type-specific screenshots directory
          { path: path.join(this.uploadPath, type, 'screenshots', cleanFilename), url: `${type}/screenshots/${cleanFilename}` },
          // 2. Type-specific cover directory
          { path: path.join(this.uploadPath, type, cleanFilename), url: `${type}/${cleanFilename}` },
          // 3. LEGACY: screenshots directory
          { path: path.join(this.uploadPath, 'screenshots', cleanFilename), url: `screenshots/${cleanFilename}` },
          // 4. Root uploads directory
          { path: path.join(this.uploadPath, cleanFilename), url: cleanFilename }
        ];
        
        let found = false;
        for (const searchOption of searchPaths) {
          try {
            await fs.access(searchOption.path);
            
            // File exists, add to results
            existingMedia.push({
              id: Number(item.id),
              filename: cleanFilename,
              uploadDate: item.upload_date,
              url: `/uploads/${searchOption.url}`,
              actualPath: searchOption.path // For debugging
            });
            
            found = true;
            break;
          } catch {
            continue;
          }
        }
        
        if (!found) {
          // File doesn't exist anywhere, skip it
          console.warn(`Screenshot file not found: ${item.filename}`);
          continue;
        }
      } catch (error) {
        // Error checking file, skip it
        console.error('Error processing media item:', error);
        continue;
      }
    }
    
    return existingMedia;
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

  private async ensureUploadDirectory() {
    try {
      await fs.access(this.uploadPath);
    } catch {
      await fs.mkdir(this.uploadPath, { recursive: true });
    }
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
    // Try different locations based on file structure - prioritizing new organized structure
    let filePath: string;
    
    // 1. NEW STRUCTURE: Try type-specific screenshots directory first (uploads/anime/screenshots/, uploads/manga/screenshots/)
    if (type === 'anime' || type === 'manga') {
      filePath = path.join(this.uploadPath, type, 'screenshots', filename);
      try {
        await fs.access(filePath);
        // Found in new screenshot structure, return immediately
      } catch {
        // 2. Try type-specific cover directory (uploads/anime/, uploads/manga/)
        filePath = path.join(this.uploadPath, type, filename);
        try {
          await fs.access(filePath);
        } catch {
          // 3. LEGACY: Try old screenshots directory (uploads/screenshots/)
          filePath = path.join(this.uploadPath, 'screenshots', filename);
          try {
            await fs.access(filePath);
          } catch {
            // 4. Try root uploads directory
            filePath = path.join(this.uploadPath, filename);
            try {
              await fs.access(filePath);
            } catch {
              // 5. Handle files with subdirectory paths in filename
              const baseFilename = path.basename(filename);
              if (baseFilename !== filename) {
                // Try all locations with base filename
                const searchPaths = [
                  path.join(this.uploadPath, type, 'screenshots', baseFilename),
                  path.join(this.uploadPath, type, baseFilename),
                  path.join(this.uploadPath, 'screenshots', baseFilename),
                  path.join(this.uploadPath, baseFilename)
                ];
                
                let found = false;
                for (const searchPath of searchPaths) {
                  try {
                    await fs.access(searchPath);
                    filePath = searchPath;
                    found = true;
                    break;
                  } catch {
                    continue;
                  }
                }
                
                if (!found) {
                  throw new NotFoundException('Image not found');
                }
              } else {
                throw new NotFoundException('Image not found');
              }
            }
          }
        }
      }
    } else {
      // For other types (avatar, cover), keep original logic
      filePath = path.join(this.uploadPath, type, filename);
      try {
        await fs.access(filePath);
      } catch {
        filePath = path.join(this.uploadPath, filename);
        try {
          await fs.access(filePath);
        } catch {
          throw new NotFoundException('Image not found');
        }
      }
    }

    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filename).toLowerCase();

    // Determine content type
    let contentType = 'image/jpeg'; // default
    switch (ext) {
      case '.png':
        contentType = 'image/png';
        break;
      case '.gif':
        contentType = 'image/gif';
        break;
      case '.webp':
        contentType = 'image/webp';
        break;
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
    }

    // Generate ETag for caching
    const crypto = require('crypto');
    const etag = crypto.createHash('md5').update(buffer).digest('hex');

    return {
      buffer,
      contentType,
      etag,
    };
  }
}
