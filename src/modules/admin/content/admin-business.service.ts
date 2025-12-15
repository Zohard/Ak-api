import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { AdminLoggingService } from '../logging/admin-logging.service';
import { ImageKitService } from '../../media/imagekit.service';
import { AdminBusinessListQueryDto, CreateAdminBusinessDto, UpdateAdminBusinessDto } from './dto/admin-business.dto';

@Injectable()
export class AdminBusinessService {
  constructor(
    private prisma: PrismaService,
    private adminLogging: AdminLoggingService,
    private imageKitService: ImageKitService,
  ) {}

  async list(query: AdminBusinessListQueryDto) {
    const { page = 1, statut, search, type } = query;
    const limit = 20;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (statut !== undefined) where.statut = statut;
    if (type) where.type = { contains: type, mode: 'insensitive' };
    if (search) where.denomination = { contains: search, mode: 'insensitive' };
    const [items, total] = await Promise.all([
      this.prisma.akBusiness.findMany({ where, skip, take: limit, orderBy: { dateAjout: 'desc' } }),
      this.prisma.akBusiness.count({ where }),
    ]);
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getOne(id: number) {
    const item = await this.prisma.akBusiness.findUnique({ where: { idBusiness: id } });
    if (!item) throw new NotFoundException('Fiche business introuvable');
    return item;
  }

  async create(dto: CreateAdminBusinessDto, username?: string) {
    // Check if denomination already exists
    if (dto.denomination) {
      const existingBusiness = await this.prisma.akBusiness.findUnique({
        where: { denomination: dto.denomination },
      });

      if (existingBusiness) {
        throw new BadRequestException(`Une entité business avec la dénomination "${dto.denomination}" existe déjà`);
      }
    }

    const data: any = { ...dto };
    if (!data.niceUrl && data.denomination) data.niceUrl = this.slugify(data.denomination);
    const created = await this.prisma.akBusiness.create({ data });

    // Log the creation
    if (username) {
      await this.adminLogging.addLog(created.idBusiness, 'business', username, 'Création fiche');
    }

    return created;
  }

  async update(id: number, dto: UpdateAdminBusinessDto, username?: string) {
    const existing = await this.prisma.akBusiness.findUnique({ where: { idBusiness: id } });
    if (!existing) throw new NotFoundException('Fiche business introuvable');

    // Check if denomination is being changed and if it already exists
    if (dto.denomination && dto.denomination !== existing.denomination) {
      const denominationExists = await this.prisma.akBusiness.findUnique({
        where: { denomination: dto.denomination },
      });

      if (denominationExists) {
        throw new BadRequestException(`Une entité business avec la dénomination "${dto.denomination}" existe déjà`);
      }
    }

    const data: any = { ...dto };
    if (dto.denomination && !dto.niceUrl) data.niceUrl = this.slugify(dto.denomination);
    const updated = await this.prisma.akBusiness.update({ where: { idBusiness: id }, data });

    // Log the update
    if (username) {
      await this.adminLogging.addLog(id, 'business', username, 'Modification infos principales');
    }

    return updated;
  }

  async updateStatus(id: number, statut: number, username?: string) {
    const existing = await this.prisma.akBusiness.findUnique({ where: { idBusiness: id } });
    if (!existing) throw new NotFoundException('Fiche business introuvable');

    const updated = await this.prisma.akBusiness.update({ where: { idBusiness: id }, data: { statut } });

    // Log the status change
    if (username) {
      await this.adminLogging.addLog(id, 'business', username, `Modification statut (${statut})`);
    }

    return updated;
  }

  async remove(id: number) {
    const existing = await this.prisma.akBusiness.findUnique({ where: { idBusiness: id } });
    if (!existing) throw new NotFoundException('Fiche business introuvable');
    await this.prisma.akBusiness.delete({ where: { idBusiness: id } });
    return { message: 'Business supprimé' };
  }

  async importBusinessImage(
    imageUrl: string,
    businessName: string
  ): Promise<{ success: boolean; imageKitUrl?: string; filename?: string; error?: string }> {
    try {
      if (!imageUrl || !imageUrl.trim()) {
        return { success: false, error: 'No image URL provided' };
      }

      // Generate a clean filename using the ImageKit helper (sanitized title + timestamp + logo number)
      const baseFilename = this.imageKitService.createSafeFileName(businessName, 'business');
      const filename = `${baseFilename}-logo-1`;
      const folder = this.imageKitService.getFolderForMediaType('business');

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
      console.warn('Failed to import business image:', error.message);
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

