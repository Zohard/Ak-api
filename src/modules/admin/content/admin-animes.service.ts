import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { AdminLoggingService } from '../logging/admin-logging.service';
import { CacheService } from '../../../shared/services/cache.service';
import { R2Service } from '../../media/r2.service';
import { AdminContentService } from './admin-content.service';
import {
  AdminAnimeListQueryDto,
  CreateAdminAnimeDto,
  UpdateAdminAnimeDto,
} from './dto/admin-anime.dto';

@Injectable()
export class AdminAnimesService {
  constructor(
    private prisma: PrismaService,
    private adminLogging: AdminLoggingService,
    private cacheService: CacheService,
    private r2Service: R2Service,
    private adminContentService: AdminContentService,
  ) { }

  async getOne(id: number) {
    const anime = await this.prisma.akAnime.findUnique({
      where: { idAnime: id },
      include: {
        trailers: {
          select: {
            idTrailer: true,
            titre: true,
            url: true,
            dateAjout: true,
          },
        },
      },
    });
    if (!anime) throw new NotFoundException('Anime introuvable');
    return anime;
  }

  async list(query: AdminAnimeListQueryDto) {
    const {
      page = 1,
      limit = 20,
      search,
      annee,
      ficheComplete,
      statut,
      sortBy = 'dateAjout',
      sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { titre: { contains: search, mode: 'insensitive' } },
        { titreOrig: { contains: search, mode: 'insensitive' } },
        { titreFr: { contains: search, mode: 'insensitive' } },
        { titresAlternatifs: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (annee) where.annee = annee;
    if (ficheComplete !== undefined) where.ficheComplete = ficheComplete;
    if (statut !== undefined) where.statut = statut;

    // Build order by - only add status sort if not filtering by specific status
    const orderBy: any[] = [];

    // Only sort by status first if viewing all statuses (no status filter)
    if (statut === undefined) {
      orderBy.push({ statut: 'desc' as const }); // 2 (En attente) before 1 (Publié) before 0 (Refusé)
    }

    // Add the requested sort with nulls last handling
    orderBy.push({ [sortBy]: { sort: sortOrder, nulls: 'last' } });

    const [items, total] = await Promise.all([
      this.prisma.akAnime.findMany({ where, skip, take: limit, orderBy }),
      this.prisma.akAnime.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAnimesWithoutScreenshots(search?: string, sortBy: string = 'year') {
    // Determine sort order
    let orderByClause: string;
    switch (sortBy) {
      case 'year':
        orderByClause = 'a.annee DESC NULLS LAST';
        break;
      case 'date_ajout':
        orderByClause = 'a.date_ajout DESC';
        break;
      case 'last_modified':
        orderByClause = 'a.date_ajout DESC';
        break;
      case 'title':
        orderByClause = 'a.titre ASC';
        break;
      default:
        orderByClause = 'a.annee DESC NULLS LAST';
    }

    // Build search condition
    let searchCondition = '';
    const params: any[] = [];

    if (search) {
      searchCondition = `AND (
        a.titre ILIKE $1
        OR a.titre_orig ILIKE $1
        OR a.titre_fr ILIKE $1
      )`;
      params.push(`%${search}%`);
    }

    // Use NOT EXISTS - much faster than NOT IN with thousands of IDs
    const query = `
      SELECT
        a.id_anime as "idAnime",
        a.titre,
        a.titre_orig as "titreOrig",
        a.annee,
        a.format,
        a.date_ajout as "dateAjout"
      FROM ak_animes a
      WHERE NOT EXISTS (
        SELECT 1 FROM ak_screenshots s
        WHERE s.id_titre = a.id_anime AND s.type = 1
      )
      ${searchCondition}
      ORDER BY ${orderByClause}
      LIMIT 500
    `;

    const animes = await this.prisma.$queryRawUnsafe<any[]>(query, ...params);

    // Map to frontend-expected format
    return animes.map(anime => ({
      id: anime.idAnime,
      titre: anime.titre,
      titreOrig: anime.titreOrig,
      annee: anime.annee,
      format: anime.format,
      date_ajout: anime.dateAjout,
      last_modified: anime.dateAjout,
    }));
  }

  async create(dto: CreateAdminAnimeDto, username?: string) {
    // Import image from URL if provided (e.g., from AniList)
    let importedImageFilename: string | null = null;
    if (dto.imageUrl && !dto.image) {
      try {

        const imageResult = await this.importAnimeImage(dto.imageUrl, dto.titre);
        if (imageResult.success && imageResult.filename) {
          importedImageFilename = imageResult.filename;

        } else {
          console.warn(`[Image Import] Failed to import image: ${imageResult.error}`);
        }
      } catch (error) {
        console.warn('[Image Import] Error importing image:', error.message);
      }
    }

    // Normalize legacy fields
    const titreOrig = dto.titreOrig ?? dto.titre_orig ?? null;
    const normalizeFormat = (val?: string | null) => {
      if (!val) return val ?? null;
      const t = val.trim();
      if (/^série$/i.test(t)) return 'Série TV';
      return t;
    };
    let nbEp: number | null = null;
    if (typeof dto.nbEp === 'number') {
      nbEp = dto.nbEp;
    } else if (dto.nbEpduree || dto.nb_epduree) {
      const episodeString = dto.nbEpduree || dto.nb_epduree;
      const m = String(episodeString).match(/\d+/);
      if (m) nbEp = Number(m[0]);
    }

    const data: any = {
      titre: dto.titre,
      niceUrl: dto.niceUrl || this.slugify(dto.titre),
      titreOrig,
      annee: dto.annee ?? null,
      dateDiffusion: dto.dateDiffusion ? new Date(dto.dateDiffusion) : null,
      nbEp,
      studio: dto.studio || null,
      realisateur: dto.realisateur || null,
      synopsis: dto.synopsis || null,
      image: importedImageFilename || dto.image || null,
      statut: dto.statut ?? 0,
      dateAjout: new Date(),
    };

    // Additional legacy fields if provided
    if (dto.format) data.format = normalizeFormat(dto.format);
    if (typeof dto.licence === 'number') data.licence = dto.licence;
    if (dto.titre_fr) data.titreFr = dto.titre_fr;
    if (dto.titres_alternatifs) data.titresAlternatifs = dto.titres_alternatifs;
    if (dto.titresAlternatifs) data.titresAlternatifs = dto.titresAlternatifs;
    // Handle both camelCase and snake_case versions
    const episodeCount = dto.nbEpduree || dto.nb_epduree;
    if (episodeCount) data.nbEpduree = episodeCount;

    const officialSite = dto.officialSite || dto.official_site;
    if (officialSite) data.officialSite = officialSite;
    if (dto.lien_adn) data.lienAdn = dto.lien_adn;
    if (dto.doublage) data.doublage = dto.doublage;
    if (dto.sources) data.sources = dto.sources;
    if (dto.commentaire) data.commentaire = dto.commentaire;
    if (typeof dto.lienforum === 'number') data.lienForum = dto.lienforum;
    // Note: legacy `topic` is not supported; use `commentaire` instead

    const created = await this.prisma.akAnime.create({ data });

    // Log the creation
    if (username) {
      await this.adminLogging.addLog(created.idAnime, 'anime', username, 'Création fiche');
    }

    // Invalidate cache for the newly created anime
    await this.cacheService.invalidateAnime(created.idAnime);

    // Invalidate anime_exists cache for title variations
    // This ensures future existence checks will find this newly created anime
    await this.invalidateAnimeExistsCache(created);

    return created;
  }

  async update(id: number, dto: UpdateAdminAnimeDto, user?: any) {
    const existing = await this.prisma.akAnime.findUnique({ where: { idAnime: id } });
    if (!existing) throw new NotFoundException('Anime introuvable');

    const { topic, lienforum, addSynopsisAttribution, ...rest } = dto as any;
    const data: any = { ...rest };
    if (dto.titre) {
      data.titre = dto.titre;
      if (!dto.niceUrl) data.niceUrl = this.slugify(dto.titre);
    }

    // Map lienforum from DTO to lienForum for Prisma
    if (typeof lienforum === 'number') {
      data.lienForum = lienforum;
    }

    // Handle synopsis validation - append user attribution if synopsis is being updated
    if (dto.synopsis && user?.username) {
      // Check if synopsis is being changed (not just updating the same value)
      if (dto.synopsis !== existing.synopsis) {
        // Remove any existing attribution to avoid duplication
        let cleanSynopsis = dto.synopsis;
        const attributionRegex = /<br><br>"Synopsis soumis par .+"/g;
        cleanSynopsis = cleanSynopsis.replace(attributionRegex, '');

        // Only append attribution if explicitly requested (default: true for backward compatibility)
        const shouldAddAttribution = dto.addSynopsisAttribution !== false;
        if (shouldAddAttribution) {
          data.synopsis = `${cleanSynopsis}<br><br>"Synopsis soumis par ${user.username}"`;
        } else {
          data.synopsis = cleanSynopsis;
        }
      }
    }

    // Normalize format if provided
    if (data.format) {
      const t = String(data.format).trim();
      data.format = /^série$/i.test(t) ? 'Série TV' : t;
    }

    // Convert dateDiffusion string to Date if provided
    if (data.dateDiffusion) {
      data.dateDiffusion = new Date(data.dateDiffusion);
    }

    const updated = await this.prisma.akAnime.update({ where: { idAnime: id }, data });

    // Log the update
    if (user) {
      const username = user.pseudo || user.member_name || user.username || 'admin';
      await this.adminLogging.addLog(id, 'anime', username, 'Modification infos principales');
    }

    // Invalidate cache
    await this.cacheService.invalidateAnime(id);

    // Invalidate anime_exists cache for title/source variations
    // This is important if titles or sources were updated
    await this.invalidateAnimeExistsCache(updated);

    return updated;
  }

  async updateStatus(id: number, statut: number, username?: string) {
    const existing = await this.prisma.akAnime.findUnique({ where: { idAnime: id } });
    if (!existing) throw new NotFoundException('Anime introuvable');

    const updated = await this.prisma.akAnime.update({ where: { idAnime: id }, data: { statut } });

    // Log the status change
    if (username) {
      await this.adminLogging.addLog(id, 'anime', username, `Modification statut (${statut})`);
    }

    // Trigger notifications if status changed to published (1)
    if (statut === 1 && existing.statut !== 1) {
      this.triggerStatusPublishedNotifications(id).catch((err) =>
        console.error('Failed to trigger status published notifications:', err),
      );
    }

    // Invalidate cache
    await this.cacheService.invalidateAnime(id);

    return updated;
  }

  /**
   * Trigger notifications for all relationships when an anime is published.
   */
  private async triggerStatusPublishedNotifications(id: number): Promise<void> {
    try {
      // Get all existing relationships for this anime
      const relations = await this.adminContentService.getContentRelationships(
        id,
        'anime',
      );

      // Trigger notifications for each relationship
      for (const rel of relations) {
        // Only trigger if it's a content relationship (anime/manga/jeu-video)
        if (rel.related_id && rel.related_type) {
          // Re-trigger the logic in AdminContentService
          // This will check if BOTH sides are published (now 'id' is published)
          // it will notify users who have the OTHER side in favorites
          await this.adminContentService.triggerRelatedContentNotifications(
            { id, type: 'anime' },
            { id: rel.related_id, type: rel.related_type },
            rel.relation_type,
          );
        }
      }
    } catch (error) {
      console.error('Error triggering status published notifications:', error);
    }
  }

  async remove(id: number) {
    const existing = await this.prisma.akAnime.findUnique({ where: { idAnime: id } });
    if (!existing) throw new NotFoundException('Anime introuvable');

    await this.prisma.akAnime.delete({ where: { idAnime: id } });

    // Delete admin activity logs for this anime
    await this.adminLogging.deleteLog(id, 'anime');

    // Invalidate cache
    await this.cacheService.invalidateAnime(id);

    return { message: 'Anime supprimé' };
  }

  async createStaffFromImportData(animeId: number, staffData: Array<{ name: string; role: string }>): Promise<void> {
    if (!staffData || staffData.length === 0) return;

    for (const staffMember of staffData) {
      if (!staffMember.name?.trim() || !staffMember.role?.trim()) continue;

      try {
        // First, try to find existing business entity by denomination
        let business = await this.prisma.akBusiness.findFirst({
          where: {
            denomination: {
              equals: staffMember.name,
              mode: 'insensitive'
            }
          }
        });

        // If not found, create new business entity
        if (!business) {
          business = await this.prisma.akBusiness.create({
            data: {
              denomination: staffMember.name,
              type: this.getBusinessTypeFromRole(staffMember.role),
              statut: 1,
              dateAjout: new Date()
            }
          });
        }

        // Check if relationship already exists
        const existingRelation = await this.prisma.akBusinessToAnime.findFirst({
          where: {
            idAnime: animeId,
            idBusiness: business.idBusiness,
            type: staffMember.role
          }
        });

        // Create relationship if it doesn't exist
        if (!existingRelation) {
          await this.prisma.akBusinessToAnime.create({
            data: {
              idAnime: animeId,
              idBusiness: business.idBusiness,
              type: staffMember.role
            }
          });
        }
      } catch (error) {
        console.error(`Error creating staff member ${staffMember.name} with role ${staffMember.role}:`, error);
        // Continue with next staff member instead of failing entire operation
      }
    }

    // Invalidate cache after updating business relations
    await this.cacheService.invalidateAnime(animeId);
  }

  private getBusinessTypeFromRole(role: string): string {
    const roleMap: Record<string, string> = {
      'Studio d\'animation': 'Studio',
      'Studio d\'animation (sous-traitance)': 'Studio',
      'Réalisateur': 'Personne',
      'Director': 'Personne',
      'Character Design': 'Personne',
      'Music': 'Personne',
      'Original Creator': 'Personne',
      'Script': 'Personne',
      'Producer': 'Personne',
      'Executive Producer': 'Personne',
      'Sound Director': 'Personne',
      'Art Director': 'Personne',
    };

    return roleMap[role] || 'Personne';
  }

  private slugify(text: string) {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  /**
   * Invalidate anime_exists cache for title variations and source URLs
   * This ensures future existence checks will find this anime
   */
  private async invalidateAnimeExistsCache(anime: any): Promise<void> {
    // Collect all title variations
    const titles: string[] = [];

    if (anime.titre) titles.push(anime.titre.toLowerCase());
    if (anime.titreOrig) titles.push(anime.titreOrig.toLowerCase());
    if (anime.titreFr) titles.push(anime.titreFr.toLowerCase());

    // Add alternative titles (split by newlines)
    if (anime.titresAlternatifs) {
      const altTitles = anime.titresAlternatifs
        .split('\n')
        .map((t: string) => t.trim().toLowerCase())
        .filter(Boolean);
      titles.push(...altTitles);
    }

    // Invalidate cache for each title variation (using MD5 hash like anime-external.service)
    const crypto = require('crypto');
    for (const title of titles) {
      const hashedTitle = crypto.createHash('md5').update(title).digest('hex');
      const cacheKey = `anime_exists:${hashedTitle}`;
      await this.cacheService.del(cacheKey);
    }

    // Invalidate cache for source URLs (if provided)
    // Sources is stored as JSON: {"myanimelist":"...", "anilist":"...", "nautiljon":"..."}
    if (anime.sources) {
      try {
        // Parse sources as JSON
        const sourcesJson = typeof anime.sources === 'string'
          ? JSON.parse(anime.sources)
          : anime.sources;

        // Invalidate cache for AniList URL (used by sources-externes)
        if (sourcesJson.anilist) {
          const anilistCacheKey = `anime_exists:${sourcesJson.anilist}`;
          await this.cacheService.del(anilistCacheKey);

        }

        // Invalidate cache for other source URLs (if needed)
        const sourceUrls = Object.values(sourcesJson).filter(Boolean) as string[];
        for (const url of sourceUrls) {
          const hashedUrl = crypto.createHash('md5').update(url.toLowerCase()).digest('hex');
          const cacheKey = `anime_exists_url:${hashedUrl}`;
          await this.cacheService.del(cacheKey);
        }
      } catch (error) {
        console.warn('Failed to parse sources JSON for cache invalidation:', error.message);
      }
    }


  }

  /**
   * Hash a query string for cache keys (same algorithm as anime-external.service.ts)
   */
  private hashQuery(query: string): string {
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Import anime image from URL (e.g., AniList, MAL) to R2
   */
  private async importAnimeImage(
    imageUrl: string,
    animeTitle: string
  ): Promise<{ success: boolean; imageKitUrl?: string; filename?: string; error?: string }> {
    try {
      if (!imageUrl || !imageUrl.trim()) {
        return { success: false, error: 'No image URL provided' };
      }

      // Generate a clean filename using the R2 helper (sanitized title + timestamp + cover number)
      const baseFilename = this.r2Service.createSafeFileName(animeTitle, 'anime');
      const filename = `${baseFilename}-cover-1`;
      const folder = this.r2Service.getFolderForMediaType('anime');

      // Use R2 service to upload from URL
      const result = await this.r2Service.uploadImageFromUrl(
        imageUrl,
        filename,
        folder
      );

      return {
        success: true,
        imageKitUrl: result.url,
        filename: result.filename, // Store the filename for database
      };
    } catch (error) {
      console.warn('Failed to import anime image:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
