import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { ImageKitService } from './imagekit.service';
import { slugify } from '../../shared/utils/text.util';
import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs/promises';
import axios from 'axios';
import * as cheerio from 'cheerio';

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
    type: 'anime' | 'manga' | 'avatar' | 'cover' | 'game' | 'business',
    relatedId?: number,
    isScreenshot?: boolean,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only images are allowed.',
      );
    }

    // Validate relatedId for screenshots to prevent orphaned images
    if (isScreenshot && !relatedId) {
      throw new BadRequestException('Related ID is required for screenshots');
    }

    // Generate unique filename
    const fileExtension = path.extname(file.originalname);
    let filename = `${type}_${Date.now()}_${Math.random().toString(36).substring(7)}${fileExtension}`;

    // For game screenshots, use the game title in the filename
    if (isScreenshot && type === 'game' && relatedId) {
      try {
        const game = await this.prisma.akJeuxVideo.findUnique({
          where: { idJeu: relatedId },
          select: { titre: true }
        });

        if (game?.titre) {
          const safeTitle = slugify(game.titre);
          const timestamp = Date.now();
          filename = `${safeTitle}-${timestamp}${fileExtension}`;
        }
      } catch (error) {
        console.error('Failed to fetch game title for filename:', error);
        // Fall back to default filename if fetch fails
      }
    }

    let uploadResult: any = null;

    try {
      // Process image with Sharp
      const processedImage = await this.processImage(file.buffer, type);

      // Upload to ImageKit
      // For screenshots, upload to screenshots/ subfolder
      // Handle special cases for folder names
      let typeFolder: string;
      if (type === 'game') {
        typeFolder = 'games';
      } else if (type === 'business') {
        typeFolder = 'business';
      } else {
        typeFolder = `${type}s`;
      }
      const folderPath = isScreenshot
        ? `images/${typeFolder}/screenshots`
        : `images/${typeFolder}`;

      uploadResult = await this.imagekitService.uploadImage(
        processedImage,
        filename,
        folderPath
      );

      // Save to database based on type
      if (isScreenshot && relatedId) {
        try {
          let result: any;
          let screenshotId: number;

          if (type === 'game') {
            // Save to ak_jeux_video_screenshots for games
            result = await this.prisma.akJeuxVideoScreenshot.create({
              data: {
                jeuVideoId: relatedId,
                filename: uploadResult.name,
                caption: null,
                sortorder: 0,
                createdat: new Date(),
              },
            });
            screenshotId = result.id;
          } else if (type === 'anime' || type === 'manga') {
            // Save to ak_screenshots for anime/manga
            const dbFilename = `screenshots/${uploadResult.name}`;
            const queryResult = await this.prisma.$queryRaw`
              INSERT INTO ak_screenshots (url_screen, id_titre, type, upload_date)
              VALUES (${dbFilename}, ${relatedId}, ${this.getTypeId(type)}, NOW())
              RETURNING id_screen
            `;
            screenshotId = (queryResult as any[])[0]?.id_screen;
          } else {
            throw new BadRequestException(`Screenshot upload not supported for type: ${type}`);
          }

          return {
            id: screenshotId,
            filename: uploadResult.name,
            originalName: file.originalname,
            size: processedImage.length,
            type,
            url: uploadResult.url,
            relatedId,
            imagekitFileId: uploadResult.fileId,
          };
        } catch (dbError) {
          // Database save failed - delete the uploaded file from ImageKit to prevent orphaned files
        console.error('[MediaService] Database save failed, deleting ImageKit file:', {
          fileId: uploadResult.fileId,
          filename: uploadResult.name,
          folder: folderPath,
          dbError: dbError.message,
        });

        try {
          await this.imagekitService.deleteImage(uploadResult.fileId);
          console.log('[MediaService] Successfully deleted orphaned ImageKit file:', uploadResult.fileId);
        } catch (deleteError) {
          console.error('[MediaService] ⚠️ ORPHANED FILE - Manual cleanup needed:', {
            fileId: uploadResult.fileId,
            filename: uploadResult.name,
            folder: folderPath,
            deleteError: deleteError.message,
          });
          console.error('[MediaService] Run: npm run cleanup-images:dry-run');
          // Log this for manual cleanup but don't fail the operation
        }

          throw new BadRequestException(`Failed to save image metadata: ${dbError.message}`);
        }
      } else {
        // For non-screenshot uploads (covers, avatars, etc.), just return the upload result
        return {
          filename: uploadResult.name,
          originalName: file.originalname,
          size: processedImage.length,
          type,
          url: uploadResult.url,
          relatedId,
          imagekitFileId: uploadResult.fileId,
        };
      }
    } catch (error) {
      // If it's already a BadRequestException, re-throw it
      if (error instanceof BadRequestException) {
        throw error;
      }

      // If we have an uploadResult but something else failed, try to clean up
      if (uploadResult && uploadResult.fileId) {
        try {
          await this.imagekitService.deleteImage(uploadResult.fileId);
          console.log('[MediaService] Cleaned up ImageKit file after upload error:', uploadResult.fileId);
        } catch (deleteError) {
          console.error('[MediaService] Failed to cleanup ImageKit file:', deleteError);
        }
      }

      throw new BadRequestException(`Image upload failed: ${error.message}`);
    }
  }

  async uploadImageFromUrl(
    imageUrl: string,
    type: 'anime' | 'manga' | 'avatar' | 'cover' | 'game' | 'business',
    relatedId?: number,
    saveAsScreenshot: boolean = false,
  ) {
    try {
      // Download the image from the URL
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 second timeout
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.data) {
        throw new BadRequestException('Failed to download image from URL');
      }

      // Detect image type from Content-Type header
      const contentType = response.headers['content-type'] || 'image/jpeg';
      if (!this.allowedMimeTypes.includes(contentType)) {
        throw new BadRequestException(
          `Invalid image type: ${contentType}. Only JPEG, PNG, WebP, and GIF are allowed.`,
        );
      }

      // Generate filename
      const extension = contentType.split('/')[1] || 'jpg';
      let filename = `${type}_${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;

      // Use title + timestamp for anime, manga, and game
      if (relatedId && (type === 'anime' || type === 'manga' || type === 'game')) {
        try {
          let title: string | null = null;

          if (type === 'anime') {
            const anime = await this.prisma.akAnime.findUnique({
              where: { idAnime: relatedId },
              select: { titre: true }
            });
            title = anime?.titre;
          } else if (type === 'manga') {
            const manga = await this.prisma.akManga.findUnique({
              where: { idManga: relatedId },
              select: { titre: true }
            });
            title = manga?.titre;
          } else if (type === 'game') {
            const game = await this.prisma.akJeuxVideo.findUnique({
              where: { idJeu: relatedId },
              select: { titre: true }
            });
            title = game?.titre;
          }

          if (title) {
            const safeTitle = slugify(title);
            const timestamp = Date.now();
            filename = `${safeTitle}-${timestamp}.${extension}`;
          }
        } catch (error) {
          console.error('Failed to fetch title for filename:', error);
          // Fall back to default filename if fetch fails
        }
      }

      // Process image with Sharp
      const processedImage = await this.processImage(Buffer.from(response.data), type);

      // Upload to ImageKit
      let typeFolder: string;
      if (type === 'game') {
        typeFolder = 'games';
      } else if (type === 'business') {
        typeFolder = 'business';
      } else {
        typeFolder = `${type}s`;
      }
      const folderPath = `images/${typeFolder}`;

      const uploadResult = await this.imagekitService.uploadImage(
        processedImage,
        filename,
        folderPath
      );

      // Save to database as screenshot ONLY if explicitly requested
      if (relatedId && saveAsScreenshot) {
        try {
          let result: any;
          let screenshotId: number;

          if (type === 'game') {
            // Save to ak_jeux_video_screenshots for games
            result = await this.prisma.akJeuxVideoScreenshot.create({
              data: {
                jeuVideoId: relatedId,
                filename: uploadResult.name,
                caption: null,
                sortorder: 0,
                createdat: new Date(),
              },
            });
            screenshotId = result.id;
          } else if (type === 'anime' || type === 'manga') {
            // Save to ak_screenshots for anime/manga
            const queryResult = await this.prisma.$queryRaw`
              INSERT INTO ak_screenshots (url_screen, id_titre, type, upload_date)
              VALUES (${uploadResult.name}, ${relatedId}, ${this.getTypeId(type)}, NOW())
              RETURNING id_screen
            `;
            screenshotId = (queryResult as any[])[0]?.id_screen;
          } else {
            throw new BadRequestException(`Screenshot upload not supported for type: ${type}`);
          }

          return {
            id: screenshotId,
            filename: uploadResult.name,
            size: processedImage.length,
            type,
            url: uploadResult.url,
            relatedId,
            imagekitFileId: uploadResult.fileId,
          };
        } catch (dbError) {
          // Database save failed - delete the uploaded file from ImageKit
          console.error('[MediaService] Database save failed, deleting ImageKit file:', {
            fileId: uploadResult.fileId,
            filename: uploadResult.name,
            dbError: dbError.message,
          });

          try {
            await this.imagekitService.deleteImage(uploadResult.fileId);
          } catch (deleteError) {
            console.error('[MediaService] Failed to cleanup ImageKit file:', deleteError);
          }

          throw new BadRequestException(`Failed to save image metadata: ${dbError.message}`);
        }
      }

      // No screenshot save - just return upload result
      return {
        filename: uploadResult.name,
        size: processedImage.length,
        type,
        url: uploadResult.url,
        imagekitFileId: uploadResult.fileId,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      // Handle axios errors
      if (error.code === 'ECONNABORTED') {
        throw new BadRequestException('Image download timeout. URL may be unreachable.');
      }

      if (error.response) {
        throw new BadRequestException(
          `Failed to download image: ${error.response.status} ${error.response.statusText}`,
        );
      }

      throw new BadRequestException(`Image upload from URL failed: ${error.message}`);
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
      // Database stores: "screenshots/filename.jpg" or just "filename.jpg"
      // For screenshots, ensure they're in the screenshots subfolder
      let imagePath = result.filename;

      // If filename doesn't already have screenshots/ prefix, add it for type 1 (anime) and 2 (manga)
      if (!imagePath.startsWith('screenshots/') && (result.type === 1 || result.type === 2)) {
        imagePath = `screenshots/${imagePath}`;
      }

      // ImageKit path should be: "/images/animes/screenshots/filename.jpg"
      const fullPath = `/images/${typeName}s/${imagePath}`;
      url = this.imagekitService.getImageUrl(fullPath);
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

  async getMediaByRelatedId(relatedId: number, type: 'anime' | 'manga' | 'game') {
    const typeId = this.getTypeId(type);
    let media: any[] = [];

    // For games, query both the old ak_screenshots table AND the new ak_jeux_video_screenshots table
    if (type === 'game') {
      // Query old screenshots table
      const oldScreenshots = await this.prisma.$queryRaw`
        SELECT
          id_screen as id,
          url_screen as filename,
          upload_date
        FROM ak_screenshots
        WHERE id_titre = ${relatedId} AND type = ${typeId}
        ORDER BY upload_date DESC
      `;

      // Query new jeux video screenshots table
      const newScreenshots = await this.prisma.akJeuxVideoScreenshot.findMany({
        where: { jeuVideoId: relatedId },
        select: {
          id: true,
          filename: true,
          createdat: true,
          sortorder: true,
        },
        orderBy: { sortorder: 'asc' }
      });

      // Combine both results, converting new screenshots to same format
      media = [
        ...oldScreenshots as any[],
        ...newScreenshots.map(s => ({
          id: s.id,
          filename: s.filename,
          upload_date: s.createdat,
        }))
      ];
    } else {
      // For anime and manga, use old table only
      media = await this.prisma.$queryRaw`
        SELECT
          id_screen as id,
          url_screen as filename,
          upload_date
        FROM ak_screenshots
        WHERE id_titre = ${relatedId} AND type = ${typeId}
        ORDER BY upload_date DESC
      ` as any[];
    }

    // Convert database results to use ImageKit URLs
    const processedMedia: any[] = [];

    for (const item of media) {
      try {
        let url: string;

        // Check if it's already an ImageKit URL
        if (item.filename && item.filename.startsWith('https://ik.imagekit.io/')) {
          url = item.filename;
        } else if (item.filename) {
          // Generate ImageKit URL from filename
          // Database stores: "screenshots/filename.jpg" or just "filename.jpg"
          // For screenshots, ensure they're in the screenshots subfolder
          let imagePath = item.filename;

          // If filename doesn't already have screenshots/ prefix, add it for type 1 (anime) and 2 (manga)
          if (!imagePath.startsWith('screenshots/') && (typeId === 1 || typeId === 2)) {
            imagePath = `screenshots/${imagePath}`;
          }

          // For games from ak_jeux_video_screenshots, they're already in images/games/screenshots/
          // ImageKit path should be: "/images/games/screenshots/filename.jpg"
          let fullPath: string;
          if (type === 'game') {
            // Check if filename already includes full path
            if (imagePath.startsWith('images/')) {
              fullPath = `/${imagePath}`;
            } else {
              fullPath = `/images/games/screenshots/${imagePath}`;
            }
          } else {
            // For anime/manga: "/images/animes/screenshots/filename.jpg" or "/images/mangas/screenshots/filename.jpg"
            fullPath = `/images/${type}s/${imagePath}`;
          }

          url = this.imagekitService.getImageUrl(fullPath);
        } else {
          // Skip items without filename
          continue;
        }

        processedMedia.push({
          id: Number(item.id),
          filename: item.filename,
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

    // TODO: Implement ImageKit file deletion if needed
    // Files are now stored on ImageKit, not locally

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
      game: { width: 800, height: 600 },
      business: { width: 400, height: 400 },
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
      game: 5,
      business: 6,
    };
    return typeMap[type] || 1;
  }

  private getTypeName(typeId: number): string {
    const typeMap = {
      1: 'anime',
      2: 'manga',
      3: 'avatar',
      4: 'cover',
      5: 'game',
      6: 'business',
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

  async fetchUrlMetadata(url: string) {
    try {
      // Validate URL
      const urlObj = new URL(url);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new BadRequestException('Invalid URL protocol. Only HTTP(S) allowed');
      }

      // Check if URL is Twitter/X and use oEmbed API
      if (this.isTwitterUrl(url)) {
        return await this.fetchTwitterMetadata(url);
      }

      // Fetch the page with timeout
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AnimeKun/1.0; +https://anime-kun.fr)',
        },
        maxRedirects: 5,
      });

      const html = response.data;
      const $ = cheerio.load(html);

      // Extract Open Graph tags
      const og = {
        title: $('meta[property="og:title"]').attr('content'),
        description: $('meta[property="og:description"]').attr('content'),
        image: $('meta[property="og:image"]').attr('content'),
        url: $('meta[property="og:url"]').attr('content'),
        type: $('meta[property="og:type"]').attr('content'),
        siteName: $('meta[property="og:site_name"]').attr('content'),
      };

      // Extract Twitter Card tags as fallback
      const twitter = {
        card: $('meta[name="twitter:card"]').attr('content'),
        title: $('meta[name="twitter:title"]').attr('content'),
        description: $('meta[name="twitter:description"]').attr('content'),
        image: $('meta[name="twitter:image"]').attr('content'),
      };

      // Extract standard meta tags as final fallback
      const fallback = {
        title: $('title').text(),
        description: $('meta[name="description"]').attr('content'),
        favicon: $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href'),
      };

      // Build metadata object with priority: OG > Twitter > Fallback
      const metadata = {
        url: og.url || url,
        title: og.title || twitter.title || fallback.title || 'No title',
        description: og.description || twitter.description || fallback.description || '',
        image: og.image || twitter.image || null,
        favicon: fallback.favicon || null,
        siteName: og.siteName || urlObj.hostname,
        type: og.type || 'website',
      };

      // Make image URLs absolute if they're relative
      if (metadata.image && !metadata.image.startsWith('http')) {
        metadata.image = new URL(metadata.image, url).href;
      }
      if (metadata.favicon && !metadata.favicon.startsWith('http')) {
        metadata.favicon = new URL(metadata.favicon, url).href;
      }

      return metadata;
    } catch (error) {
      if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
        throw new BadRequestException('Unable to fetch URL. The site may be down or unreachable');
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      // Return minimal metadata on error
      return {
        url,
        title: url,
        description: '',
        image: null,
        favicon: null,
        siteName: new URL(url).hostname,
        type: 'website',
        error: 'Failed to fetch metadata',
      };
    }
  }

  private isTwitterUrl(url: string): boolean {
    const urlObj = new URL(url);
    return urlObj.hostname === 'twitter.com' ||
           urlObj.hostname === 'www.twitter.com' ||
           urlObj.hostname === 'x.com' ||
           urlObj.hostname === 'www.x.com' ||
           urlObj.hostname === 'fxtwitter.com' ||
           urlObj.hostname === 'vxtwitter.com' ||
           urlObj.hostname === 'fixupx.com';
  }

  private async fetchTwitterMetadata(url: string) {
    try {
      const urlObj = new URL(url);

      // Extract username and tweet ID for API call
      const tweetMatch = url.match(/(?:twitter\.com|x\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com)\/([^\/]+)\/status\/(\d+)/);

      if (!tweetMatch) {
        throw new Error('Invalid Twitter URL format');
      }

      const [, username, tweetId] = tweetMatch;

      // Try fxtwitter API first
      try {
        const apiUrl = `https://api.fxtwitter.com/${username}/status/${tweetId}`;
        const apiResponse = await axios.get(apiUrl, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; AnimeKun/1.0; +https://anime-kun.fr)',
            'Accept': 'application/json',
          },
        });

        const tweet = apiResponse.data?.tweet;
        if (tweet) {
          // Extract media (photos, videos, gifs)
          const media = tweet.media;
          let image = null;
          let video = null;

          if (media) {
            if (media.photos && media.photos.length > 0) {
              image = media.photos[0].url;
            }
            if (media.videos && media.videos.length > 0) {
              video = media.videos[0].url;
            }
            if (media.all && media.all.length > 0) {
              // Try to get the first video/gif or image
              const firstMedia = media.all[0];
              if (firstMedia.type === 'video' || firstMedia.type === 'gif') {
                video = firstMedia.url;
              } else if (firstMedia.type === 'photo') {
                image = firstMedia.url;
              }
            }
          }

          return {
            url: url,
            title: `${tweet.author?.name || username}`,
            description: tweet.text || '',
            image: image || null,
            video: video || null,
            favicon: 'https://abs.twimg.com/favicons/twitter.3.ico',
            siteName: 'X',
            type: 'article',
          };
        }
      } catch (apiError) {
        console.warn('FxTwitter API failed, falling back to HTML scraping:', apiError.message);
      }

      // Fallback to HTML scraping
      let fetchUrl = url;
      if (urlObj.hostname === 'twitter.com' || urlObj.hostname === 'x.com' ||
          urlObj.hostname === 'www.twitter.com' || urlObj.hostname === 'www.x.com') {
        fetchUrl = url.replace(/(twitter\.com|x\.com)/, 'fxtwitter.com');
      }

      const response = await axios.get(fetchUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        maxRedirects: 5,
      });

      const html = response.data;
      const $ = cheerio.load(html);

      // Extract Open Graph tags
      const og = {
        title: $('meta[property="og:title"]').attr('content'),
        description: $('meta[property="og:description"]').attr('content'),
        image: $('meta[property="og:image"]').attr('content'),
        video: $('meta[property="og:video"]').attr('content'),
        type: $('meta[property="og:type"]').attr('content'),
        siteName: $('meta[property="og:site_name"]').attr('content'),
      };

      // Extract Twitter Card tags
      const twitter = {
        card: $('meta[name="twitter:card"]').attr('content'),
        image: $('meta[name="twitter:image"]').attr('content'),
        player: $('meta[name="twitter:player"]').attr('content'),
      };

      const hasVideo = og.video || twitter.player;
      const mediaImage = og.image || twitter.image;

      return {
        url: url,
        title: og.title || 'Tweet',
        description: og.description || '',
        image: mediaImage || null,
        video: hasVideo ? (og.video || twitter.player) : null,
        favicon: 'https://abs.twimg.com/favicons/twitter.3.ico',
        siteName: og.siteName || 'X',
        type: og.type || 'article',
      };
    } catch (error) {
      console.error('Error fetching Twitter metadata:', error.message || error);
      // Fallback
      return {
        url,
        title: 'Tweet',
        description: '',
        image: null,
        favicon: 'https://abs.twimg.com/favicons/twitter.3.ico',
        siteName: 'X',
        type: 'article',
      };
    }
  }
}
