import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { PopularityService } from '../../shared/services/popularity.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewQueryDto } from './dto/review-query.dto';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly popularityService: PopularityService,
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
    const cacheKey = `reviews:${this.createCacheKey(query)}`;
    
    // Try to get from cache first
    const cached = await this.cacheService.get(cacheKey);
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

    // Create proper orderBy object with better null handling
    let orderBy: any;
    const sortField = sortBy || 'dateCritique';
    const sortDirection = sortOrder || 'desc';
    
    // For fields that might have null values, add secondary sort by date
    if (sortField === 'popularite' || sortField === 'nbClics') {
      orderBy = [
        { [sortField]: sortDirection },
        { dateCritique: 'desc' } // Secondary sort by date for consistency
      ];
    } else {
      orderBy = { [sortField]: sortDirection };
    }
    

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
      await this.cacheService.set(cacheKey, result, ttl);
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

  /**
   * Increment view count and popularity for a review
   * Following the same logic as the original WordPress implementation
   */
  async incrementViews(reviewId: number, userId?: number) {
    // First, check if the review exists
    const review = await this.prisma.akCritique.findUnique({
      where: { idCritique: reviewId },
      select: {
        idCritique: true,
        idMembre: true,
        nbClics: true,
        nbClicsDay: true,
        nbClicsWeek: true,
        nbClicsMonth: true,
        popularite: true,
        idAnime: true,
        idManga: true,
      },
    });

    if (!review) {
      throw new NotFoundException('Critique introuvable');
    }

    // Only increment if the user is not the author (following WordPress logic)
    if (userId && userId === review.idMembre) {
      return {
        message: 'Vue non comptée - auteur de la critique',
        reviewId,
        nbClics: review.nbClics,
      };
    }

    // Increment all view counters
    const updatedReview = await this.prisma.akCritique.update({
      where: { idCritique: reviewId },
      data: {
        nbClics: { increment: 1 },
        nbClicsDay: { increment: 1 },
        nbClicsWeek: { increment: 1 },
        nbClicsMonth: { increment: 1 },
      },
      select: {
        idCritique: true,
        nbClics: true,
        nbClicsDay: true,
        nbClicsWeek: true,
        nbClicsMonth: true,
        popularite: true,
      },
    });

    // Recalculate and update popularity
    const newPopularity = await this.calculateReviewPopularity(reviewId);
    await this.prisma.akCritique.update({
      where: { idCritique: reviewId },
      data: { popularite: newPopularity },
    });

    // Invalidate related caches
    await this.invalidateReviewCache(reviewId, review.idAnime, review.idManga);

    // Return updated stats
    return {
      message: 'Popularité mise à jour avec succès',
      reviewId,
      nbClics: updatedReview.nbClics,
      nbClicsDay: updatedReview.nbClicsDay,
      nbClicsWeek: updatedReview.nbClicsWeek,
      nbClicsMonth: updatedReview.nbClicsMonth,
      popularite: newPopularity,
    };
  }

  private formatReview(review: any) {
    const {
      idCritique,
      dateCritique,
      idMembre,
      idAnime,
      idManga,
      critique,
      membre,
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
      membre: membre || null, // Handle null membre
      ...otherFields,
    };
  }

  /**
   * Like/dislike system methods
   */
  private parseVotes(csv?: string | null): number[] {
    return (csv || '')
      .split(',')
      .map((s) => parseInt(s))
      .filter((n) => !isNaN(n) && n > 0);
  }

  private toCsv(ids: number[]): string {
    return ids.join(',');
  }

  async likeReview(reviewId: number, userId: number) {
    const review = await this.prisma.akCritique.findUnique({
      where: { idCritique: reviewId },
      select: {
        idCritique: true,
        idMembre: true,
        jaime: true,
        jaimepas: true,
        nbClics: true,
        notation: true,
        nbCarac: true,
        dateCritique: true,
      },
    });

    if (!review) {
      throw new NotFoundException('Critique introuvable');
    }

    // Prevent self-liking
    if (review.idMembre === userId) {
      throw new ForbiddenException('Vous ne pouvez pas aimer votre propre critique');
    }

    const likes = new Set(this.parseVotes(review.jaime));
    const dislikes = new Set(this.parseVotes(review.jaimepas));
    
    // Remove from dislikes if present
    dislikes.delete(userId);
    
    // Toggle like
    const wasLiked = likes.has(userId);
    if (wasLiked) {
      likes.delete(userId);
    } else {
      likes.add(userId);
    }

    // Update the review
    const updated = await this.prisma.akCritique.update({
      where: { idCritique: reviewId },
      data: { 
        jaime: this.toCsv([...likes]), 
        jaimepas: this.toCsv([...dislikes]) 
      },
    });

    // Calculate and update popularity
    const popularity = await this.calculateReviewPopularity(reviewId);
    await this.prisma.akCritique.update({ 
      where: { idCritique: reviewId }, 
      data: { popularite: popularity } 
    });

    // Invalidate caches
    await this.invalidateReviewCache(reviewId, review.idAnime, review.idManga);

    return {
      liked: !wasLiked,
      likes: likes.size,
      dislikes: dislikes.size,
      popularite: popularity,
    };
  }

  async dislikeReview(reviewId: number, userId: number) {
    const review = await this.prisma.akCritique.findUnique({
      where: { idCritique: reviewId },
      select: {
        idCritique: true,
        idMembre: true,
        jaime: true,
        jaimepas: true,
        nbClics: true,
        notation: true,
        nbCarac: true,
        dateCritique: true,
      },
    });

    if (!review) {
      throw new NotFoundException('Critique introuvable');
    }

    // Prevent self-disliking
    if (review.idMembre === userId) {
      throw new ForbiddenException('Vous ne pouvez pas disliker votre propre critique');
    }

    const likes = new Set(this.parseVotes(review.jaime));
    const dislikes = new Set(this.parseVotes(review.jaimepas));
    
    // Remove from likes if present
    likes.delete(userId);
    
    // Toggle dislike
    const wasDisliked = dislikes.has(userId);
    if (wasDisliked) {
      dislikes.delete(userId);
    } else {
      dislikes.add(userId);
    }

    // Update the review
    const updated = await this.prisma.akCritique.update({
      where: { idCritique: reviewId },
      data: { 
        jaime: this.toCsv([...likes]), 
        jaimepas: this.toCsv([...dislikes]) 
      },
    });

    // Calculate and update popularity
    const popularity = await this.calculateReviewPopularity(reviewId);
    await this.prisma.akCritique.update({ 
      where: { idCritique: reviewId }, 
      data: { popularite: popularity } 
    });

    // Invalidate caches
    await this.invalidateReviewCache(reviewId, review.idAnime, review.idManga);

    return {
      disliked: !wasDisliked,
      likes: likes.size,
      dislikes: dislikes.size,
      popularite: popularity,
    };
  }

  async getReviewStats(reviewId: number) {
    const review = await this.prisma.akCritique.findUnique({
      where: { idCritique: reviewId },
      select: {
        idCritique: true,
        jaime: true,
        jaimepas: true,
        nbClics: true,
        nbClicsDay: true,
        nbClicsWeek: true,
        nbClicsMonth: true,
        notation: true,
        nbCarac: true,
        dateCritique: true,
        popularite: true,
        membre: {
          select: {
            idMember: true,
            memberName: true,
          },
        },
      },
    });

    if (!review) {
      throw new NotFoundException('Critique introuvable');
    }

    const likes = this.parseVotes(review.jaime);
    const dislikes = this.parseVotes(review.jaimepas);

    // Calculate various scores
    const popularity = await this.calculateReviewPopularity(reviewId);
    const trendingScore = this.calculateTrendingScore(review);
    const qualityScore = this.calculateQualityScore(review);

    return {
      reviewId: review.idCritique,
      likes: likes.length,
      dislikes: dislikes.length,
      totalVotes: likes.length + dislikes.length,
      likeRatio: likes.length + dislikes.length > 0 ? likes.length / (likes.length + dislikes.length) : 0,
      views: {
        total: review.nbClics || 0,
        day: review.nbClicsDay || 0,
        week: review.nbClicsWeek || 0,
        month: review.nbClicsMonth || 0,
      },
      scores: {
        popularity,
        trending: trendingScore,
        quality: qualityScore,
      },
      tier: this.popularityService.getPopularityTier(popularity),
      category: this.popularityService.getPopularityCategory(popularity),
    };
  }

  /**
   * Calculate comprehensive popularity for a review
   */
  private async calculateReviewPopularity(reviewId: number): Promise<number> {
    const review = await this.prisma.akCritique.findUnique({
      where: { idCritique: reviewId },
      select: {
        jaime: true,
        jaimepas: true,
        nbClics: true,
        nbClicsWeek: true,
        notation: true,
        nbCarac: true,
        dateCritique: true,
        membre: {
          select: {
            // We'll calculate author reputation later
          },
        },
      },
    });

    if (!review) return 0;

    const likes = this.parseVotes(review.jaime).length;
    const dislikes = this.parseVotes(review.jaimepas).length;
    const ageInDays = review.dateCritique 
      ? Math.floor((Date.now() - new Date(review.dateCritique).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Use the popularity service
    return this.popularityService.calculatePopularity({
      totalViews: review.nbClics || 0,
      recentViews: review.nbClicsWeek || 0,
      averageRating: review.notation || 0,
      ratingCount: 1, // Individual review rating
      likes,
      dislikes,
      reviewLength: review.nbCarac || 0,
      ageInDays,
    });
  }

  /**
   * Calculate trending score for recent activity
   */
  private calculateTrendingScore(review: any): number {
    const likes = this.parseVotes(review.jaime).length;
    const dislikes = this.parseVotes(review.jaimepas).length;
    const ageInDays = review.dateCritique 
      ? Math.floor((Date.now() - new Date(review.dateCritique).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return this.popularityService.calculateTrendingScore({
      totalViews: review.nbClics || 0,
      recentViews: review.nbClicsWeek || 0,
      likes,
      ageInDays,
    });
  }

  /**
   * Calculate quality score based on content
   */
  private calculateQualityScore(review: any): number {
    return this.popularityService.calculateQualityScore({
      averageRating: review.notation || 0,
      ratingCount: 1,
      reviewLength: review.nbCarac || 0,
    });
  }

  /**
   * Batch update popularities (for scheduled jobs)
   */
  async updateAllPopularities(limit = 100) {
    const reviews = await this.prisma.akCritique.findMany({
      take: limit,
      orderBy: { dateCritique: 'desc' },
      select: {
        idCritique: true,
        jaime: true,
        jaimepas: true,
        nbClics: true,
        nbClicsWeek: true,
        notation: true,
        nbCarac: true,
        dateCritique: true,
      },
    });

    const updates = await Promise.allSettled(
      reviews.map(async (review) => {
        const popularity = await this.calculateReviewPopularity(review.idCritique);
        
        return this.prisma.akCritique.update({
          where: { idCritique: review.idCritique },
          data: { popularite: popularity },
        });
      })
    );

    const successful = updates.filter(result => result.status === 'fulfilled').length;
    const failed = updates.filter(result => result.status === 'rejected').length;

    return {
      processed: reviews.length,
      successful,
      failed,
      timestamp: new Date().toISOString(),
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
