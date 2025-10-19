import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { ImageKitService } from '../../media/imagekit.service';
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
    private adminLogging: AdminLoggingService,
  ) {}

  async list(query: AdminMangaListQueryDto) {
    const { page = 1, limit = 20, search, annee, editeur, statut } = query;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (search) where.titre = { contains: search, mode: 'insensitive' };
    if (annee) where.annee = annee;
    if (editeur) where.editeur = { contains: editeur, mode: 'insensitive' };
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
    const data: any = { ...dto };
    if (dto.titre && !dto.niceUrl) data.niceUrl = this.slugify(dto.titre);

    // Handle synopsis validation - append user attribution if synopsis is being updated
    if (dto.synopsis && user?.username) {
      // Check if synopsis is being changed (not just updating the same value)
      if (dto.synopsis !== existing.synopsis) {
        // Remove any existing attribution to avoid duplication
        let cleanSynopsis = dto.synopsis;
        const attributionRegex = /<br><br>"Synopsis soumis par .+"/g;
        cleanSynopsis = cleanSynopsis.replace(attributionRegex, '');

        // Append the new attribution
        data.synopsis = `${cleanSynopsis}<br><br>"Synopsis soumis par ${user.username}"`;
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

      // Generate a clean filename from the manga title
      const cleanTitle = mangaTitle
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '')
        .substring(0, 50);

      const timestamp = Date.now();
      const filename = `${cleanTitle}-${timestamp}`;

      // Use ImageKit service to upload from URL
      const result = await this.imageKitService.uploadImageFromUrl(
        imageUrl,
        filename,
        'images/mangas' // Store in mangas folder
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

