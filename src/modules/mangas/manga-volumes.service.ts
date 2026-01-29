import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { R2Service } from '../media/r2.service';
import { MediaService } from '../media/media.service';
import { GoogleBooksService } from './google-books.service';
import { NautiljonService } from './nautiljon.service';
import { JikanService, JikanManga } from '../jikan/jikan.service';
import { slugify } from '../../shared/utils/text.util';

export interface VolumeInfo {
  volumeNumber: number;
  title?: string;
  isbn?: string;
  releaseDate?: string;
  coverUrl?: string;
  description?: string;
  publisher?: string;
  source?: 'google_books' | 'nautiljon' | 'jikan' | 'manual';
}

export interface VolumeSyncResult {
  volumeNumber: number;
  status: 'created' | 'updated' | 'skipped' | 'error';
  message?: string;
  coverUploaded?: boolean;
}

export interface MangaTitleVariants {
  original: string;
  french?: string;
  english?: string;
  japanese?: string;
  synonyms: string[];
}

@Injectable()
export class MangaVolumesService {
  private readonly logger = new Logger(MangaVolumesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly r2Service: R2Service,
    private readonly mediaService: MediaService,
    private readonly googleBooksService: GoogleBooksService,
    private readonly nautiljonService: NautiljonService,
    private readonly jikanService: JikanService,
  ) {}

  /**
   * Get all title variants for a manga using Jikan (MAL)
   * This helps find volumes with different title formats
   */
  async getMangaTitleVariants(mangaTitle: string, malId?: number): Promise<MangaTitleVariants> {
    const variants: MangaTitleVariants = {
      original: mangaTitle,
      synonyms: [],
    };

    try {
      let jikanManga: JikanManga | null = null;

      if (malId) {
        // Direct lookup by MAL ID
        jikanManga = await this.jikanService.getMangaById(malId);
      } else {
        // Search by title
        const results = await this.jikanService.searchManga(mangaTitle, 5);
        if (results.length > 0) {
          // Find best match
          const normalizedQuery = mangaTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
          jikanManga = results.find(m => {
            const normalizedTitle = m.title.toLowerCase().replace(/[^a-z0-9]/g, '');
            return normalizedTitle === normalizedQuery || normalizedTitle.includes(normalizedQuery);
          }) || results[0];
        }
      }

      if (jikanManga) {
        variants.english = jikanManga.title_english || undefined;
        variants.japanese = jikanManga.title_japanese || undefined;

        // Get all synonyms
        const allTitles = this.jikanService.getAllMangaTitles(jikanManga);
        variants.synonyms = allTitles.filter(t =>
          t !== mangaTitle &&
          t !== variants.english &&
          t !== variants.japanese
        );

        // Try to find French title in synonyms
        const frenchPatterns = ['(FR)', '(French)', '(Français)'];
        const frenchTitle = allTitles.find(t =>
          frenchPatterns.some(p => t.includes(p))
        );
        if (frenchTitle) {
          variants.french = frenchTitle.replace(/\s*\(FR\)|\(French\)|\(Français\)/i, '').trim();
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to get title variants for "${mangaTitle}": ${error.message}`);
    }

    return variants;
  }

  /**
   * Search for a specific volume info using Google Books, with Nautiljon fallback
   * Tries multiple title variants for better coverage
   */
  async searchVolumeInfo(
    mangaTitle: string,
    volumeNumber: number,
    titleVariants?: MangaTitleVariants,
  ): Promise<VolumeInfo | null> {
    const searchQueries: string[] = [];

    // Build search queries with different title formats
    const titles = titleVariants
      ? [titleVariants.original, titleVariants.french, titleVariants.english, ...titleVariants.synonyms]
      : [mangaTitle];

    const uniqueTitles = [...new Set(titles.filter(Boolean))] as string[];

    // French format searches (primary)
    for (const title of uniqueTitles.slice(0, 3)) { // Limit to avoid too many API calls
      searchQueries.push(`${title} Tome ${volumeNumber}`);
      searchQueries.push(`${title} T${volumeNumber}`);
      searchQueries.push(`${title} Vol ${volumeNumber}`);
    }

    // ===== STRATEGY 1: Google Books =====
    for (const query of searchQueries) {
      try {
        const result = await this.googleBooksService.searchVolumeByTitle(query, volumeNumber, 'fr');
        if (result && result.isbn) {
          this.logger.debug(`[Google Books] Found volume info for "${query}": ISBN ${result.isbn}`);
          return {
            ...result,
            source: 'google_books',
          };
        }
      } catch (error) {
        this.logger.warn(`[Google Books] Search failed for "${query}": ${error.message}`);
      }
    }

    // ===== STRATEGY 2: Nautiljon (French database) =====
    this.logger.debug(`[Nautiljon] Google Books failed, trying Nautiljon for ${mangaTitle} Tome ${volumeNumber}`);

    for (const title of uniqueTitles.slice(0, 2)) { // Limit Nautiljon queries
      try {
        const nautiljonResult = await this.nautiljonService.searchVolume(title, volumeNumber);
        if (nautiljonResult && (nautiljonResult.isbn || nautiljonResult.releaseDate || nautiljonResult.coverUrl)) {
          this.logger.debug(`[Nautiljon] Found volume info for "${title}": ISBN ${nautiljonResult.isbn || 'N/A'}, Date ${nautiljonResult.releaseDate || 'N/A'}`);
          return {
            volumeNumber: nautiljonResult.volumeNumber,
            title: nautiljonResult.title,
            isbn: nautiljonResult.isbn,
            releaseDate: nautiljonResult.releaseDate,
            coverUrl: nautiljonResult.coverUrl,
            description: nautiljonResult.description,
            publisher: nautiljonResult.publisher,
            source: 'nautiljon',
          };
        }
      } catch (error) {
        this.logger.warn(`[Nautiljon] Search failed for "${title}": ${error.message}`);
      }
    }

    // Fallback: return basic info without external data
    this.logger.debug(`No external data found for ${mangaTitle} Tome ${volumeNumber}`);
    return {
      volumeNumber,
      title: `Tome ${volumeNumber}`,
      source: 'manual',
    };
  }

  /**
   * Upload volume cover to R2 and save to ak_screenshots
   * Naming convention: {safe-title}-tome-{number}-{timestamp}.{ext}
   */
  async uploadVolumeCover(
    mangaId: number,
    mangaTitle: string,
    volumeNumber: number,
    coverUrl: string,
  ): Promise<{ coverPath: string; screenshotPath: string } | null> {
    if (!coverUrl || !coverUrl.startsWith('http')) {
      return null;
    }

    try {
      const timestamp = Date.now();
      const safeTitle = slugify(mangaTitle);
      const filename = `${safeTitle}-tome-${volumeNumber}-${timestamp}`;
      const folder = 'images/mangas/screenshots';

      // Upload to R2
      const uploadResult = await this.r2Service.uploadImageFromUrl(
        coverUrl,
        filename,
        folder,
      );

      if (!uploadResult || !uploadResult.name) {
        this.logger.warn(`Failed to upload cover for ${mangaTitle} Tome ${volumeNumber}`);
        return null;
      }

      // Save to ak_screenshots (type=2 for manga)
      const screenshotPath = `screenshots/${uploadResult.name}`;
      await this.prisma.$queryRaw`
        INSERT INTO ak_screenshots (url_screen, id_titre, type, upload_date)
        VALUES (${screenshotPath}, ${mangaId}, 2, NOW())
      `;

      this.logger.log(`Uploaded cover for ${mangaTitle} Tome ${volumeNumber}: ${screenshotPath}`);

      return {
        coverPath: uploadResult.url, // Full R2 URL for manga_volumes.cover_image
        screenshotPath, // Relative path for ak_screenshots
      };
    } catch (error) {
      this.logger.error(`Failed to upload cover for ${mangaTitle} Tome ${volumeNumber}: ${error.message}`);
      return null;
    }
  }

  /**
   * Sync a single volume for a manga
   */
  async syncSingleVolume(
    mangaId: number,
    mangaTitle: string,
    volumeNumber: number,
    volumeInfo?: VolumeInfo,
    uploadCover: boolean = true,
  ): Promise<VolumeSyncResult> {
    try {
      // Check if volume already exists
      const existingVolume = await this.prisma.mangaVolume.findUnique({
        where: {
          unique_manga_volume: { idManga: mangaId, volumeNumber },
        },
      });

      // Get volume info if not provided
      const info = volumeInfo || await this.searchVolumeInfo(mangaTitle, volumeNumber);

      if (!info) {
        return {
          volumeNumber,
          status: 'error',
          message: 'Could not find volume information',
        };
      }

      // Upload cover if available and requested
      let coverPath: string | null = null;
      let coverUploaded = false;

      if (uploadCover && info.coverUrl && (!existingVolume?.coverImage)) {
        const uploadResult = await this.uploadVolumeCover(
          mangaId,
          mangaTitle,
          volumeNumber,
          info.coverUrl,
        );
        if (uploadResult) {
          coverPath = uploadResult.coverPath;
          coverUploaded = true;
        }
      }

      // Prepare data for upsert
      const volumeData = {
        title: info.title || `Tome ${volumeNumber}`,
        isbn: info.isbn || undefined,
        releaseDate: info.releaseDate ? new Date(info.releaseDate) : undefined,
        description: info.description || undefined,
        coverImage: coverPath || existingVolume?.coverImage || undefined,
      };

      if (existingVolume) {
        // Update existing volume (only update fields that have new data)
        const updateData: any = {};

        if (volumeData.title && !existingVolume.title) updateData.title = volumeData.title;
        if (volumeData.isbn && !existingVolume.isbn) updateData.isbn = volumeData.isbn;
        if (volumeData.releaseDate && !existingVolume.releaseDate) updateData.releaseDate = volumeData.releaseDate;
        if (volumeData.description && !existingVolume.description) updateData.description = volumeData.description;
        if (coverPath) updateData.coverImage = coverPath;

        if (Object.keys(updateData).length > 0) {
          await this.prisma.mangaVolume.update({
            where: { idVolume: existingVolume.idVolume },
            data: updateData,
          });
          return {
            volumeNumber,
            status: 'updated',
            message: `Updated: ${Object.keys(updateData).join(', ')}`,
            coverUploaded,
          };
        }

        return {
          volumeNumber,
          status: 'skipped',
          message: 'Volume already complete',
        };
      }

      // Create new volume
      await this.prisma.mangaVolume.create({
        data: {
          idManga: mangaId,
          volumeNumber,
          ...volumeData,
        },
      });

      return {
        volumeNumber,
        status: 'created',
        coverUploaded,
      };
    } catch (error) {
      this.logger.error(`Error syncing volume ${volumeNumber} for manga ${mangaId}: ${error.message}`);
      return {
        volumeNumber,
        status: 'error',
        message: error.message,
      };
    }
  }

  /**
   * Sync all volumes for a manga
   * Uses the manga's nbVolumes count or a specified range
   */
  async syncAllVolumes(
    mangaId: number,
    options: {
      fromVolume?: number;
      toVolume?: number;
      uploadCovers?: boolean;
      force?: boolean; // Re-sync even if volumes exist
    } = {},
  ): Promise<{
    success: boolean;
    results: VolumeSyncResult[];
    summary: { created: number; updated: number; skipped: number; errors: number };
  }> {
    const { fromVolume = 1, uploadCovers = true, force = false } = options;

    // Get manga details
    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: mangaId },
      select: {
        titre: true,
        titreOrig: true,
        nbVolumes: true,
        nbVol: true,
        commentaire: true,
      },
    });

    if (!manga) {
      throw new NotFoundException('Manga not found');
    }

    // Determine total volumes
    let totalVolumes = options.toVolume;
    if (!totalVolumes) {
      // Try to get from nbVol (integer) first, then parse nbVolumes (string)
      if (manga.nbVol && manga.nbVol > 0) {
        totalVolumes = manga.nbVol;
      } else if (manga.nbVolumes) {
        const match = manga.nbVolumes.match(/^(\d+)/);
        totalVolumes = match ? parseInt(match[1], 10) : 0;
      }
    }

    if (!totalVolumes || totalVolumes <= 0) {
      throw new BadRequestException('Could not determine total volume count. Please set nbVolumes or specify toVolume.');
    }

    this.logger.log(`Starting volume sync for "${manga.titre}" (ID: ${mangaId}): volumes ${fromVolume}-${totalVolumes}`);

    // Get title variants for better search results
    const titleVariants = await this.getMangaTitleVariants(manga.titre);
    this.logger.debug(`Title variants: ${JSON.stringify(titleVariants)}`);

    // Get existing volumes if not forcing re-sync
    const existingVolumes = force ? [] : await this.prisma.mangaVolume.findMany({
      where: { idManga: mangaId },
      select: { volumeNumber: true, isbn: true, coverImage: true },
    });
    const existingMap = new Map(existingVolumes.map(v => [v.volumeNumber, v]));

    const results: VolumeSyncResult[] = [];
    const summary = { created: 0, updated: 0, skipped: 0, errors: 0 };

    // Process each volume
    for (let vol = fromVolume; vol <= totalVolumes; vol++) {
      // Skip if already complete and not forcing
      const existing = existingMap.get(vol);
      if (!force && existing?.isbn && existing?.coverImage) {
        results.push({ volumeNumber: vol, status: 'skipped', message: 'Already complete' });
        summary.skipped++;
        continue;
      }

      // Search for volume info
      const volumeInfo = await this.searchVolumeInfo(manga.titre, vol, titleVariants);

      // Sync the volume
      const result = await this.syncSingleVolume(
        mangaId,
        manga.titre,
        vol,
        volumeInfo || undefined,
        uploadCovers,
      );

      results.push(result);
      summary[result.status === 'created' ? 'created' :
              result.status === 'updated' ? 'updated' :
              result.status === 'error' ? 'errors' : 'skipped']++;

      // Small delay to avoid rate limiting (Google Books has limits)
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Invalidate manga cache
    await this.invalidateMangaCache(mangaId);

    this.logger.log(`Volume sync complete for "${manga.titre}": ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped, ${summary.errors} errors`);

    return {
      success: summary.errors === 0,
      results,
      summary,
    };
  }

  /**
   * Import a single volume with manual data
   */
  async importVolume(
    mangaId: number,
    data: {
      volumeNumber: number;
      title?: string;
      isbn?: string;
      releaseDate?: string;
      coverUrl?: string;
      description?: string;
    },
  ): Promise<VolumeSyncResult> {
    // Get manga for title
    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: mangaId },
      select: { titre: true },
    });

    if (!manga) {
      throw new NotFoundException('Manga not found');
    }

    const volumeInfo: VolumeInfo = {
      volumeNumber: data.volumeNumber,
      title: data.title || `Tome ${data.volumeNumber}`,
      isbn: data.isbn,
      releaseDate: data.releaseDate,
      coverUrl: data.coverUrl,
      description: data.description,
      source: 'manual',
    };

    const result = await this.syncSingleVolume(
      mangaId,
      manga.titre,
      data.volumeNumber,
      volumeInfo,
      !!data.coverUrl,
    );

    // Invalidate manga cache
    await this.invalidateMangaCache(mangaId);

    return result;
  }

  /**
   * Search for volume info by ISBN (direct lookup)
   */
  async searchByIsbn(isbn: string): Promise<VolumeInfo | null> {
    const result = await this.googleBooksService.getByISBN(isbn);

    if (!result) {
      return null;
    }

    // Extract volume number from title
    const volumeNumber = this.extractVolumeNumber(result.title);

    return {
      volumeNumber,
      title: result.title,
      isbn: result.isbn13 || result.isbn10,
      releaseDate: result.publishedDate,
      coverUrl: result.imageUrl,
      description: result.description,
      publisher: result.publisher,
      source: 'google_books',
    };
  }

  /**
   * Get all volumes for a manga
   */
  async getVolumes(mangaId: number) {
    return this.prisma.mangaVolume.findMany({
      where: { idManga: mangaId },
      orderBy: { volumeNumber: 'asc' },
    });
  }

  /**
   * Get volumes missing covers
   */
  async getVolumesWithoutCovers(mangaId?: number) {
    const where: any = {
      OR: [
        { coverImage: null },
        { coverImage: '' },
      ],
    };

    if (mangaId) {
      where.idManga = mangaId;
    }

    return this.prisma.mangaVolume.findMany({
      where,
      include: {
        manga: {
          select: { titre: true },
        },
      },
      orderBy: [
        { idManga: 'asc' },
        { volumeNumber: 'asc' },
      ],
      take: 100,
    });
  }

  /**
   * Extract volume number from title string
   */
  private extractVolumeNumber(title: string): number {
    if (!title) return 1;

    const patterns = [
      /tome\s*(\d+)/i,
      /vol\.?\s*(\d+)/i,
      /volume\s*(\d+)/i,
      /t\.?\s*(\d+)(?:\s|$)/i,
      /(\d+)巻/,
      /#(\d+)/,
    ];

    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    return 1;
  }

  /**
   * Invalidate manga cache after volume changes
   */
  private async invalidateMangaCache(mangaId: number): Promise<void> {
    try {
      await this.prisma.akManga.update({
        where: { idManga: mangaId },
        data: { latestCache: Math.floor(Date.now() / 1000) },
      });
    } catch (error) {
      this.logger.warn(`Failed to invalidate cache for manga ${mangaId}: ${error.message}`);
    }
  }
}
