import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { BusinessQueryDto } from './dto/business-query.dto';
import { BusinessSearchDto } from './dto/business-search.dto';
import { ImageKitService } from '../media/imagekit.service';
import { decodeHTMLEntities } from '../../shared/utils/text.util';
import axios from 'axios';

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
      where.OR = [
        {
          denomination: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          autresDenominations: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
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
        OR: [
          {
            denomination: {
              contains: q.trim(),
              mode: 'insensitive',
            },
          },
          {
            autresDenominations: {
              contains: q.trim(),
              mode: 'insensitive',
            },
          },
        ],
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
      FROM ak_business_to_mangas
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
        id_manga,
        nice_url as "niceUrl",
        titre,
        annee,
        image,
        moyennenotes as "moyenneNotes",
        nb_reviews as "nbReviews",
        statut
      FROM ak_mangas
      WHERE id_manga = ANY(${mangaIds}::int[])
        AND statut = 1
      ORDER BY titre
    `;

    // Combine manga data with relation info
    return mangas.map(manga => {
      const relation = relations.find(r => r.id_manga === manga.id_manga);
      return {
        id: manga.id_manga,
        idManga: manga.id_manga,
        niceUrl: manga.niceUrl,
        titre: manga.titre,
        annee: manga.annee,
        image: manga.image,
        moyenneNotes: manga.moyenneNotes,
        nbReviews: manga.nbReviews,
        statut: manga.statut,
        relationType: relation?.type,
        relationDetails: relation?.precisions
      };
    });
  }

  async getRelatedGames(businessId: number) {
    // Get video game IDs related to this business
    const relations = await this.prisma.$queryRaw<Array<{ id_jeu: number; type: string }>>`
      SELECT id_jeu, type
      FROM ak_business_to_jeux
      WHERE id_business = ${businessId}
    `;

    if (!relations || relations.length === 0) {
      return [];
    }

    const gameIds = relations.map(r => r.id_jeu);

    // Fetch game details
    const games = await this.prisma.$queryRaw<any[]>`
      SELECT
        id_jeu,
        nice_url,
        titre,
        annee,
        image,
        plateforme,
        moyenne_notes,
        nb_reviews,
        statut
      FROM ak_jeux_video
      WHERE id_jeu = ANY(${gameIds}::int[])
        AND statut = 1
      ORDER BY titre
    `;

    // Combine game data with relation info
    return games.map(game => {
      const relation = relations.find(r => r.id_jeu === game.id_jeu);
      return {
        id: game.id_jeu,
        idJeu: game.id_jeu,
        niceUrl: game.nice_url,
        titre: game.titre,
        annee: game.annee,
        image: game.image,
        plateforme: game.plateforme,
        moyenneNotes: game.moyenne_notes,
        nbReviews: game.nb_reviews,
        statut: game.statut,
        relationType: relation?.type
      };
    });
  }

  async getRelatedBusinesses(businessId: number) {
    // Get business IDs related to this business (both as source and related)
    const relations = await this.prisma.$queryRaw<
      Array<{
        id_business_source: number;
        id_business_related: number;
        type: string;
        precisions: string | null;
      }>
    >`
      SELECT id_business_source, id_business_related, type, precisions
      FROM ak_business_to_business
      WHERE (id_business_source = ${businessId} OR id_business_related = ${businessId})
        AND doublon = 0
    `;

    if (!relations || relations.length === 0) {
      return [];
    }

    // Collect all related business IDs (excluding the current business)
    const relatedBusinessIds = new Set<number>();
    relations.forEach(r => {
      if (r.id_business_source !== businessId) {
        relatedBusinessIds.add(r.id_business_source);
      }
      if (r.id_business_related !== businessId) {
        relatedBusinessIds.add(r.id_business_related);
      }
    });

    const businessIds = Array.from(relatedBusinessIds);

    if (businessIds.length === 0) {
      return [];
    }

    // Fetch business details
    const businesses = await this.prisma.$queryRaw<any[]>`
      SELECT
        id_business,
        nice_url,
        denomination,
        autres_denominations,
        type,
        image,
        origine,
        date,
        site_officiel,
        nb_clics,
        statut
      FROM ak_business
      WHERE id_business = ANY(${businessIds}::int[])
        AND statut = 1
      ORDER BY denomination
    `;

    // Combine business data with relation info
    return businesses.map(business => {
      // Find the relation for this business
      const relation = relations.find(r =>
        (r.id_business_source === business.id_business && r.id_business_related === businessId) ||
        (r.id_business_related === business.id_business && r.id_business_source === businessId)
      );

      // Determine relation direction for better UX
      const isSource = relation?.id_business_source === businessId;

      return {
        id: business.id_business,
        idBusiness: business.id_business,
        niceUrl: business.nice_url,
        denomination: business.denomination,
        autresDenominations: business.autres_denominations,
        type: business.type,
        image: business.image,
        origine: business.origine,
        date: business.date,
        siteOfficiel: business.site_officiel,
        nbClics: business.nb_clics,
        statut: business.statut,
        relationType: relation?.type,
        relationPrecisions: relation?.precisions,
        relationDirection: isSource ? 'from' : 'to'
      };
    });
  }

  async uploadImageFromUrl(imageUrl: string) {
    try {
      // Download the image from the URL
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 second timeout
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.data) {
        throw new BadRequestException('Failed to download image from URL');
      }

      // Detect image type from Content-Type header
      const contentType = response.headers['content-type'] || 'image/jpeg';
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

      if (!validTypes.includes(contentType)) {
        throw new BadRequestException(
          `Invalid image type: ${contentType}. Only JPEG, PNG, WebP, and GIF are allowed.`,
        );
      }

      // Generate filename
      const extension = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
      const filename = `business_${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;

      // Upload to ImageKit
      const folder = '/images/business';
      const uploadResult = await this.imageKitService.uploadImage(
        Buffer.from(response.data),
        filename,
        folder,
      );

      return {
        filename: uploadResult.name,
        url: uploadResult.url,
        imagekitFileId: uploadResult.fileId,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new BadRequestException(`Failed to download image: ${error.message}`);
      }
      throw error;
    }
  }

  private formatBusiness(business: any) {
    const { idBusiness, dateAjout, dateModification, autresDenominations, denomination, notes, ...otherFields } =
      business;

    return {
      id: idBusiness,
      addedDate: dateAjout?.toISOString(),
      modificationDate: dateModification,
      denomination: decodeHTMLEntities(denomination),
      autresDenominations: decodeHTMLEntities(autresDenominations),
      notes: decodeHTMLEntities(notes),
      ...otherFields,
    };
  }
}
