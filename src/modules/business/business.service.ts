import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { BusinessQueryDto } from './dto/business-query.dto';
import { BusinessSearchDto } from './dto/business-search.dto';
import { ImageKitService } from '../media/imagekit.service';

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService, private readonly imageKitService: ImageKitService) {}

  async create(createBusinessDto: CreateBusinessDto) {
    // Check if denomination already exists
    if (createBusinessDto.denomination) {
      const existingBusiness = await this.prisma.akBusiness.findUnique({
        where: { denomination: createBusinessDto.denomination },
      });

      if (existingBusiness) {
        throw new BadRequestException(`Une entité business avec la dénomination "${createBusinessDto.denomination}" existe déjà`);
      }
    }

    const business = await this.prisma.akBusiness.create({
      data: {
        ...createBusinessDto,
        dateAjout: new Date(),
        statut: createBusinessDto.statut ?? 1,
      },
    });

    return this.formatBusiness(business);
  }

  async findAll(query: BusinessQueryDto) {
    const { page = 1, limit = 50, statut, search, type, origine } = query;

    const skip = (page - 1) * limit;
    const where: any = {};

    if (statut !== undefined) {
      where.statut = statut;
    }

    if (search) {
      where.denomination = {
        contains: search,
        mode: 'insensitive',
      };
    }

    if (type) {
      where.type = {
        contains: type,
        mode: 'insensitive',
      };
    }

    if (origine) {
      where.origine = {
        contains: origine,
        mode: 'insensitive',
      };
    }

    const [businesses, total] = await Promise.all([
      this.prisma.akBusiness.findMany({
        where,
        skip,
        take: limit,
        orderBy: { denomination: 'asc' },
      }),
      this.prisma.akBusiness.count({ where }),
    ]);

    return {
      data: businesses.map(this.formatBusiness),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const business = await this.prisma.akBusiness.findUnique({
      where: { idBusiness: id },
    });

    if (!business) {
      throw new NotFoundException('Entité business introuvable');
    }

    return this.formatBusiness(business);
  }

  async update(id: number, updateBusinessDto: UpdateBusinessDto) {
    const existingBusiness = await this.prisma.akBusiness.findUnique({
      where: { idBusiness: id },
    });

    if (!existingBusiness) {
      throw new NotFoundException('Entité business introuvable');
    }

    // Check if denomination is being changed and if it already exists
    if (updateBusinessDto.denomination && updateBusinessDto.denomination !== existingBusiness.denomination) {
      const denominationExists = await this.prisma.akBusiness.findUnique({
        where: { denomination: updateBusinessDto.denomination },
      });

      if (denominationExists) {
        throw new BadRequestException(`Une entité business avec la dénomination "${updateBusinessDto.denomination}" existe déjà`);
      }
    }

    // Attempt to delete old ImageKit image if being replaced
    try {
      if (
        typeof updateBusinessDto.image === 'string' &&
        updateBusinessDto.image &&
        updateBusinessDto.image !== existingBusiness.image &&
        typeof existingBusiness.image === 'string' &&
        existingBusiness.image &&
        /imagekit\.io/.test(existingBusiness.image)
      ) {
        await this.imageKitService.deleteImageByUrl(existingBusiness.image);
      }
    } catch (e) {
      console.warn('Failed to delete previous ImageKit image (business):', (e as Error).message);
    }

    const business = await this.prisma.akBusiness.update({
      where: { idBusiness: id },
      data: updateBusinessDto,
    });

    return this.formatBusiness(business);
  }

  async remove(id: number) {
    const business = await this.prisma.akBusiness.findUnique({
      where: { idBusiness: id },
    });

    if (!business) {
      throw new NotFoundException('Entité business introuvable');
    }

    await this.prisma.akBusiness.delete({
      where: { idBusiness: id },
    });

    return { message: 'Entité business supprimée avec succès' };
  }

  async search(searchDto: BusinessSearchDto) {
    const { q, limit = 10 } = searchDto;

    if (!q || q.trim().length === 0) {
      return { data: [] };
    }

    const businesses = await this.prisma.akBusiness.findMany({
      where: {
        statut: 1,
        denomination: {
          contains: q.trim(),
          mode: 'insensitive',
        },
      },
      select: {
        idBusiness: true,
        denomination: true,
        type: true,
        origine: true,
        siteOfficiel: true,
      },
      orderBy: { denomination: 'asc' },
      take: limit,
    });

    return {
      data: businesses.map((business) => ({
        id: business.idBusiness,
        denomination: business.denomination,
        type: business.type,
        origine: business.origine,
        site_officiel: business.siteOfficiel,
      })),
    };
  }

  async incrementClicks(
    id: number,
    clickType: 'day' | 'week' | 'month' = 'day',
  ) {
    const business = await this.prisma.akBusiness.findUnique({
      where: { idBusiness: id },
    });

    if (!business) {
      throw new NotFoundException('Entité business introuvable');
    }

    const updateData: any = {
      nbClics: {
        increment: 1,
      },
    };

    if (clickType === 'day') {
      updateData.nbClicsDay = {
        increment: 1,
      };
    } else if (clickType === 'week') {
      updateData.nbClicsWeek = {
        increment: 1,
      };
    } else if (clickType === 'month') {
      updateData.nbClicsMonth = {
        increment: 1,
      };
    }

    const updatedBusiness = await this.prisma.akBusiness.update({
      where: { idBusiness: id },
      data: updateData,
    });

    return this.formatBusiness(updatedBusiness);
  }

  async getRelatedAnimes(businessId: number) {
    // Get anime IDs related to this business
    const relations = await this.prisma.$queryRaw<Array<{ id_anime: number; type: string; precisions: string }>>`
      SELECT id_anime, type, precisions
      FROM ak_business_to_animes
      WHERE id_business = ${businessId}
        AND doublon = 0
    `;

    if (!relations || relations.length === 0) {
      return [];
    }

    const animeIds = relations.map(r => r.id_anime);

    // Fetch anime details
    const animes = await this.prisma.$queryRaw<any[]>`
      SELECT
        id_anime,
        nice_url,
        titre,
        annee,
        image,
        format,
        moyennenotes,
        nb_reviews,
        statut
      FROM ak_animes
      WHERE id_anime = ANY(${animeIds}::int[])
        AND statut = 1
      ORDER BY titre
    `;

    // Combine anime data with relation info
    return animes.map(anime => {
      const relation = relations.find(r => r.id_anime === anime.id_anime);
      return {
        id: anime.id_anime,
        idAnime: anime.id_anime,
        niceUrl: anime.nice_url,
        titre: anime.titre,
        annee: anime.annee,
        image: anime.image,
        format: anime.format,
        moyenneNotes: anime.moyennenotes,
        nbReviews: anime.nb_reviews,
        statut: anime.statut,
        relationType: relation?.type,
        relationDetails: relation?.precisions
      };
    });
  }

  async getRelatedMangas(businessId: number) {
    // Get manga IDs related to this business
    const relations = await this.prisma.$queryRaw<Array<{ id_manga: number; type: string; precisions: string }>>`
      SELECT id_manga, type, precisions
      FROM ak_business_to_manga
      WHERE id_business = ${businessId}
        AND doublon = 0
    `;

    if (!relations || relations.length === 0) {
      return [];
    }

    const mangaIds = relations.map(r => r.id_manga);

    // Fetch manga details
    const mangas = await this.prisma.$queryRaw<any[]>`
      SELECT
        id,
        nice_url as "niceUrl",
        titre,
        annee,
        image,
        moyennenotes as "moyenneNotes",
        nb_reviews as "nbReviews",
        statut
      FROM ak_mangas
      WHERE id = ANY(${mangaIds}::int[])
        AND statut = 1
      ORDER BY titre
    `;

    // Combine manga data with relation info
    return mangas.map(manga => {
      const relation = relations.find(r => r.id_manga === manga.id);
      return {
        ...manga,
        relationType: relation?.type,
        relationDetails: relation?.precisions
      };
    });
  }

  private formatBusiness(business: any) {
    const { idBusiness, dateAjout, dateModification, ...otherFields } =
      business;

    return {
      id: idBusiness,
      addedDate: dateAjout?.toISOString(),
      modificationDate: dateModification,
      ...otherFields,
    };
  }
}
