import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { R2Service } from '../media/r2.service';
import { MediaService } from '../media/media.service';
import { GoogleBooksService } from './google-books.service';
import { NautiljonService } from './nautiljon.service';
import { JikanService, JikanManga } from '../jikan/jikan.service';
import { AniListService } from '../anilist/anilist.service';
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
    private readonly anilistService: AniListService,
  ) { }

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
   * Search for volume candidates (returns multiple options for user to choose)
   * Used when user wants to manually select the correct volume from search results
   */
  async searchVolumeCandidates(
    mangaTitle: string,
    volumeNumber: number,
    titleVariants?: MangaTitleVariants,
  ): Promise<{
    candidates: Array<VolumeInfo & { score?: number }>;
    sources: string[];
  }> {
    const allCandidates: Array<VolumeInfo & { score?: number }> = [];
    const sources: string[] = [];

    // Build search queries with different title formats
    const titles = titleVariants
      ? [titleVariants.original, titleVariants.french, titleVariants.english, ...titleVariants.synonyms]
      : [mangaTitle];

    const uniqueTitles = [...new Set(titles.filter(Boolean))] as string[];
    const searchQueries: string[] = [];

    for (const title of uniqueTitles.slice(0, 2)) {
      searchQueries.push(`${title} Tome ${volumeNumber}`);
    }

    // ===== Google Books candidates =====
    for (const query of searchQueries) {
      try {
        const candidates = await this.googleBooksService.searchVolumeCandidates(query, volumeNumber, 'fr');
        if (candidates.length > 0) {
          sources.push('google_books');
          for (const c of candidates) {
            // Check if this candidate is already in the list (by ISBN or title)
            const isDuplicate = allCandidates.some(
              existing => (existing.isbn && existing.isbn === c.isbn) ||
                (existing.title?.toLowerCase() === c.title?.toLowerCase())
            );
            if (!isDuplicate) {
              allCandidates.push({
                ...c,
                volumeNumber: c.volumeNumber || volumeNumber,
                source: 'google_books',
              });
            }
          }
        }
      } catch (error) {
        this.logger.warn(`[Google Books] Candidates search failed for "${query}": ${error.message}`);
      }
    }

    // ===== Nautiljon candidate =====
    for (const title of uniqueTitles.slice(0, 1)) {
      try {
        const nautiljonResult = await this.nautiljonService.searchVolume(title, volumeNumber);
        if (nautiljonResult && (nautiljonResult.isbn || nautiljonResult.releaseDate || nautiljonResult.coverUrl)) {
          sources.push('nautiljon');
          const isDuplicate = allCandidates.some(
            existing => existing.isbn && existing.isbn === nautiljonResult.isbn
          );
          if (!isDuplicate) {
            allCandidates.push({
              volumeNumber: nautiljonResult.volumeNumber,
              title: nautiljonResult.title,
              isbn: nautiljonResult.isbn,
              releaseDate: nautiljonResult.releaseDate,
              coverUrl: nautiljonResult.coverUrl,
              description: nautiljonResult.description,
              publisher: nautiljonResult.publisher,
              source: 'nautiljon',
            });
          }
        }
      } catch (error) {
        this.logger.warn(`[Nautiljon] Candidates search failed for "${title}": ${error.message}`);
      }
    }

    // Sort candidates: prioritize those with matching volume number, then by completeness
    allCandidates.sort((a, b) => {
      // Volume number match
      const aVolMatch = a.volumeNumber === volumeNumber ? 100 : 0;
      const bVolMatch = b.volumeNumber === volumeNumber ? 100 : 0;

      // Completeness score
      const aComplete = (a.isbn ? 30 : 0) + (a.releaseDate ? 20 : 0) + (a.coverUrl ? 20 : 0) + (a.publisher ? 10 : 0);
      const bComplete = (b.isbn ? 30 : 0) + (b.releaseDate ? 20 : 0) + (b.coverUrl ? 20 : 0) + (b.publisher ? 10 : 0);

      return (bVolMatch + bComplete) - (aVolMatch + aComplete);
    });

    return {
      candidates: allCandidates.slice(0, 10), // Limit to 10 candidates
      sources: [...new Set(sources)],
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
   * Now uses bulk scraping for better performance from Nautiljon
   */
  async syncAllVolumes(
    mangaId: number,
    options: {
      uploadCovers?: boolean;
      force?: boolean;
      filterDate?: Date;
    } = {},
  ): Promise<{ success: boolean; summary: string }> {
    try {
      const manga = await this.prisma.akManga.findUnique({
        where: { idManga: mangaId },
      });

      if (!manga) {
        throw new NotFoundException(`Manga ${mangaId} not found`);
      }

      const totalVolumes = parseInt(manga.nbVolumes || '0', 10);
      let updatedCount = 0;
      let createdCount = 0;
      let errorCount = 0;

      // Try bulk scraping first (Nautiljon)
      let bulkVolumes: any[] = [];
      try {
        const titleVariants = await this.getMangaTitleVariants(manga.titre);
        // Try with French title first, then Original, then Title
        const titlesToTry = [
          titleVariants.french,
          titleVariants.original,
          manga.titre,
          ...titleVariants.synonyms
        ].filter(Boolean);

        const uniqueTitles = [...new Set(titlesToTry)] as string[];

        // Start bulk scrape
        for (const title of uniqueTitles) {
          if (!title) continue;
          this.logger.debug(`Attempting bulk scrape for "${title}"...`);
          const results = await this.nautiljonService.scrapeVolumeList(title);

          if (results && results.length > 0) {
            // Apply filtering if options provided
            if (options.filterDate) {
              const filterMonth = options.filterDate.getMonth();
              const filterYear = options.filterDate.getFullYear();

              bulkVolumes = results.filter(v => {
                if (!v.releaseDate) return false;
                const d = new Date(v.releaseDate);
                return d.getMonth() === filterMonth && d.getFullYear() === filterYear;
              });

              this.logger.log(`Bulk scrape found ${results.length} total, filtered to ${bulkVolumes.length} for ${filterMonth + 1}/${filterYear}`);
            } else {
              bulkVolumes = results;
              this.logger.log(`Bulk scrape successful for "${title}": found ${results.length} volumes`);
            }
            break;
          }
        }
      } catch (error) {
        this.logger.warn(`Bulk scrape failed: ${error.message}`);
      }

      // If bulk scrape worked, process those volumes
      if (bulkVolumes.length > 0) {
        this.logger.log(`Processing ${bulkVolumes.length} volumes from bulk sync...`);

        // Fetch AniList cover for series if needed (for Volume 1)
        let seriesCoverUrl: string | null = null;
        if (bulkVolumes.some(v => v.volumeNumber === 1)) {
          try {
            seriesCoverUrl = await this.anilistService.getMangaCover(manga.titreOrig || manga.titre);
          } catch (e) {
            this.logger.warn(`Failed to fetch AniList cover: ${e.message}`);
          }
        }

        for (const info of bulkVolumes) {
          // Use AniList cover for volume 1 if available
          if (info.volumeNumber === 1 && seriesCoverUrl) {
            info.coverUrl = seriesCoverUrl;
            this.logger.debug(`Using AniList cover for Volume 1 of ${manga.titre}`);
          }

          const result = await this.syncSingleVolume(
            mangaId,
            manga.titre,
            info.volumeNumber,
            info, // Pass the scraped info directly
            options.uploadCovers
          );

          if (result.status === 'created') createdCount++;
          else if (result.status === 'updated') updatedCount++;
          else if (result.status === 'error') errorCount++;
        }
      }
      // Fallback to sequential updates if bulk failed or returned nothing
      else if (totalVolumes > 0) {
        // ... (existing fallback logic, maybe skip for now if filtering is stricter?)
        if (options.filterDate) {
          this.logger.log(`Bulk sync found nothing matching filter, skipping sequential fallback.`);
        } else {
          this.logger.log(`Bulk sync found nothing, falling back to sequential sync for ${totalVolumes} volumes...`);
          // Limit to 50 to prevent timeouts if forced
          const limit = Math.min(totalVolumes, 50);

          for (let i = 1; i <= limit; i++) {
            const result = await this.syncSingleVolume(
              mangaId,
              manga.titre,
              i,
              undefined,
              options.uploadCovers,
            );

            if (result.status === 'created') createdCount++;
            else if (result.status === 'updated') updatedCount++;
            else if (result.status === 'error') errorCount++;
          }
        }
      }

      // Invalidate cache
      await this.invalidateMangaCache(mangaId);

      return {
        success: true,
        summary: `Sync completed: ${createdCount} created, ${updatedCount} updated, ${errorCount} errors` + (bulkVolumes.length > 0 ? " (Bulk Mode)" : " (Sequential Mode)"),
      };

    } catch (error) {
      this.logger.error(`Failed to sync all volumes for manga ${mangaId}: ${error.message}`);
      return {
        success: false,
        summary: `Sync failed: ${error.message}`,
      };
    }
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
   * Get upcoming manga releases (planning)
   */
  async getPlanning(
    startDate: Date = new Date(),
    endDate: Date = new Date(new Date().setMonth(new Date().getMonth() + 3)),
    limit: number = 50,
  ) {
    const volumes = await this.prisma.mangaVolume.findMany({
      where: {
        releaseDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        manga: {
          select: {
            idManga: true,
            titre: true,
            titreFr: true, // Also include French title
            image: true,
            niceUrl: true,
            nbVolumes: true, // Total volumes string
            nbVol: true,     // Total volumes int
          },
        },
      },
      orderBy: {
        releaseDate: 'asc',
      },
      take: limit,
    });

    // Group by month for easier frontend display? Or return flat list?
    // Let's return a flat list but with useful structure
    return volumes.map(v => ({
      ...v,
      mangaTitle: v.manga?.titreFr || v.manga?.titre, // Prefer French title
    }));
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
