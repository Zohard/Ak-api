import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { ImageKitService } from '../../media/imagekit.service';
import { MediaService } from '../../media/media.service';
import { AdminLoggingService } from '../logging/admin-logging.service';
import {
  AdminMangaListQueryDto,
  CreateAdminMangaDto,
  UpdateAdminMangaDto,
} from './dto/admin-manga.dto';

@Injectable()
export class AdminMangasService {
  constructor(
    private prisma: PrismaService,
    private imageKitService: ImageKitService,
    private mediaService: MediaService,
    private adminLogging: AdminLoggingService,
  ) {}

  /**
   * Upload external image URL to ImageKit
   * Returns the full ImageKit URL if successful
   * Throws BadRequestException if upload fails
   */
  private async uploadExternalImageToImageKit(imageUrl: string, title?: string): Promise<string> {
    // Only process external URLs (not already ImageKit URLs)
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
      // Return the full ImageKit URL
      return result.url;
    } catch (error) {
      console.error('[AdminMangasService] Failed to upload external image to ImageKit:', {
        imageUrl,
        title,
        error: error.message,
        stack: error.stack
      });
      // Throw error instead of silently falling back to prevent saving external URLs
      throw new BadRequestException(`Failed to upload image to ImageKit: ${error.message}`);
    }
  }

  async list(query: AdminMangaListQueryDto) {
    const { page = 1, limit = 20, search, annee, ficheComplete, statut } = query;
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

    const [items, total] = await Promise.all([
      this.prisma.akManga.findMany({ where, skip, take: limit, orderBy: { dateAjout: 'desc' } }),
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
    // Get all manga IDs that have screenshots (type = 2 for manga)
    const mangasWithScreenshots = await this.prisma.akScreenshot.findMany({
      where: { type: 2 },
      select: { idTitre: true },
      distinct: ['idTitre'],
    });

    const idsWithScreenshots = mangasWithScreenshots.map(s => s.idTitre);

    // Build where clause to exclude mangas with screenshots
    const where: any = {
      idManga: {
        notIn: idsWithScreenshots,
      },
    };

    // Add search filter if provided
    if (search) {
      where.OR = [
        { titre: { contains: search, mode: 'insensitive' } },
        { titreOrig: { contains: search, mode: 'insensitive' } },
        { titreFr: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Determine sort order
    let orderBy: any;
    switch (sortBy) {
      case 'year':
        orderBy = { annee: 'desc' };
        break;
      case 'date_ajout':
        orderBy = { dateAjout: 'desc' };
        break;
      case 'last_modified':
        orderBy = { dateModification: 'desc' };
        break;
      case 'title':
        orderBy = { titre: 'asc' };
        break;
      default:
        orderBy = { annee: 'desc' };
    }

    const mangas = await this.prisma.akManga.findMany({
      where,
      select: {
        idManga: true,
        titre: true,
        titreOrig: true,
        annee: true,
        dateAjout: true,
        dateModification: true,
      },
      orderBy,
      take: 500, // Limit to 500 results for performance
    });

    // Map to frontend-expected format
    return mangas.map(manga => ({
      id: manga.idManga,
      titre: manga.titre,
      titreOrig: manga.titreOrig,
      annee: manga.annee,
      format: null, // Manga model doesn't have format field
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

    // Upload external image to ImageKit if present
    if (data.image && data.image.startsWith('http')) {
      data.image = await this.uploadExternalImageToImageKit(data.image, data.titre);
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

    // Upload external image to ImageKit if present
    if (data.image && data.image.startsWith('http')) {
      data.image = await this.uploadExternalImageToImageKit(data.image, data.titre || existing.titre);
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

    return updated;
  }

  async updateStatus(id: number, statut: number, username?: string) {
    const existing = await this.prisma.akManga.findUnique({ where: { idManga: id } });
    if (!existing) throw new NotFoundException('Manga introuvable');

    const updated = await this.prisma.akManga.update({ where: { idManga: id }, data: { statut } });

    // Log the status change
    if (username) {
      await this.adminLogging.addLog(id, 'manga', username, `Modification statut (${statut})`);
    }

    return updated;
  }

  async remove(id: number) {
    const existing = await this.prisma.akManga.findUnique({ where: { idManga: id } });
    if (!existing) throw new NotFoundException('Manga introuvable');
    await this.prisma.akManga.delete({ where: { idManga: id } });
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

      // Generate a clean filename using the ImageKit helper (sanitized title + timestamp + cover number)
      const baseFilename = this.imageKitService.createSafeFileName(mangaTitle, 'manga');
      const filename = `${baseFilename}-cover-1`;
      const folder = this.imageKitService.getFolderForMediaType('manga');

      // Use ImageKit service to upload from URL
      const result = await this.imageKitService.uploadImageFromUrl(
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

  private slugify(text: string) {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }
}

