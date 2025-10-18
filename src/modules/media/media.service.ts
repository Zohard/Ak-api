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
    type: 'anime' | 'manga' | 'avatar' | 'cover',
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

    // Generate unique filename
    const fileExtension = path.extname(file.originalname);
    const filename = `${type}_${Date.now()}_${Math.random().toString(36).substring(7)}${fileExtension}`;

    try {
      // Process image with Sharp
      const processedImage = await this.processImage(file.buffer, type);

      // Upload to ImageKit
      // For screenshots, upload to screenshots/ subfolder
      const folderPath = isScreenshot
        ? `images/${type}s/screenshots`
        : `images/${type}s`;

      const uploadResult = await this.imagekitService.uploadImage(
        processedImage,
        filename,
        folderPath
      );

      // Save to database with screenshots/ prefix if it's a screenshot
      const dbFilename = isScreenshot ? `screenshots/${uploadResult.name}` : uploadResult.name;

      const result = await this.prisma.$queryRaw`
        INSERT INTO ak_screenshots (url_screen, id_titre, type, upload_date)
        VALUES (${dbFilename}, ${relatedId || 0}, ${this.getTypeId(type)}, NOW())
        RETURNING id_screen
      `;

      return {
        id: (result as any[])[0]?.id_screen,
        filename: dbFilename,
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

        // Check if it's already an ImageKit URL
        if (item.filename.startsWith('https://ik.imagekit.io/')) {
          url = item.filename;
        } else {
          // Generate ImageKit URL from filename
          // If filename starts with screenshots/, the full path is images/{type}s/{filename}
          // Otherwise, it's images/{type}s/{filename}
          const basePath = `images/${type}s`;
          const fullPath = `${basePath}/${item.filename}`;
          url = this.imagekitService.getImageUrl(fullPath);
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
