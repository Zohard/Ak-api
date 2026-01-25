import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { BusinessQueryDto } from './dto/business-query.dto';
import { BusinessSearchDto } from './dto/business-search.dto';
import { R2Service } from '../media/r2.service';
import { decodeHTMLEntities } from '../../shared/utils/text.util';
import axios from 'axios';

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService, private readonly r2Service: R2Service) { }

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

    // Attempt to delete old R2 image if being replaced
    try {
      if (
        typeof updateBusinessDto.image === 'string' &&
        updateBusinessDto.image &&
        updateBusinessDto.image !== existingBusiness.image &&
        typeof existingBusiness.image === 'string' &&
        existingBusiness.image &&
        /imagekit\.io/.test(existingBusiness.image)
      ) {
        await this.r2Service.deleteImageByUrl(existingBusiness.image);
      }
    } catch (e) {
      console.warn('Failed to delete previous R2 image (business):', (e as Error).message);
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

    // Delete associated activity logs first
    await this.prisma.$executeRaw`
      DELETE FROM ak_logs_admin WHERE business = ${id}
    `;

    await this.prisma.akBusiness.delete({
      where: { idBusiness: id },
    });

    return { message: 'Entité business supprimée avec succès' };
  }

  async autocomplete(query: string, limit: number = 5) {
    if (!query || query.trim().length < 2) {
      return { data: [] };
    }

    const businesses = await this.prisma.akBusiness.findMany({
      where: {
        statut: 1,
        OR: [
          {
            denomination: {
              contains: query.trim(),
              mode: 'insensitive',
            },
          },
          {
            autresDenominations: {
              contains: query.trim(),
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
        image: true,
        niceUrl: true,
      },
      orderBy: [
        { denomination: 'asc' },
        { idBusiness: 'asc' }
      ],
      take: limit,
    });

    return {
      data: businesses.map(b => ({
        id: b.idBusiness,
        id_business: b.idBusiness,
        idBusiness: b.idBusiness,
        denomination: b.denomination,
        type: b.type,
        origine: b.origine,
        image: b.image,
        niceUrl: b.niceUrl,
      }))
    };
  }

  async search(searchDto: BusinessSearchDto) {
    const term = q.trim();
    if (term.length === 0) {
      return { data: [] };
    }

    // 1. Search for items starting with the query (Primary matches)
    const startsWithMatches = await this.prisma.akBusiness.findMany({
      where: {
        statut: 1,
        denomination: {
          startsWith: term,
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

    let finalBusinesses = [...startsWithMatches];

    // 2. If we haven't reached the limit, search for other matches
    if (finalBusinesses.length < limit) {
      const remainingLimit = limit - finalBusinesses.length;
      const existingIds = finalBusinesses.map(b => b.idBusiness);

      const otherMatches = await this.prisma.akBusiness.findMany({
        where: {
          statut: 1,
          idBusiness: { notIn: existingIds },
          OR: [
            {
              denomination: {
                contains: term,
                mode: 'insensitive',
              },
            },
            {
              autresDenominations: {
                contains: term,
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
        take: remainingLimit,
      });

      finalBusinesses = [...finalBusinesses, ...otherMatches];
    }

    return {
      data: finalBusinesses.map((business) => ({
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

  async getRelatedAnimes(businessId: number, page?: number, limit?: number) {
    // Get total count of UNIQUE animes (not relations) with statut = 1
    const countResult = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT bta.id_anime)::int as count
      FROM ak_business_to_animes bta
      INNER JOIN ak_animes a ON a.id_anime = bta.id_anime
      WHERE bta.id_business = ${businessId}
        AND bta.doublon = 0
        AND a.statut = 1
    `;
    const total = Number(countResult[0]?.count || 0);

    if (total === 0) {
      return { data: [], pagination: { total, page: 1, limit: limit || 18, hasMore: false } };
    }

    // Calculate pagination
    const currentPage = page || 1;
    const pageLimit = limit || 18;
    const offset = (currentPage - 1) * pageLimit;

    // Get DISTINCT anime IDs with their first relation type - only valid animes
    const relations = await this.prisma.$queryRaw<Array<{ id_anime: number; type: string; precisions: string; min_relation: number }>>`
      SELECT DISTINCT ON (bta.id_anime)
        bta.id_anime,
        bta.type,
        bta.precisions,
        bta.id_relation as min_relation
      FROM ak_business_to_animes bta
      INNER JOIN ak_animes a ON a.id_anime = bta.id_anime
      WHERE bta.id_business = ${businessId}
        AND bta.doublon = 0
        AND a.statut = 1
      ORDER BY bta.id_anime, bta.id_relation
      LIMIT ${pageLimit} OFFSET ${offset}
    `;

    if (!relations || relations.length === 0) {
      return { data: [], pagination: { total, page: currentPage, limit: pageLimit, hasMore: false } };
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
    const data = animes.map(anime => {
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

    return {
      data,
      pagination: {
        total,
        page: currentPage,
        limit: pageLimit,
        hasMore: offset + data.length < total
      }
    };
  }

  async getRelatedMangas(businessId: number, page?: number, limit?: number) {
    // Get total count of UNIQUE mangas (not relations) with statut = 1
    const countResult = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT btm.id_manga)::int as count
      FROM ak_business_to_mangas btm
      INNER JOIN ak_mangas m ON m.id_manga = btm.id_manga
      WHERE btm.id_business = ${businessId}
        AND btm.doublon = 0
        AND m.statut = 1
    `;
    const total = Number(countResult[0]?.count || 0);

    if (total === 0) {
      return { data: [], pagination: { total, page: 1, limit: limit || 18, hasMore: false } };
    }

    // Calculate pagination
    const currentPage = page || 1;
    const pageLimit = limit || 18;
    const offset = (currentPage - 1) * pageLimit;

    // Get DISTINCT manga IDs with their first relation type - only valid mangas
    const relations = await this.prisma.$queryRaw<Array<{ id_manga: number; type: string; precisions: string; min_relation: number }>>`
      SELECT DISTINCT ON (btm.id_manga)
        btm.id_manga,
        btm.type,
        btm.precisions,
        btm.id_relation as min_relation
      FROM ak_business_to_mangas btm
      INNER JOIN ak_mangas m ON m.id_manga = btm.id_manga
      WHERE btm.id_business = ${businessId}
        AND btm.doublon = 0
        AND m.statut = 1
      ORDER BY btm.id_manga, btm.id_relation
      LIMIT ${pageLimit} OFFSET ${offset}
    `;

    if (!relations || relations.length === 0) {
      return { data: [], pagination: { total, page: currentPage, limit: pageLimit, hasMore: false } };
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
    const data = mangas.map(manga => {
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

    return {
      data,
      pagination: {
        total,
        page: currentPage,
        limit: pageLimit,
        hasMore: offset + data.length < total
      }
    };
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

  async getBusinessArticles(id: number) {
    // First check if business exists
    const business = await this.prisma.akBusiness.findUnique({
      where: { idBusiness: id, statut: 1 },
      select: { idBusiness: true },
    });

    if (!business) {
      throw new NotFoundException('Entité business introuvable');
    }

    // Get articles linked to this business
    const articles = await this.prisma.akWebzineToFiches.findMany({
      where: {
        idFiche: id,
        type: 'business',
      },
      include: {
        wpPost: {
          select: {
            ID: true,
            postTitle: true,
            postContent: true,
            postExcerpt: true,
            postDate: true,
            postName: true,
            postStatus: true,
            postMeta: {
              where: {
                metaKey: {
                  in: ['imgunebig', 'imgunebig2', 'ak_img', 'img'],
                },
              },
              select: {
                metaKey: true,
                metaValue: true,
              },
            },
          },
        },
      },
      orderBy: {
        idRelation: 'desc',
      },
    });

    // Format the response
    return articles
      .filter((article) => article.wpPost !== null && article.wpPost.postStatus === 'publish')
      .map((article) => {
        // TypeScript now knows wpPost is not null due to the filter above
        const post = article.wpPost!;

        // Extract cover image from postMeta (prioritize imgunebig like ArticleCard)
        const imgunebigMeta = post.postMeta.find(meta => meta.metaKey === 'imgunebig');
        const imgunebig2Meta = post.postMeta.find(meta => meta.metaKey === 'imgunebig2');
        const akImgMeta = post.postMeta.find(meta => meta.metaKey === 'ak_img');
        const imgMeta = post.postMeta.find(meta => meta.metaKey === 'img');

        const coverImage = imgunebigMeta?.metaValue ||
          imgunebig2Meta?.metaValue ||
          akImgMeta?.metaValue ||
          imgMeta?.metaValue ||
          null;

        return {
          id: post.ID,
          title: post.postTitle,
          excerpt: post.postExcerpt,
          content: post.postContent,
          date: post.postDate,
          slug: post.postName,
          coverImage,
        };
      });
  }

  async uploadImageFromUrl(imageUrl: string, customFileName?: string) {
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
      let filename: string;

      if (customFileName && customFileName.trim()) {
        // Use custom filename with safe characters and timestamp
        const safeName = this.r2Service.createSafeFileName(customFileName);
        filename = `${safeName}.${extension}`;
      } else {
        // Default filename
        filename = `business_${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;
      }

      // Upload to R2
      const folder = 'images/business';
      const uploadResult = await this.r2Service.uploadImage(
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
