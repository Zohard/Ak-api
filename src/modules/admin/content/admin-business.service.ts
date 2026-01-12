import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { AdminLoggingService } from '../logging/admin-logging.service';
import { R2Service } from '../../media/r2.service';
import { AdminBusinessListQueryDto, CreateAdminBusinessDto, UpdateAdminBusinessDto } from './dto/admin-business.dto';

@Injectable()
export class AdminBusinessService {
  constructor(
    private prisma: PrismaService,
    private adminLogging: AdminLoggingService,
    private r2Service: R2Service,
  ) {}

  async list(query: AdminBusinessListQueryDto) {
    const {
      page = 1,
      statut,
      search,
      type,
      annee,
      ficheComplete,
      sortBy = 'dateAjout',
      sortOrder = 'desc'
    } = query;
    const limit = 20;
    const skip = (page - 1) * limit;
    const where: any = {};

    if (statut !== undefined) where.statut = statut;
    if (type) where.type = { contains: type, mode: 'insensitive' };
    if (search) where.denomination = { contains: search, mode: 'insensitive' };
    if (annee !== undefined) where.annee = annee;
    if (ficheComplete !== undefined) where.ficheComplete = ficheComplete;

    // Build dynamic orderBy
    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    const [items, total] = await Promise.all([
      this.prisma.akBusiness.findMany({ where, skip, take: limit, orderBy }),
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

      // Generate a clean filename using the R2 helper (sanitized title + timestamp + logo number)
      const baseFilename = this.r2Service.createSafeFileName(businessName, 'business');
      const filename = `${baseFilename}-logo-1`;
      const folder = this.r2Service.getFolderForMediaType('business');

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
      console.warn('Failed to import business image:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async getBusinessRelations(businessId: number) {
    const relations = await this.prisma.$queryRaw<Array<{
      id_relation: number;
      id_business_source: number;
      id_business_related: number;
      type: string;
      precisions: string;
    }>>`
      SELECT id_relation, id_business_source, id_business_related, type, precisions
      FROM ak_business_to_business
      WHERE id_business_source = ${businessId} OR id_business_related = ${businessId}
    `;

    if (!relations || relations.length === 0) {
      return [];
    }

    // Get all related business IDs
    const relatedBusinessIds = relations.map(r =>
      r.id_business_source === businessId ? r.id_business_related : r.id_business_source
    );

    // Fetch business details
    const businesses = await this.prisma.akBusiness.findMany({
      where: {
        idBusiness: {
          in: relatedBusinessIds
        }
      },
      select: {
        idBusiness: true,
        denomination: true,
        type: true,
        image: true,
        origine: true,
        statut: true,
      }
    });

    // Combine business data with relation info
    return relations.map(relation => {
      const relatedBusinessId = relation.id_business_source === businessId
        ? relation.id_business_related
        : relation.id_business_source;
      const relatedBusiness = businesses.find(b => b.idBusiness === relatedBusinessId);

      return {
        id_relation: relation.id_relation,
        id_business: relatedBusinessId,
        denomination: relatedBusiness?.denomination,
        type: relation.type,
        business_type: relatedBusiness?.type,
        precisions: relation.precisions,
        image: relatedBusiness?.image,
        origine: relatedBusiness?.origine,
        statut: relatedBusiness?.statut,
      };
    });
  }

  async addBusinessRelation(
    businessId: number,
    relatedBusinessId: number,
    type?: string,
    precisions?: string,
    username?: string
  ) {
    // Check if both businesses exist
    const [business, relatedBusiness] = await Promise.all([
      this.prisma.akBusiness.findUnique({ where: { idBusiness: businessId } }),
      this.prisma.akBusiness.findUnique({ where: { idBusiness: relatedBusinessId } }),
    ]);

    if (!business) throw new NotFoundException('Business source introuvable');
    if (!relatedBusiness) throw new NotFoundException('Business cible introuvable');

    // Check if relation already exists
    const existing = await this.prisma.$queryRaw<any[]>`
      SELECT 1 FROM ak_business_to_business
      WHERE (id_business_source = ${businessId} AND id_business_related = ${relatedBusinessId})
         OR (id_business_source = ${relatedBusinessId} AND id_business_related = ${businessId})
      LIMIT 1
    `;

    if (existing.length > 0) {
      throw new BadRequestException('Cette relation existe déjà');
    }

    // Create the relation
    await this.prisma.$queryRaw`
      INSERT INTO ak_business_to_business (id_business_source, id_business_related, type, precisions, doublon)
      VALUES (${businessId}, ${relatedBusinessId}, ${type || null}, ${precisions || null}, 0)
    `;

    // Log the action
    if (username) {
      await this.adminLogging.addLog(
        businessId,
        'business',
        username,
        `Ajout relation business: ${relatedBusiness.denomination}`
      );
    }

    return { message: 'Relation business créée avec succès' };
  }

  async deleteBusinessRelation(relationId: number, username?: string) {
    // Get relation details before deletion for logging
    const relation = await this.prisma.$queryRaw<any[]>`
      SELECT id_business_source FROM ak_business_to_business WHERE id_relation = ${relationId}
    `;

    if (relation.length === 0) {
      throw new NotFoundException('Relation introuvable');
    }

    await this.prisma.$queryRaw`
      DELETE FROM ak_business_to_business WHERE id_relation = ${relationId}
    `;

    // Log the action
    if (username && relation[0]) {
      await this.adminLogging.addLog(
        relation[0].id_business_source,
        'business',
        username,
        'Suppression relation business'
      );
    }

    return { message: 'Relation business supprimée avec succès' };
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

