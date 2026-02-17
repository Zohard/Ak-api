import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { R2Service } from '../../media/r2.service';
import { MediaService } from '../../media/media.service';
import { AdminLoggingService } from '../logging/admin-logging.service';
import { AdminContentService } from './admin-content.service';
import { CacheService } from '../../../shared/services/cache.service';
import {
  AdminMangaListQueryDto,
  CreateAdminMangaDto,
  UpdateAdminMangaDto,
} from './dto/admin-manga.dto';

@Injectable()
export class AdminMangasService {
  constructor(
    private prisma: PrismaService,
    private r2Service: R2Service,
    private mediaService: MediaService,
    private adminLogging: AdminLoggingService,
    private adminContentService: AdminContentService,
    private cacheService: CacheService,
  ) { }

  /**
   * Upload external image URL to R2
   * Returns the full R2 URL if successful, null if upload fails
   * Does NOT throw - allows manga creation to continue even if image upload fails
   */
  private async uploadExternalImageToR2(imageUrl: string, title?: string): Promise<string | null> {
    // Only process external URLs (not already R2 URLs)
    if (!imageUrl || !imageUrl.startsWith('http') || imageUrl.includes('imagekit.io')) {
      return imageUrl;
    }

    try {
      const result = await this.mediaService.uploadImageFromUrl(
        imageUrl,
        'manga',
        undefined, // relatedId
        false, // saveAsScreenshot
        title // title for filename generation
      );
      // Return the full R2 URL
      return result.url;
    } catch (error) {
      console.error('[AdminMangasService] Failed to upload external image to R2 (non-blocking):', {
        imageUrl,
        title,
        error: error.message,
        stack: error.stack
      });
      // Return null instead of throwing - manga creation should continue without image
      return null;
    }
  }

  async list(query: AdminMangaListQueryDto) {
    const { page = 1, limit = 20, search, annee, ficheComplete, statut, sortBy = 'dateAjout', sortOrder = 'desc' } = query;
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

    // Build orderBy based on sortBy and sortOrder
    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    const [items, total] = await Promise.all([
      this.prisma.akManga.findMany({ where, skip, take: limit, orderBy }),
      this.prisma.akManga.count({ where }),
    ]);

    // Get manga IDs to fetch publishers from ak_business_to_mangas
    const mangaIds = items.map((manga) => manga.idManga);

    // Fetch publisher relationships (type = 'Editeur') for all mangas at once
    const publisherRelations = await this.prisma.akBusinessToManga.findMany({
      where: {
        idManga: { in: mangaIds },
        type: 'Editeur',
      },
      include: {
        business: {
          select: { idBusiness: true, denomination: true },
        },
      },
      orderBy: { idRelation: 'asc' }, // Get the first one if multiple exist
    });

    // Create a map of manga ID to publisher name (only the first publisher)
    const publisherMap: Map<number, string | null> = new Map();
    publisherRelations.forEach((relation) => {
      if (relation.idManga && !publisherMap.has(relation.idManga)) {
        publisherMap.set(relation.idManga, relation.business?.denomination || null);
      }
    });

    // Map publisher names back to manga items
    const enrichedItems = items.map((manga) => {
      const publisherName = publisherMap.get(manga.idManga);
      return {
        ...manga,
        editeur: publisherName || manga.editeur, // Use publisher name from relations or fallback to original
      };
    });

    return { items: enrichedItems, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getMangasWithoutScreenshots(search?: string, sortBy: string = 'year') {
    // Determine sort order
    let orderByClause: string;
    switch (sortBy) {
      case 'year':
        orderByClause = 'm.annee DESC NULLS LAST';
        break;
      case 'date_ajout':
        orderByClause = 'm.date_ajout DESC';
        break;
      case 'last_modified':
        orderByClause = 'm.date_modification DESC NULLS LAST';
        break;
      case 'title':
        orderByClause = 'm.titre ASC';
        break;
      default:
        orderByClause = 'm.annee DESC NULLS LAST';
    }

    // Build search condition
    let searchCondition = '';
    const params: any[] = [];

    if (search) {
      searchCondition = `AND (
        m.titre ILIKE $1
        OR m.titre_orig ILIKE $1
        OR m.titre_fr ILIKE $1
      )`;
      params.push(`%${search}%`);
    }

    // Use NOT EXISTS - much faster than NOT IN with thousands of IDs
    const query = `
      SELECT
        m.id_manga as "idManga",
        m.titre,
        m.titre_orig as "titreOrig",
        m.annee,
        m.date_ajout as "dateAjout",
        m.date_modification as "dateModification"
      FROM ak_mangas m
      WHERE NOT EXISTS (
        SELECT 1 FROM ak_screenshots s
        WHERE s.id_titre = m.id_manga AND s.type = 2
      )
      ${searchCondition}
      ORDER BY ${orderByClause}
      LIMIT 500
    `;

    const mangas = await this.prisma.$queryRawUnsafe<any[]>(query, ...params);

    // Map to frontend-expected format
    return mangas.map(manga => ({
      id: manga.idManga,
      titre: manga.titre,
      titreOrig: manga.titreOrig,
      annee: manga.annee,
      format: null,
      date_ajout: manga.dateAjout,
      last_modified: manga.dateModification ? new Date(manga.dateModification * 1000) : manga.dateAjout,
    }));
  }

  async getOne(id: number) {
    const item = await this.prisma.akManga.findUnique({ where: { idManga: id } });
    if (!item) throw new NotFoundException('Manga introuvable');

    // Fetch publisher from ak_business_to_mangas (same as in list method)
    const publisherRelation = await this.prisma.akBusinessToManga.findFirst({
      where: {
        idManga: id,
        type: 'Editeur',
      },
      include: {
        business: {
          select: { idBusiness: true, denomination: true },
        },
      },
      orderBy: { idRelation: 'asc' }, // Get the first one if multiple exist
    });

    // Return manga with publisher name from relation or fallback to original editeur field
    return {
      ...item,
      editeur: publisherRelation?.business?.denomination || item.editeur,
    };
  }

  async create(dto: CreateAdminMangaDto, username?: string) {
    const data: any = { ...dto };
    if (!data.niceUrl && data.titre) data.niceUrl = this.slugify(data.titre);

    // Upload external image to R2 if present
    if (data.image && data.image.startsWith('http')) {
      const uploadedUrl = await this.uploadExternalImageToR2(data.image, data.titre);
      // If upload failed (returns null), set image to null to avoid storing broken external URL
      data.image = uploadedUrl;
    }

    // Map nbVolumes (string) to nbVol (int) if valid number
    if (data.nbVolumes) {
      const nbVolInt = parseInt(data.nbVolumes, 10);
      if (!isNaN(nbVolInt) && nbVolInt > 0) {
        data.nbVol = nbVolInt;
      }
    }

    const created = await this.prisma.akManga.create({ data });

    // Log the creation
    if (username) {
      await this.adminLogging.addLog(created.idManga, 'manga', username, 'Création fiche');
    }

    return created;
  }

  async update(id: number, dto: UpdateAdminMangaDto, user?: any) {
    const existing = await this.prisma.akManga.findUnique({ where: { idManga: id } });
    if (!existing) throw new NotFoundException('Manga introuvable');
    const { addSynopsisAttribution, ...rest } = dto as any;
    const data: any = { ...rest };
    if (dto.titre && !dto.niceUrl) data.niceUrl = this.slugify(dto.titre);

    // Upload external image to R2 if present
    if (data.image && data.image.startsWith('http')) {
      const uploadedUrl = await this.uploadExternalImageToR2(data.image, data.titre || existing.titre);
      // If upload failed (returns null), set image to null to avoid storing broken external URL
      data.image = uploadedUrl;
    }

    // Map nbVolumes (string) to nbVol (int) if valid number
    if (data.nbVolumes !== undefined) {
      if (data.nbVolumes) {
        const nbVolInt = parseInt(data.nbVolumes, 10);
        if (!isNaN(nbVolInt) && nbVolInt > 0) {
          data.nbVol = nbVolInt;
        } else {
          data.nbVol = null;
        }
      } else {
        data.nbVol = null;
      }
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

    const updated = await this.prisma.akManga.update({ where: { idManga: id }, data });

    // Log the update
    if (user) {
      const username = user.pseudo || user.member_name || user.username || 'admin';
      await this.adminLogging.addLog(id, 'manga', username, 'Modification infos principales');
    }
  }

  async updateStatus(id: number, statut: number, username?: string) {
    const existing = await this.prisma.akManga.findUnique({
      where: { idManga: id },
    });
    if (!existing) throw new NotFoundException('Manga introuvable');

    const updated = await this.prisma.akManga.update({
      where: { idManga: id },
      data: { statut },
    });

    // Log the status change
    if (username) {
      await this.adminLogging.addLog(
        id,
        'manga',
        username,
        `Modification statut (${statut})`,
      );
    }

    // Trigger notifications if status changed to published (1)
    if (statut === 1 && existing.statut !== 1) {
      this.triggerStatusPublishedNotifications(id).catch((err) =>
        console.error('Failed to trigger status published notifications:', err),
      );
    }

    return updated;
  }

  async updateImage(id: number, image: string, username?: string) {
    const existing = await this.prisma.akManga.findUnique({ where: { idManga: id } });
    if (!existing) throw new NotFoundException('Manga introuvable');

    const updated = await this.prisma.akManga.update({
      where: { idManga: id },
      data: { image }
    });

    // Log the image update
    if (username) {
      await this.adminLogging.addLog(id, 'manga', username, `Modification image (${image})`);
    }

    // Invalidate cache
    await this.cacheService.invalidateManga(id);

    return { message: 'Image mise à jour avec succès', image };
  }

  /**
   * Trigger notifications for all relationships when a manga is published.
   */
  private async triggerStatusPublishedNotifications(id: number): Promise<void> {
    try {
      // Get all existing relationships for this manga
      const relations = await this.adminContentService.getContentRelationships(
        id,
        'manga',
      );

      // Trigger notifications for each relationship
      for (const rel of relations) {
        if (rel.related_id && rel.related_type) {
          await this.adminContentService.triggerRelatedContentNotifications(
            { id, type: 'manga' },
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
    const existing = await this.prisma.akManga.findUnique({ where: { idManga: id } });
    if (!existing) throw new NotFoundException('Manga introuvable');
    await this.prisma.akManga.delete({ where: { idManga: id } });
    // Delete admin activity logs for this manga
    await this.adminLogging.deleteLog(id, 'manga');
    return { message: 'Manga supprimé' };
  }

  async importMangaImage(
    imageUrl: string,
    mangaTitle: string
  ): Promise<{ success: boolean; imageKitUrl?: string; filename?: string; error?: string }> {
    try {
      if (!imageUrl || !imageUrl.trim()) {
        return { success: false, error: 'No image URL provided' };
      }

      // Generate a clean filename using the R2 helper (sanitized title + timestamp + cover number)
      const baseFilename = this.r2Service.createSafeFileName(mangaTitle, 'manga');
      const filename = `${baseFilename}-cover-1`;
      const folder = this.r2Service.getFolderForMediaType('manga');

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
      console.warn('Failed to import manga image:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async generateVolumesFromCount(id: number) {
    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: id },
      select: { nbVolumes: true, titre: true },
    });

    if (!manga) {
      throw new NotFoundException('Manga introuvable');
    }

    if (!manga.nbVolumes) {
      throw new BadRequestException('Nombre de volumes non défini pour ce manga (laissez le champ vide ou mettez 0 si inconnu)');
    }

    // Parse volume count - handle "15+" or "20 (en cours)"
    // Matches first number found at start of string
    const match = manga.nbVolumes.match(/^(\d+)/);
    const count = match ? parseInt(match[1], 10) : 0;

    if (count <= 0) {
      throw new BadRequestException(`Impossible de déterminer un nombre de volumes valide à partir de "${manga.nbVolumes}"`);
    }

    // Get existing volumes
    const existingVolumes = await this.prisma.mangaVolume.findMany({
      where: { idManga: id },
      select: { volumeNumber: true },
    });
    const existingNumbers = new Set(existingVolumes.map(v => v.volumeNumber));

    const volumesToCreate: any[] = [];
    for (let i = 1; i <= count; i++) {
      if (!existingNumbers.has(i)) {
        volumesToCreate.push({
          idManga: id,
          volumeNumber: i,
          title: `Tome ${i}`,
        });
      }
    }

    if (volumesToCreate.length > 0) {
      await this.prisma.mangaVolume.createMany({
        data: volumesToCreate,
      });
    }

    // Invalidate cache
    await this.invalidateMangaCache(id);

    return {
      success: true,
      message: volumesToCreate.length > 0 ? `${volumesToCreate.length} volumes générés avec succès` : 'Tous les volumes existent déjà',
      total: count,
      created: volumesToCreate.length,
      existing: existingVolumes.length
    };
  }

  async invalidateMangaCache(id: number): Promise<void> {
    await this.prisma.akManga.update({
      where: { idManga: id },
      data: { latestCache: Math.floor(Date.now() / 1000) }
    });
  }

  private slugify(text: string) {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }
}

