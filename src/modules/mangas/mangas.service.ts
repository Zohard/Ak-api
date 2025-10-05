import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { BaseContentService } from '../../shared/services/base-content.service';
import { CreateMangaDto } from './dto/create-manga.dto';
import { UpdateMangaDto } from './dto/update-manga.dto';
import { MangaQueryDto } from './dto/manga-query.dto';
import { RelatedContentItem, RelationsResponse } from '../shared/types/relations.types';
import { ImageKitService } from '../media/imagekit.service';
import { AniListService } from '../anilist/anilist.service';
import { Prisma } from '@prisma/client';
import axios from 'axios';

@Injectable()
export class MangasService extends BaseContentService<
  any,
  CreateMangaDto,
  UpdateMangaDto,
  MangaQueryDto
> {
  constructor(
    prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly imageKitService: ImageKitService,
    private readonly aniListService: AniListService,
  ) {
    super(prisma);
  }

  protected get model() {
    return this.prisma.akManga;
  }

  protected get idField() {
    return 'idManga';
  }

  protected get tableName() {
    return 'ak_mangas';
  }

  protected getAutocompleteSelectFields() {
    return {
      idManga: true,
      titre: true,
      annee: true,
      auteur: true,
      image: true,
    };
  }

  protected formatAutocompleteItem(manga: any) {
    return {
      id_manga: manga.idManga,
      titre: manga.titre,
      annee: manga.annee,
      auteur: manga.auteur,
      image: manga.image,
    };
  }

  protected formatItem(manga: any) {
    return this.formatManga(manga);
  }

  async create(createMangaDto: CreateMangaDto, userId: number) {
    // Merge with AniList if anilistId provided
    let data: any = { ...createMangaDto };
    if ((createMangaDto as any).anilistId) {
      try {
        const anilistId = Number((createMangaDto as any).anilistId);
        const anilistManga = await this.aniListService.getMangaById(anilistId);
        if (anilistManga) {
          const anilistData = this.aniListService.mapToCreateMangaDto(anilistManga);
          data = {
            ...anilistData,
            ...data,
            commentaire: JSON.stringify({
              ...(anilistData.commentaire ? JSON.parse(anilistData.commentaire) : {}),
              anilistId,
              originalData: anilistManga,
            }),
          };
        }
      } catch (error: any) {
        console.warn(`Failed to fetch AniList manga for ID ${(createMangaDto as any).anilistId}:`, error.message);
      }
    }

    delete (data as any).anilistId;

    const manga = await this.prisma.akManga.create({
      data: {
        ...data,
        dateAjout: new Date(),
        statut: data.statut ?? 0,
      } as any,
      include: {
        reviews: {
          take: 3,
          orderBy: { dateCritique: 'desc' },
          include: {
            membre: {
              select: {
                idMember: true,
                memberName: true,
              },
            },
          },
        },
      },
    });

    return this.formatManga(manga);
  }

  async findAll(query: MangaQueryDto) {
    const {
      page = 1,
      limit = 20,
      search,
      auteur,
      annee,
      statut,
      genre,
      sortBy = 'dateAjout',
      sortOrder = 'desc',
      includeReviews = false,
    } = query;

    // Create cache key from query parameters
    const cacheKey = this.createCacheKey(query);
    
    // Try to get from cache first
    const cached = await this.cacheService.getMangaList(cacheKey);
    if (cached) {
      return cached;
    }

    const skip = ((page || 1) - 1) * (limit || 20);

    const where: any = {};

    if (search) {
      where.OR = [
        { titre: { contains: search, mode: 'insensitive' } },
        { synopsis: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (auteur) {
      where.businessRelations = {
        some: {
          type: 'Auteur',
          business: {
            denomination: { contains: auteur, mode: 'insensitive' },
          },
        },
      };
    }

    if (annee) {
      where.annee = annee;
    }

    if (statut !== undefined) {
      where.statut = statut;
    }

    // Handle genre filtering via tags (supports multiple genres, AND logic)
    if (genre && genre.length > 0) {
      // URL decode all genre parameters
      const decodedGenres = genre.map(g => decodeURIComponent(g.replace(/\+/g, ' ')));

      let mangaIdsWithGenres: any[] = [];

      if (decodedGenres.length > 0) {
        const genresLower = decodedGenres.map(g => g.toLowerCase());
        mangaIdsWithGenres = await this.prisma.$queryRaw<Array<{ manga_id: number }>>`
          SELECT tf.id_fiche AS manga_id
          FROM ak_tags t
          INNER JOIN ak_tag2fiche tf ON t.id_tag = tf.id_tag
          WHERE LOWER(t.tag_name) IN (${Prisma.join(genresLower)})
            AND tf.type = 'manga'
          GROUP BY tf.id_fiche
          HAVING COUNT(DISTINCT LOWER(t.tag_name)) = ${genresLower.length}
        `;
      }

      const mangaIds = (mangaIdsWithGenres as any[]).map(row => row.manga_id).filter((id: number) => id !== undefined);

      if (mangaIds.length > 0) {
        where.idManga = { in: mangaIds };
      } else {
        where.idManga = { in: [] };
      }
    }

    const orderBy = { [sortBy || 'dateAjout']: sortOrder || 'desc' };

    const include: any = {};
    if (includeReviews) {
      include.reviews = {
        take: 5,
        orderBy: { dateCritique: 'desc' },
        include: {
          membre: {
            select: {
              idMember: true,
              memberName: true,
            },
          },
        },
      };
    }

    const [mangas, total] = await Promise.all([
      this.prisma.akManga.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include,
      }),
      this.prisma.akManga.count({ where }),
    ]);

    const result = {
      mangas: mangas.map(this.formatManga),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / (limit || 20)),
      },
    };

    // Cache the result (TTL based on query complexity)
    const ttl = search || genre ? 180 : 300; // 3 mins for search, 5 mins for general lists
    await this.cacheService.setMangaList(cacheKey, result, ttl);

    return result;
  }

  async findOne(id: number, includeReviews = false) {
    // Try to get from cache first
    const cacheKey = `${id}_${includeReviews}`;
    const cached = await this.cacheService.getManga(parseInt(cacheKey.replace(/[^0-9]/g, '')));
    if (cached && cached.includeReviews === includeReviews) {
      return cached.data;
    }

    const include: any = {};

    if (includeReviews) {
      include.reviews = {
        include: {
          membre: {
            select: {
              idMember: true,
              memberName: true,
              avatar: true,
            },
          },
        },
        orderBy: { dateCritique: 'desc' },
      };
    }

    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: id },
      include,
    });

    if (!manga) {
      throw new NotFoundException('Manga introuvable');
    }

    const formattedManga = this.formatManga(manga);
    
    // Cache the result
    const cacheData = {
      data: formattedManga,
      includeReviews,
    };
    await this.cacheService.setManga(id, cacheData, 600); // 10 minutes

    return formattedManga;
  }

  async update(
    id: number,
    updateMangaDto: UpdateMangaDto,
    userId: number,
    isAdmin = false,
  ) {
    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: id },
    });

    if (!manga) {
      throw new NotFoundException('Manga introuvable');
    }

    if (manga.statut === 1 && !isAdmin) {
      throw new ForbiddenException(
        'Seul un administrateur peut modifier un manga validé',
      );
    }

    // If replacing image and previous image is an ImageKit URL, attempt deletion in IK
    try {
      if (
        typeof updateMangaDto.image === 'string' &&
        updateMangaDto.image &&
        updateMangaDto.image !== manga.image &&
        typeof manga.image === 'string' &&
        manga.image &&
        /imagekit\.io/.test(manga.image)
      ) {
        await this.imageKitService.deleteImageByUrl(manga.image);
      }
    } catch (e) {
      console.warn('Failed to delete previous ImageKit image (manga):', (e as Error).message);
    }

    // Merge with AniList if anilistId provided in update
    let updateData: any = { ...updateMangaDto };
    if ((updateMangaDto as any).anilistId) {
      try {
        const anilistId = Number((updateMangaDto as any).anilistId);
        const anilistManga = await this.aniListService.getMangaById(anilistId);
        if (anilistManga) {
          const anilistData = this.aniListService.mapToCreateMangaDto(anilistManga);
          updateData = {
            ...anilistData,
            ...updateData,
            commentaire: JSON.stringify({
              ...(anilistData.commentaire ? JSON.parse(anilistData.commentaire) : {}),
              anilistId,
              originalData: anilistManga,
            }),
          };
        }
      } catch (error: any) {
        console.warn(`Failed to fetch AniList manga for ID ${(updateMangaDto as any).anilistId}:`, error.message);
      }
    }

    delete (updateData as any).anilistId;

    const updatedManga = await this.prisma.akManga.update({
      where: { idManga: id },
      data: updateData,
      include: {
        reviews: {
          include: {
            membre: {
              select: {
                idMember: true,
                memberName: true,
              },
            },
          },
          take: 3,
          orderBy: { dateCritique: 'desc' },
        },
      },
    });

    // Invalidate caches after update
    await this.invalidateMangaCache(id);

    return this.formatManga(updatedManga);
  }

  async remove(id: number, userId: number, isAdmin = false) {
    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: id },
    });

    if (!manga) {
      throw new NotFoundException('Manga introuvable');
    }

    if (!isAdmin) {
      throw new ForbiddenException(
        'Seul un administrateur peut supprimer un manga',
      );
    }

    await this.prisma.akManga.delete({
      where: { idManga: id },
    });

    // Invalidate caches after removal
    await this.invalidateMangaCache(id);

    return { message: 'Manga supprimé avec succès' };
  }

  async getTopMangas(limit = 10) {
    // Try to get from cache first
    const cached = await this.cacheService.getTopContent('manga', limit);
    if (cached) {
      return cached;
    }

    const mangas = await this.prisma.executeWithRetry(() =>
      this.prisma.akManga.findMany({
        where: {
          statut: 1,
        },
        orderBy: [{ dateAjout: 'desc' }],
        take: limit,
        include: {
          reviews: {
            take: 2,
            orderBy: { dateCritique: 'desc' },
            include: {
              membre: {
                select: {
                  idMember: true,
                  memberName: true,
                },
              },
            },
          },
        },
      })
    );

    const result = {
      topMangas: mangas.map(this.formatManga),
      generatedAt: new Date().toISOString(),
    };

    // Cache for 15 minutes
    await this.cacheService.setTopContent('manga', limit, result, 900);

    return result;
  }

  async searchAniList(query: string, limit = 10) {
    try {
      const cacheKey = `anilist_manga_search:${this.hashQuery(query)}:${limit}`;
      const cached = await this.cacheService.get(cacheKey);
      if (cached) return cached;

      const results = await this.aniListService.searchManga(query, limit);
      const result = {
        mangas: results,
        total: results.length,
        query,
        source: 'AniList',
      };

      await this.cacheService.set(cacheKey, result, 7200);
      return result;
    } catch (error: any) {
      console.error('Error searching AniList (manga):', error.message);
      throw new Error('Failed to search AniList for manga');
    }
  }

  async lookupByIsbn(isbn: string) {
    try {
      // Validate ISBN format (ISBN-10 or ISBN-13)
      const cleanIsbn = isbn.replace(/[-\s]/g, '');
      if (!/^\d{10}(\d{3})?$/.test(cleanIsbn)) {
        throw new BadRequestException('Invalid ISBN format. Must be ISBN-10 or ISBN-13');
      }

      // Try Google Books API first
      const googleBooksUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`;
      const googleResponse = await axios.get(googleBooksUrl, { timeout: 10000 });

      if (!googleResponse.data.items || googleResponse.data.items.length === 0) {
        throw new NotFoundException('No book found with this ISBN');
      }

      const bookInfo = googleResponse.data.items[0].volumeInfo;
      const rawTitle = bookInfo.title || '';
      const authors = bookInfo.authors ? bookInfo.authors.join(', ') : '';
      const description = bookInfo.description || '';
      const thumbnail = bookInfo.imageLinks?.thumbnail || bookInfo.imageLinks?.smallThumbnail || null;

      // Clean the title for better AniList matching
      // Remove volume/tome indicators and numbers
      let cleanedTitle = rawTitle
        // Remove common volume patterns (French)
        .replace(/[,\s]*tome\s+\d+/gi, '')
        .replace(/[,\s]*volume\s+\d+/gi, '')
        .replace(/[,\s]*vol\.?\s*\d+/gi, '')
        .replace(/[,\s]*t\.?\s*\d+/gi, '')
        // Remove common volume patterns (English)
        .replace(/[,\s]*vol(ume)?\.?\s*\d+/gi, '')
        // Remove edition info
        .replace(/[,\s]*\d+(st|nd|rd|th)\s+edition/gi, '')
        .replace(/[,\s]*édition\s+\d+/gi, '')
        // Remove trailing numbers and punctuation
        .replace(/[,\s]*\d+\s*$/, '')
        .replace(/[,\-:\s]+$/, '')
        .trim();

      console.log('ISBN lookup - Raw title:', rawTitle);
      console.log('ISBN lookup - Cleaned title:', cleanedTitle);

      // Try multiple search strategies
      let anilistResults = [];

      // Strategy 1: Search with cleaned title
      if (cleanedTitle) {
        anilistResults = await this.aniListService.searchManga(cleanedTitle, 5);
        console.log('ISBN lookup - Results from cleaned title:', anilistResults.length);
      }

      // Strategy 2: If no results, try with raw title
      if (anilistResults.length === 0 && rawTitle !== cleanedTitle) {
        anilistResults = await this.aniListService.searchManga(rawTitle, 5);
        console.log('ISBN lookup - Results from raw title:', anilistResults.length);
      }

      // Strategy 3: If still no results and we have an author, try searching by author
      if (anilistResults.length === 0 && authors) {
        const firstAuthor = authors.split(',')[0].trim();
        anilistResults = await this.aniListService.searchManga(firstAuthor, 5);
        console.log('ISBN lookup - Results from author search:', anilistResults.length);
      }

      return {
        isbn: cleanIsbn,
        bookInfo: {
          title: rawTitle,
          authors,
          description,
          thumbnail,
          publishedDate: bookInfo.publishedDate,
          pageCount: bookInfo.pageCount,
        },
        anilistResults: anilistResults.map(manga => ({
          id: manga.id,
          title: manga.title,
          coverImage: manga.coverImage,
          description: manga.description,
          chapters: manga.chapters,
          volumes: manga.volumes,
          startDate: manga.startDate,
          genres: manga.genres,
          staff: manga.staff,
        })),
        message: anilistResults.length > 0
          ? 'Book found. Please select the matching manga from AniList results.'
          : 'Book found but no matching manga on AniList. You may need to search manually.',
      };
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error in ISBN lookup:', error.message);
      throw new BadRequestException('Failed to lookup ISBN. Please try again.');
    }
  }

  // Use inherited autocomplete() method

  async getMangaTags(id: number) {
    return this.getTags(id, 'manga');
  }

  async getMangaRelations(id: number): Promise<RelationsResponse> {
    // First check if manga exists
    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: id, statut: 1 },
      select: { idManga: true },
    });

    if (!manga) {
      throw new NotFoundException('Manga introuvable');
    }

    // Get relations where this manga is the source using raw SQL
    const relations = await this.prisma.$queryRaw`
      SELECT id_relation, id_fiche_depart, id_anime, id_manga 
      FROM ak_fiche_to_fiche 
      WHERE id_fiche_depart = ${`manga${id}`}
    ` as any[];

    const relatedContent: RelatedContentItem[] = [];

    // Process each relation to get the actual content
    for (const relation of relations) {
      if (relation.id_anime && relation.id_anime > 0) {
        // Related anime
        const relatedAnime = await this.prisma.akAnime.findUnique({
          where: { idAnime: relation.id_anime, statut: 1 },
          select: {
            idAnime: true,
            titre: true,
            image: true,
            annee: true,
            moyenneNotes: true,
            niceUrl: true,
          },
        });
        
        if (relatedAnime) {
          relatedContent.push({
            id: relatedAnime.idAnime,
            type: 'anime',
            title: relatedAnime.titre,
            image: relatedAnime.image,
            year: relatedAnime.annee,
            rating: relatedAnime.moyenneNotes,
            niceUrl: relatedAnime.niceUrl,
            relationType: 'related',
          });
        }
      } else if (relation.id_manga && relation.id_manga > 0) {
        // Related manga
        const relatedManga = await this.prisma.akManga.findUnique({
          where: { idManga: relation.id_manga, statut: 1 },
          select: {
            idManga: true,
            titre: true,
            image: true,
            annee: true,
            moyenneNotes: true,
            niceUrl: true,
          },
        });
        
        if (relatedManga) {
          relatedContent.push({
            id: relatedManga.idManga,
            type: 'manga',
            title: relatedManga.titre,
            image: relatedManga.image,
            year: relatedManga.annee,
            rating: relatedManga.moyenneNotes,
            niceUrl: relatedManga.niceUrl,
            relationType: 'related',
          });
        }
      }
    }

    return {
      manga_id: id,
      relations: relatedContent,
      total: relatedContent.length,
    };
  }

  async getMangaStaff(id: number) {
    // First check if manga exists
    const manga = await this.prisma.akManga.findUnique({
      where: { idManga: id, statut: 1 },
      select: { idManga: true },
    });

    if (!manga) {
      throw new NotFoundException('Manga introuvable');
    }

    // Get staff/business relations
    const staff = await this.prisma.$queryRaw`
      SELECT 
        bs.id_relation as idRelation,
        bs.id_manga as idManga,
        bs.id_business as idBusiness,
        bs.type,
        bs.precisions,
        b.denomination,
        b.autres_denominations as autresDenominations,
        b.type as businessType,
        b.image,
        b.notes,
        b.origine,
        b.site_officiel as siteOfficiel,
        b.date,
        b.statut
      FROM ak_business_to_mangas bs
      JOIN ak_business b ON bs.id_business = b.id_business
      WHERE bs.id_manga = ${id}
      ORDER BY bs.type, b.denomination
    ` as any[];

    return {
      manga_id: id,
      staff: staff.map((s: any) => ({
        ...s,
        business: {
          idBusiness: s.idBusiness,
          denomination: s.denomination,
          autresDenominations: s.autresDenominations,
          type: s.businessType,
          image: s.image,
          notes: s.notes,
          origine: s.origine,
          siteOfficiel: s.siteOfficiel,
          date: s.date,
          statut: s.statut,
        },
      })),
    };
  }

  async getRandomManga() {
    return this.getRandomItem();
  }

  // Use inherited getGenres() method

  async getItemsByGenre(genre: string, limit = 20, statusFilter = 1) {
    // URL decode the genre parameter
    const decodedGenre = decodeURIComponent(genre.replace(/\+/g, ' '));

    // Get manga IDs that have the specified genre tag
    const mangaIdsWithGenre = await this.prisma.$queryRaw`
      SELECT DISTINCT tf.id_fiche as manga_id
      FROM ak_tags t
      INNER JOIN ak_tag2fiche tf ON t.id_tag = tf.id_tag
      WHERE LOWER(t.tag_name) = LOWER(${decodedGenre})
        AND tf.type = 'manga'
    `;

    const mangaIds = (mangaIdsWithGenre as any[]).map(row => row.manga_id);

    if (mangaIds.length === 0) {
      return {
        genre: decodedGenre,
        ak_mangas: [],
        count: 0,
      };
    }

    const mangas = await this.prisma.akManga.findMany({
      where: {
        idManga: { in: mangaIds },
        statut: statusFilter,
      },
      take: limit,
      orderBy: { moyenneNotes: 'desc' },
    });

    return {
      genre: decodedGenre,
      ak_mangas: mangas.map(this.formatManga.bind(this)),
      count: mangas.length,
    };
  }

  async getMangasByGenre(genre: string, limit = 20) {
    const result = await this.getItemsByGenre(genre, limit);
    return {
      genre: result.genre,
      mangas: result.ak_mangas,
      count: result.count,
    };
  }

  async getMostPopularMangaTags(limit = 20) {
    const cacheKey = `popular_manga_tags:${limit}`;
    
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const tags = await this.prisma.$queryRaw`
      SELECT 
        t.id_tag,
        t.tag_name,
        t.tag_nice_url,
        t.description,
        t.categorie,
        COUNT(tf.id_fiche) as usage_count
      FROM ak_tags t
      INNER JOIN ak_tag2fiche tf ON t.id_tag = tf.id_tag
      INNER JOIN ak_mangas m ON tf.id_fiche = m.id_manga
      WHERE tf.type = 'manga' AND m.statut = 1
      GROUP BY t.id_tag, t.tag_name, t.tag_nice_url, t.description, t.categorie
      ORDER BY usage_count DESC, t.tag_name ASC
      LIMIT ${limit}
    ` as any[];

    const result = {
      tags: tags.map(tag => ({
        id_tag: tag.id_tag,
        tag_name: tag.tag_name,
        tag_nice_url: tag.tag_nice_url,
        description: tag.description,
        categorie: tag.categorie,
        usage_count: Number(tag.usage_count),
      })),
      total: tags.length,
      generatedAt: new Date().toISOString(),
    };

    await this.cacheService.set(cacheKey, result, 86400); // 24 hours
    
    return result;
  }

  private formatManga(manga: any) {
    const { idManga, dateAjout, image, ...otherFields } = manga;

    return {
      id: idManga,
      addedDate: dateAjout?.toISOString(),
      image: image ? (typeof image === 'string' && /^https?:\/\//.test(image) ? image : `/api/media/serve/manga/${image}`) : null,
      ...otherFields,
    };
  }

  // Cache helper methods
  private createCacheKey(query: MangaQueryDto): string {
    const {
      page = 1,
      limit = 20,
      search = '',
      auteur = '',
      annee = '',
      statut = '',
      genre = [],
      sortBy = 'dateAjout',
      sortOrder = 'desc',
      includeReviews = false,
    } = query;

    const genreKey = Array.isArray(genre) ? genre.sort().join(',') : (genre as any || '');
    return `${page}_${limit}_${search}_${auteur}_${annee}_${statut}_${genreKey}_${sortBy}_${sortOrder}_${includeReviews}`;
  }

  // Cache invalidation methods
  async invalidateMangaCache(id: number): Promise<void> {
    await this.cacheService.invalidateManga(id);
    // Also invalidate related caches
    await this.cacheService.invalidateSearchCache();
  }

  // Utility method to create consistent cache keys
  private hashQuery(query: string): string {
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}
