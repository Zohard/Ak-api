import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewQueryDto } from './dto/review-query.dto';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async create(createReviewDto: CreateReviewDto, userId: number) {
    const { idAnime, idManga, ...reviewData } = createReviewDto;

    // Validate that either anime or manga is specified, but not both
    if ((!idAnime && !idManga) || (idAnime && idManga)) {
      throw new BadRequestException(
        'Vous devez spécifier soit un anime soit un manga, mais pas les deux',
      );
    }

    // Check if anime/manga exists
    if (idAnime) {
      const anime = await this.prisma.akAnime.findUnique({
        where: { idAnime },
      });
      if (!anime) {
        throw new NotFoundException('Anime introuvable');
      }
    }

    if (idManga) {
      const manga = await this.prisma.akManga.findUnique({
        where: { idManga },
      });
      if (!manga) {
        throw new NotFoundException('Manga introuvable');
      }
    }

    // Check if user already has a review for this anime/manga
    const existingReview = await this.prisma.akCritique.findFirst({
      where: {
        idMembre: userId,
        ...(idAnime && { idAnime }),
        ...(idManga && { idManga }),
      },
    });

    if (existingReview) {
      throw new BadRequestException(
        'Vous avez déjà une critique pour ce contenu',
      );
    }

    const review = await this.prisma.akCritique.create({
      data: {
        ...reviewData,
        idMembre: userId,
        idAnime,
        idManga,
        dateCritique: new Date(),
      } as any,
      include: {
        membre: {
          select: {
            idMember: true,
            memberName: true,
            avatar: true,
          },
        },
        anime: idAnime
          ? {
              select: {
                idAnime: true,
                titre: true,
                image: true,
              },
            }
          : false,
        manga: idManga
          ? {
              select: {
                idManga: true,
                titre: true,
                image: true,
              },
            }
          : false,
      },
    });

    return this.formatReview(review);
  }

  async findAll(query: ReviewQueryDto) {
    const {
      page = 1,
      limit = 20,
      search,
      idAnime,
      idManga,
      idMembre,
      statut,
      minNotation,
      sortBy = 'dateCritique',
      sortOrder = 'desc',
      type,
    } = query;

    // Create cache key from query parameters
    const cacheKey = this.createCacheKey(query);
    
    // Try to get from cache first
    const cached = await this.cacheService.getReviews(idAnime || 0, idManga || 0);
    if (cached && !search && !idMembre) { // Only cache non-search, non-user-specific queries
      return cached;
    }

    const skip = ((page || 1) - 1) * (limit || 20);

    const where: any = {};

    if (search) {
      where.OR = [
        { titre: { contains: search, mode: 'insensitive' } },
        { critique: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (idAnime) {
      where.idAnime = idAnime;
    }

    if (idManga) {
      where.idManga = idManga;
    }

    if (idMembre) {
      where.idMembre = idMembre;
    }

    if (statut !== undefined) {
      where.statut = statut;
    }

    if (minNotation) {
      where.notation = { gte: minNotation };
    }

    // Type filter: our schema uses 0 when unset
    if (type === 'anime') {
      if (!idAnime) {
        where.idAnime = { gt: 0 };
      }
      if (!idManga) {
        where.idManga = 0;
      }
    } else if (type === 'manga') {
      if (!idManga) {
        where.idManga = { gt: 0 };
      }
      if (!idAnime) {
        where.idAnime = 0;
      }
    }

    const orderBy = { [sortBy || 'dateCritique']: sortOrder || 'desc' };
    
    console.log('Reviews query debug:', { sortBy, sortOrder, orderBy, page, limit });

    const [reviews, total] = await Promise.all([
      this.prisma.akCritique.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          membre: {
            select: {
              idMember: true,
              memberName: true,
              avatar: true,
            },
          },
          anime: {
            select: {
              idAnime: true,
              titre: true,
              image: true,
            },
          },
          manga: {
            select: {
              idManga: true,
              titre: true,
              image: true,
            },
          },
        },
      }),
      this.prisma.akCritique.count({ where }),
    ]);

    const result = {
      reviews: reviews.map(this.formatReview),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / (limit || 20)),
      },
    };

    // Cache the result if it's not user-specific or search-based
    if (!search && !idMembre) {
      const ttl = idAnime || idManga ? 300 : 180; // 5 mins for specific anime/manga, 3 mins for general
      await this.cacheService.setReviews(idAnime || 0, idManga || 0, result, ttl);
    }

    return result;
  }

  async findOne(id: number) {
    // Try to get from cache first
    const cached = await this.cacheService.get(`review:${id}`);
    if (cached) {
      return cached;
    }

    const review = await this.prisma.akCritique.findUnique({
      where: { idCritique: id },
      include: {
        membre: {
          select: {
            idMember: true,
            memberName: true,
            avatar: true,
            realName: true,
          },
        },
        anime: {
          select: {
            idAnime: true,
            titre: true,
            titreOrig: true,
            image: true,
            annee: true,
          },
        },
        manga: {
          select: {
            idManga: true,
            titre: true,
            image: true,
            annee: true,
          },
        },
      },
    });

    if (!review) {
      throw new NotFoundException('Critique introuvable');
    }

    const formattedReview = this.formatReview(review);
    
    // Cache the individual review for 10 minutes
    await this.cacheService.set(`review:${id}`, formattedReview, 600);

    return formattedReview;
  }

  async findBySlug(slug: string) {
    const review = await this.prisma.akCritique.findFirst({
      where: { niceUrl: slug },
      include: {
        membre: {
          select: {
            idMember: true,
            memberName: true,
            avatar: true,
            realName: true,
          },
        },
        anime: {
          select: {
            idAnime: true,
            titre: true,
            titreOrig: true,
            image: true,
            annee: true,
          },
        },
        manga: {
          select: {
            idManga: true,
            titre: true,
            image: true,
            annee: true,
          },
        },
      },
    });

    if (!review) {
      throw new NotFoundException('Critique introuvable');
    }

    return this.formatReview(review);
  }

  async update(
    id: number,
    updateReviewDto: UpdateReviewDto,
    userId: number,
    isAdmin = false,
  ) {
    const review = await this.prisma.akCritique.findUnique({
      where: { idCritique: id },
    });

    if (!review) {
      throw new NotFoundException('Critique introuvable');
    }

    // Only owner or admin can update
    if (review.idMembre !== userId && !isAdmin) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que vos propres critiques',
      );
    }

    // Don't allow changing anime/manga IDs
    const { idAnime, idManga, ...updateData } = updateReviewDto;

    const updatedReview = await this.prisma.akCritique.update({
      where: { idCritique: id },
      data: updateData,
      include: {
        membre: {
          select: {
            idMember: true,
            memberName: true,
            avatar: true,
          },
        },
        anime: review.idAnime
          ? {
              select: {
                idAnime: true,
                titre: true,
                image: true,
              },
            }
          : false,
        manga: review.idManga
          ? {
              select: {
                idManga: true,
                titre: true,
                image: true,
              },
            }
          : false,
      },
    });

    // Invalidate caches after update
    await this.invalidateReviewCache(id, review.idAnime, review.idManga);

    return this.formatReview(updatedReview);
  }

  async remove(id: number, userId: number, isAdmin = false) {
    const review = await this.prisma.akCritique.findUnique({
      where: { idCritique: id },
    });

    if (!review) {
      throw new NotFoundException('Critique introuvable');
    }

    // Only owner or admin can delete
    if (review.idMembre !== userId && !isAdmin) {
      throw new ForbiddenException(
        'Vous ne pouvez supprimer que vos propres critiques',
      );
    }

    await this.prisma.akCritique.delete({
      where: { idCritique: id },
    });

    // Invalidate caches after removal
    await this.invalidateReviewCache(id, review.idAnime, review.idManga);

    return { message: 'Critique supprimée avec succès' };
  }

  async getTopReviews(limit = 10, type?: 'anime' | 'manga' | 'both') {
    // Try to get from cache first
    const cacheKey = `top_reviews:${type || 'both'}:${limit}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const where: any = {
      statut: 0, // Only active/visible reviews
      notation: { gte: 8 }, // High ratings
      popularite: { gte: 3 }, // High popularity ratings
    };

    if (type === 'anime') {
      where.idAnime = { gt: 0 };
      where.idManga = 0;
    } else if (type === 'manga') {
      where.idManga = { gt: 0 };
      where.idAnime = 0;
    }

    const reviews = await this.prisma.akCritique.findMany({
      where,
      orderBy: [{ popularite: 'desc' }, { nbClics: 'desc' }],
      take: limit,
      include: {
        membre: {
          select: {
            idMember: true,
            memberName: true,
            avatar: true,
          },
        },
        anime: {
          select: {
            idAnime: true,
            titre: true,
            image: true,
          },
        },
        manga: {
          select: {
            idManga: true,
            titre: true,
            image: true,
          },
        },
      },
    });

    const result = {
      topReviews: reviews.map(this.formatReview),
      generatedAt: new Date().toISOString(),
    };

    // Cache for 15 minutes
    await this.cacheService.set(cacheKey, result, 900);

    return result;
  }

  async getUserReviews(userId: number, limit = 20) {
    const reviews = await this.prisma.akCritique.findMany({
      where: { idMembre: userId },
      orderBy: { dateCritique: 'desc' },
      take: limit,
      include: {
        anime: {
          select: {
            idAnime: true,
            titre: true,
            image: true,
          },
        },
        manga: {
          select: {
            idManga: true,
            titre: true,
            image: true,
          },
        },
      },
    });

    return {
      reviews: reviews.map(this.formatReview),
      total: reviews.length,
    };
  }

  async getReviewsCount() {
    const total = await this.prisma.akCritique.count({
      where: {
        statut: 0, // Only count visible/active reviews
      },
    });

    return { count: total };
  }

  private formatReview(review: any) {
    const {
      idCritique,
      dateCritique,
      idMembre,
      idAnime,
      idManga,
      critique,
      ...otherFields
    } = review;

    // Normalize dateCritique which may be stored as Date or as epoch seconds
    let reviewDate: string | null = null;
    if (dateCritique) {
      if (dateCritique instanceof Date) {
        reviewDate = dateCritique.toISOString();
      } else if (typeof dateCritique === 'number') {
        reviewDate = new Date(dateCritique * 1000).toISOString();
      } else {
        // Attempt to parse if it's a string
        const d = new Date(dateCritique);
        reviewDate = isNaN(d.getTime()) ? null : d.toISOString();
      }
    }

    return {
      id: idCritique,
      userId: idMembre,
      animeId: idAnime,
      mangaId: idManga,
      reviewDate,
      critique,
      ...otherFields,
    };
  }

  // Cache helper methods
  private createCacheKey(query: ReviewQueryDto): string {
    const {
      page = 1,
      limit = 20,
      search = '',
      idAnime = 0,
      idManga = 0,
      idMembre = 0,
      statut = '',
      minNotation = '',
      sortBy = 'dateCritique',
      sortOrder = 'desc',
      type = '',
    } = query;

    return `${page}_${limit}_${search}_${idAnime}_${idManga}_${idMembre}_${statut}_${minNotation}_${sortBy}_${sortOrder}_${type}`;
  }

  // Cache invalidation methods
  async invalidateReviewCache(reviewId: number, animeId?: number, mangaId?: number): Promise<void> {
    await this.cacheService.del(`review:${reviewId}`);
    
    // Invalidate related content caches
    if (animeId) {
      await this.cacheService.invalidateAnime(animeId);
    }
    if (mangaId) {
      await this.cacheService.invalidateManga(mangaId);
    }
    
    // Invalidate top reviews cache
    await this.cacheService.delByPattern('top_reviews:*');
  }
}
