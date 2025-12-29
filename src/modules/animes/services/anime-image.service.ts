import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { JikanService } from '../../jikan/jikan.service';
import { ImageKitService } from '../../media/imagekit.service';
import axios from 'axios';
import * as crypto from 'crypto';

export interface ImageUpdateResult {
  success: boolean;
  imageUrl: string;
  source: 'jikan' | 'url' | 'upload';
  message: string;
}

export interface BatchImageResult {
  animeId: number;
  titre: string;
  success: boolean;
  imageUrl?: string;
  source?: 'jikan' | 'url' | 'upload';
  error?: string;
}

@Injectable()
export class AnimeImageService {
  private readonly logger = new Logger(AnimeImageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jikanService: JikanService,
    private readonly imageKitService: ImageKitService,
  ) {}

  /**
   * Get list of animes without images
   */
  async getAnimesWithoutImage(page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const where = {
      OR: [
        { image: null },
        { image: '' },
      ],
    };

    const [animes, total] = await Promise.all([
      this.prisma.akAnime.findMany({
        where,
        skip,
        take: limit,
        select: {
          idAnime: true,
          titre: true,
          titreOrig: true,
          titreFr: true,
          annee: true,
          format: true,
          statut: true,
          dateAjout: true,
        },
        orderBy: [
          { dateAjout: 'desc' },
          { idAnime: 'desc' },
        ],
      }),
      this.prisma.akAnime.count({ where }),
    ]);

    return {
      animes: animes.map(anime => ({
        id: anime.idAnime,
        titre: anime.titre,
        titre_orig: anime.titreOrig,
        titre_fr: anime.titreFr,
        annee: anime.annee,
        format: anime.format,
        statut: anime.statut,
        dateAjout: anime.dateAjout,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Batch process animes without images from Jikan
   * AI Orchestrator friendly - processes multiple animes and returns detailed results
   */
  async batchUpdateImagesFromJikan(
    animeIds?: number[],
    limit = 10,
  ): Promise<{ results: BatchImageResult[]; summary: { total: number; success: number; failed: number } }> {
    let targetAnimes: any[];

    // If no anime IDs provided, get animes without images
    if (!animeIds || animeIds.length === 0) {
      const result = await this.getAnimesWithoutImage(1, limit);
      targetAnimes = result.animes;
    } else {
      // Get specific animes
      targetAnimes = await this.prisma.akAnime.findMany({
        where: { idAnime: { in: animeIds } },
        select: {
          idAnime: true,
          titre: true,
          titreOrig: true,
          titreFr: true,
          annee: true,
        },
      });
    }

    const results: BatchImageResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    // Process each anime sequentially to respect rate limits
    for (const anime of targetAnimes) {
      const animeId = anime.id || anime.idAnime;
      const titre = anime.titre;

      try {
        this.logger.log(`[Batch ${animeId}] Processing image for "${titre}"`);

        const result = await this.updateImageFromJikan(animeId);

        results.push({
          animeId,
          titre,
          success: true,
          imageUrl: result.imageUrl,
          source: result.source,
        });
        successCount++;

        this.logger.log(`[Batch ${animeId}] ✓ Success for "${titre}"`);

        // Small delay between requests to avoid overwhelming APIs
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (error: any) {
        this.logger.error(`[Batch ${animeId}] ✗ Failed for "${titre}": ${error.message}`);

        results.push({
          animeId,
          titre,
          success: false,
          error: error.message || 'Unknown error',
        });
        failedCount++;

        // Continue processing even if one fails
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return {
      results,
      summary: {
        total: results.length,
        success: successCount,
        failed: failedCount,
      },
    };
  }

  /**
   * Auto-update image for an anime (tries Jikan automatically)
   * Simplified AI orchestrator endpoint
   */
  async autoUpdateImage(animeId: number): Promise<ImageUpdateResult> {
    this.logger.log(`[Auto-update] Processing anime ${animeId}`);

    // Try Jikan first (most reliable source)
    try {
      return await this.updateImageFromJikan(animeId);
    } catch (error: any) {
      this.logger.error(`[Auto-update] Failed for anime ${animeId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch image from Jikan and upload to ImageKit
   */
  async updateImageFromJikan(animeId: number): Promise<ImageUpdateResult> {
    // Get anime details
    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: animeId },
      select: {
        idAnime: true,
        titre: true,
        titreOrig: true,
        titreFr: true,
        annee: true,
        image: true,
      },
    });

    if (!anime) {
      throw new NotFoundException(`Anime with ID ${animeId} not found`);
    }

    // Try with titre_orig first, then titre, then titreFr
    const searchTitles = [
      anime.titreOrig,
      anime.titre,
      anime.titreFr,
    ].filter(Boolean);

    if (searchTitles.length === 0) {
      throw new BadRequestException('Anime has no valid title to search');
    }

    let jikanAnime = null;
    let usedTitle = '';

    // Try each title until we find a match
    for (const title of searchTitles) {
      this.logger.log(`Searching Jikan for anime with title: "${title}"`);
      jikanAnime = await this.jikanService.findBestMatch(title, anime.annee || undefined);
      if (jikanAnime) {
        usedTitle = title;
        break;
      }
    }

    if (!jikanAnime) {
      throw new NotFoundException('No matching anime found on MyAnimeList');
    }

    const imageUrl = this.jikanService.getBestImageUrl(jikanAnime);
    if (!imageUrl) {
      throw new BadRequestException('Found anime but no image available');
    }

    this.logger.log(`Found anime on MAL: ${jikanAnime.title} (ID: ${jikanAnime.mal_id})`);
    this.logger.log(`Image URL: ${imageUrl}`);

    // Download image and upload to ImageKit
    const uploadedUrl = await this.downloadAndUploadToImageKit(
      imageUrl,
      `anime_${animeId}_${Date.now()}`,
      'anime'
    );

    // Delete old ImageKit image if exists
    if (anime.image && typeof anime.image === 'string' && /imagekit\.io/.test(anime.image)) {
      try {
        await this.imageKitService.deleteImageByUrl(anime.image);
        this.logger.log(`Deleted old ImageKit image: ${anime.image}`);
      } catch (error) {
        this.logger.warn(`Failed to delete old image: ${error.message}`);
      }
    }

    // Update anime record
    await this.prisma.akAnime.update({
      where: { idAnime: animeId },
      data: { image: uploadedUrl },
    });

    return {
      success: true,
      imageUrl: uploadedUrl,
      source: 'jikan',
      message: `Successfully updated image from MyAnimeList (matched with "${usedTitle}")`,
    };
  }

  /**
   * Update image from URL
   */
  async updateImageFromUrl(animeId: number, imageUrl: string): Promise<ImageUpdateResult> {
    // Validate URL
    if (!imageUrl || !imageUrl.match(/^https?:\/\//)) {
      throw new BadRequestException('Invalid image URL');
    }

    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: animeId },
      select: { idAnime: true, image: true },
    });

    if (!anime) {
      throw new NotFoundException(`Anime with ID ${animeId} not found`);
    }

    this.logger.log(`Downloading image from URL: ${imageUrl}`);

    // Download and upload to ImageKit
    const uploadedUrl = await this.downloadAndUploadToImageKit(
      imageUrl,
      `anime_${animeId}_${Date.now()}`,
      'anime'
    );

    // Delete old ImageKit image if exists
    if (anime.image && typeof anime.image === 'string' && /imagekit\.io/.test(anime.image)) {
      try {
        await this.imageKitService.deleteImageByUrl(anime.image);
        this.logger.log(`Deleted old ImageKit image: ${anime.image}`);
      } catch (error) {
        this.logger.warn(`Failed to delete old image: ${error.message}`);
      }
    }

    // Update anime record
    await this.prisma.akAnime.update({
      where: { idAnime: animeId },
      data: { image: uploadedUrl },
    });

    return {
      success: true,
      imageUrl: uploadedUrl,
      source: 'url',
      message: 'Successfully updated image from URL',
    };
  }

  /**
   * Update image from uploaded file
   */
  async updateImageFromFile(
    animeId: number,
    file: Express.Multer.File
  ): Promise<ImageUpdateResult> {
    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: animeId },
      select: { idAnime: true, image: true },
    });

    if (!anime) {
      throw new NotFoundException(`Anime with ID ${animeId} not found`);
    }

    // Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed');
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds 10MB limit');
    }

    this.logger.log(`Uploading file: ${file.originalname} (${file.size} bytes)`);

    // Upload to ImageKit
    const fileName = `anime_${animeId}_${Date.now()}_${file.originalname}`;
    const uploadedUrl = await this.imageKitService.uploadImage(
      file.buffer,
      fileName,
      'anime'
    );

    // Delete old ImageKit image if exists
    if (anime.image && typeof anime.image === 'string' && /imagekit\.io/.test(anime.image)) {
      try {
        await this.imageKitService.deleteImageByUrl(anime.image);
        this.logger.log(`Deleted old ImageKit image: ${anime.image}`);
      } catch (error) {
        this.logger.warn(`Failed to delete old image: ${error.message}`);
      }
    }

    // Update anime record
    await this.prisma.akAnime.update({
      where: { idAnime: animeId },
      data: { image: uploadedUrl },
    });

    return {
      success: true,
      imageUrl: uploadedUrl,
      source: 'upload',
      message: 'Successfully uploaded image from file',
    };
  }

  /**
   * Helper: Download image from URL and upload to ImageKit
   */
  private async downloadAndUploadToImageKit(
    imageUrl: string,
    fileName: string,
    folder: string
  ): Promise<string> {
    try {
      // Download image
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const buffer = Buffer.from(response.data);

      // Validate image size
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (buffer.length > maxSize) {
        throw new BadRequestException('Image size exceeds 10MB limit');
      }

      // Get file extension from Content-Type or URL
      let extension = '';
      const contentType = response.headers['content-type'];
      if (contentType?.includes('jpeg') || contentType?.includes('jpg')) {
        extension = '.jpg';
      } else if (contentType?.includes('png')) {
        extension = '.png';
      } else if (contentType?.includes('webp')) {
        extension = '.webp';
      } else if (contentType?.includes('gif')) {
        extension = '.gif';
      } else {
        // Try to get from URL
        const urlExt = imageUrl.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i);
        extension = urlExt ? `.${urlExt[1]}` : '.jpg';
      }

      const finalFileName = `${fileName}${extension}`;

      // Upload to ImageKit
      const uploadedUrl = await this.imageKitService.uploadImage(buffer, finalFileName, folder);

      this.logger.log(`Successfully uploaded image to ImageKit: ${uploadedUrl}`);

      return uploadedUrl;
    } catch (error: any) {
      this.logger.error(`Failed to download/upload image: ${error.message}`);
      if (error.response?.status === 404) {
        throw new BadRequestException('Image not found at the provided URL');
      }
      if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
        throw new BadRequestException('Failed to download image: connection error');
      }
      throw new BadRequestException(`Failed to process image: ${error.message}`);
    }
  }
}
