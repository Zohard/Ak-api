import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { PopularityService } from '../../shared/services/popularity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../../shared/services/email.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewQueryDto } from './dto/review-query.dto';
import { ModerateReviewDto } from './dto/moderate-review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly popularityService: PopularityService,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
  ) {}

  async create(createReviewDto: CreateReviewDto, userId: number) {
    const { idAnime, idManga, idJeu, ...reviewData } = createReviewDto;

    // Validate that exactly one content type is specified
    const contentCount = [idAnime, idManga, idJeu].filter(Boolean).length;
    if (contentCount === 0) {
      throw new BadRequestException(
        'Vous devez spécifier un anime, un manga ou un jeu vidéo',
      );
    }
    if (contentCount > 1) {
      throw new BadRequestException(
        'Vous ne pouvez spécifier qu\'un seul type de contenu (anime, manga ou jeu vidéo)',
      );
    }

    // Check if anime/manga/game exists
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

    if (idJeu) {
      const game = await this.prisma.akJeuxVideo.findUnique({
        where: { idJeu },
      });
      if (!game) {
        throw new NotFoundException('Jeu vidéo introuvable');
      }
    }

    // Check if user already has a review for this content
    const existingReview = await this.prisma.akCritique.findFirst({
      where: {
        idMembre: userId,
        ...(idAnime && { idAnime }),
        ...(idManga && { idManga }),
        ...(idJeu && { idJeu }),
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
        idJeu,
        dateCritique: new Date(),
      } as any,
      include: {
        membre: {
          select: {
            idMember: true,
            memberName: true,
            avatar: true,
            _count: { select: { reviews: { where: { statut: 0 } } } },
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
        jeuxVideo: idJeu
          ? {
              select: {
                idJeu: true,
                titre: true,
                image: true,
              },
            }
          : false,
      },
    });

    // Update user's review count
    await this.prisma.smfMember.update({
      where: { idMember: userId },
      data: {
        nbCritiques: {
          increment: 1,
        },
      },
    });

    // Invalidate user review cache after creation
    await this.invalidateReviewCache(review.idCritique, idAnime, idManga, userId);

    return this.formatReview(review);
  }

  async findAll(query: ReviewQueryDto, skipDefaultStatusFilter = false) {
    const {
      page = 1,
      limit = 20,
      search,
      idAnime,
      idManga,
      idMembre,
      pseudo,
      statut,
      minNotation,
      sortBy = 'dateCritique',
      sortOrder = 'desc',
      type,
      dateRange,
    } = query;

    // Create cache key from query parameters
    const cacheKey = `reviews:${this.createCacheKey(query)}`;
    
    // Try to get from cache first
    const cached = await this.cacheService.get(cacheKey);
    if (cached && !search && !idMembre && !pseudo) { // Only cache non-search, non-user-specific queries
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

    if (pseudo) {
      where.membre = {
        memberName: { contains: pseudo, mode: 'insensitive' },
      };
    }

    // Default to showing only published reviews (statut: 0) unless explicitly specified
    // Skip default filter for admin requests when skipDefaultStatusFilter is true
    if (statut !== undefined) {
      where.statut = statut;
    } else if (!skipDefaultStatusFilter) {
      where.statut = 0; // Only show published reviews by default (for public API)
    }
    // If skipDefaultStatusFilter is true and statut is undefined, don't filter by status (show all)

    if (minNotation) {
      where.notation = { gte: minNotation };
    }

    // Date range filter
    if (dateRange) {
      const now = new Date();
      let startDate: Date | null;

      switch (dateRange) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
          break;
        case 'year':
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
        default:
          startDate = null;
      }

      if (startDate) {
        where.dateCritique = { gte: startDate };
      }
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
    if (!search && !idMembre && !pseudo) {
      const ttl = idAnime || idManga ? 300 : 180; // 5 mins for specific anime/manga, 3 mins for general
      await this.cacheService.set(cacheKey, result, ttl);
    }

    return result;
  }

  async findOne(id: number, requestingUserId?: number) {
    // Try to get from cache first (only for public/published reviews)
    const cached = await this.cacheService.get(`review:${id}`);
    if (cached && !requestingUserId) {
      return cached;
    }

    // First, fetch the review to check ownership
    const review = await this.prisma.akCritique.findUnique({
      where: { idCritique: id },
      include: {
        membre: {
          select: {
            idMember: true,
            memberName: true,
            avatar: true,
            realName: true,
            _count: {
              select: {
                reviews: true
              }
            },
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

    // Allow access if:
    // 1. Review is published (statut: 0), OR
    // 2. Requesting user is the author (can see their own moderated reviews)
    const isAuthor = requestingUserId && review.idMembre === requestingUserId;
    if (review.statut !== 0 && !isAuthor) {
      throw new NotFoundException('Critique introuvable');
    }

    let formattedReview = this.formatReview(review);

    // Compute author's visible reviews count and average rating
    try {
      const [avg, count] = await Promise.all([
        this.prisma.akCritique.aggregate({
          where: { idMembre: review.idMembre, statut: 0, NOT: { notation: null } },
          _avg: { notation: true },
        }),
        this.prisma.akCritique.count({
          where: { idMembre: review.idMembre, statut: 0 }
        })
      ])
      const average = avg._avg?.notation ?? 0
      if (formattedReview.membre) {
        formattedReview = {
          ...formattedReview,
          membre: {
            ...formattedReview.membre,
            reviewsCount: count,
            averageRating: Number(average)
          }
        }
      }
    } catch {}

    // Cache the individual review for 10 minutes
    await this.cacheService.set(`review:${id}`, formattedReview, 600);

    return formattedReview;
  }

  async findBySlug(slug: string, requestingUserId?: number) {
    const review = await this.prisma.akCritique.findFirst({
      where: {
        niceUrl: slug,
      },
      include: {
        membre: {
          select: {
            idMember: true,
            memberName: true,
            avatar: true,
            realName: true,
            _count: { select: { reviews: { where: { statut: 0 } } } },
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

    // Allow access if:
    // 1. Review is published (statut: 0), OR
    // 2. Requesting user is the author (can see their own moderated reviews)
    const isAuthor = requestingUserId && review.idMembre === requestingUserId;
    if (review.statut !== 0 && !isAuthor) {
      throw new NotFoundException('Critique introuvable');
    }

    let formatted = this.formatReview(review);
    try {
      const avg = await this.prisma.akCritique.aggregate({
        where: { idMembre: review.idMembre, statut: 0, NOT: { notation: null } },
        _avg: { notation: true },
      })
      const average = avg._avg?.notation ?? 0
      if (formatted.membre) {
        formatted = { ...formatted, membre: { ...formatted.membre, averageRating: Number(average) } }
      }
    } catch {}
    return formatted;
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
            _count: { select: { reviews: { where: { statut: 0 } } } },
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
    await this.invalidateReviewCache(id, review.idAnime, review.idManga, userId);

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

    // Update user's review count (decrement)
    await this.prisma.smfMember.update({
      where: { idMember: review.idMembre },
      data: {
        nbCritiques: {
          decrement: 1,
        },
      },
    });

    // Invalidate caches after removal
    await this.invalidateReviewCache(id, review.idAnime, review.idManga, userId);

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
            _count: { select: { reviews: { where: { statut: 0 } } } },
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

  async getUserReviews(userId: number, limit = 20, requestingUserId?: number) {
    // Only show published reviews (statut: 0) unless the user is viewing their own reviews
    const isOwnReviews = requestingUserId && requestingUserId === userId;

    const reviews = await this.prisma.akCritique.findMany({
      where: {
        idMembre: userId,
        // Only filter by published status if viewing someone else's reviews
        ...(isOwnReviews ? {} : { statut: 0 }),
      },
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

  async checkUserReview(userId: number, type: 'anime' | 'manga' | 'game', contentId: number) {
    // Create cache key for user's review check
    const cacheKey = `user_review:${userId}:${type}:${contentId}`;

    // Try to get from cache first
    //const cached = await this.cacheService.get(cacheKey);
    //if (cached !== null) {
      //return cached;
    //}

    let whereCondition: any = {
      idMembre: userId,
    };

    if (type === 'anime') {
      whereCondition.idAnime = contentId;
      whereCondition.idManga = 0;
      whereCondition.idJeu = 0;
    } else if (type === 'manga') {
      whereCondition.idManga = contentId;
      whereCondition.idAnime = 0;
      whereCondition.idJeu = 0;
    } else if (type === 'game') {
      whereCondition.idJeu = contentId;
      whereCondition.idAnime = 0;
      whereCondition.idManga = 0;
    }

    const existingReview = await this.prisma.akCritique.findFirst({
      where: whereCondition,
      select: {
        idCritique: true,
        titre: true,
        critique: true,
        notation: true,
        dateCritique: true,
        statut: true,
        niceUrl: true,
      },
    });

    const result = {
      hasReview: !!existingReview,
      review: existingReview ? this.formatReview(existingReview) : null,
    };

    // Cache for 60 minutes (user reviews don't change frequently)
    await this.cacheService.set(cacheKey, result, 3600);

    return result;
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
    // Handle NULL values by setting to 1 if null, otherwise increment
    const updatedReview = await this.prisma.akCritique.update({
      where: { idCritique: reviewId },
      data: {
        nbClics: review.nbClics === null ? 1 : { increment: 1 },
        nbClicsDay: review.nbClicsDay === null ? 1 : { increment: 1 },
        nbClicsWeek: review.nbClicsWeek === null ? 1 : { increment: 1 },
        nbClicsMonth: review.nbClicsMonth === null ? 1 : { increment: 1 },
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
      acceptImages,
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

    // Map membre to frontend shape with counts
    const mappedMembre = membre
      ? {
          id: membre.idMember,
          pseudo: membre.memberName,
          avatar: membre.avatar,
          reviewsCount: (membre as any)._count?.reviews || 0,
        }
      : null

    return {
      id: idCritique,
      userId: idMembre,
      animeId: idAnime,
      mangaId: idManga,
      reviewDate,
      critique,
      acceptImages,
      membre: mappedMembre,
      ...otherFields,
    };
  }

  /**
   * Rating system methods - using questions JSON field
   */
  private parseQuestions(questionsJson?: string | null): any {
    if (!questionsJson) return {};
    try {
      const parsed = JSON.parse(questionsJson);
      const normalized = {};

      // Normalize each user's ratings
      Object.keys(parsed).forEach(userId => {
        const userRatings = parsed[userId];
        normalized[userId] = {
          c: this.normalizeRatingValue(userRatings.c),
          a: this.normalizeRatingValue(userRatings.a),
          o: this.normalizeRatingValue(userRatings.o),
          // Handle both "yes"/"y" and "no"/"n" formats for backward compatibility
          y: this.normalizeRatingValue(userRatings.y || userRatings.yes),
          n: this.normalizeRatingValue(userRatings.n || userRatings.no),
        };
      });

      return normalized;
    } catch {
      return {};
    }
  }

  private normalizeRatingValue(value: any): number {
    if (value === 1 || value === "1") return 1;
    return 0;
  }

  private updateQuestionsJson(questionsJson: string | null, userId: number, ratings: {c?: number, a?: number, o?: number, y?: number, n?: number}): string {
    const questions = this.parseQuestions(questionsJson);
    // Store in the new format (y/n) but maintain backward compatibility when reading
    questions[userId.toString()] = {
      c: ratings.c || 0,
      a: ratings.a || 0,
      o: ratings.o || 0,
      y: ratings.y || 0,
      n: ratings.n || 0,
    };
    return JSON.stringify(questions);
  }

  private calculateRatingTotals(questions: any): {c: number, a: number, o: number, y: number, n: number} {
    const totals = {c: 0, a: 0, o: 0, y: 0, n: 0};
    
    Object.values(questions).forEach((userRatings: any) => {
      if (userRatings.c === 1) totals.c++;
      if (userRatings.a === 1) totals.a++;
      if (userRatings.o === 1) totals.o++;
      if (userRatings.y === 1) totals.y++;
      if (userRatings.n === 1) totals.n++;
    });
    
    return totals;
  }

  async rateReview(reviewId: number, userId: number, ratingType: 'c' | 'a' | 'o' | 'y' | 'n' | 'yes' | 'no') {
    const review = await this.prisma.akCritique.findUnique({
      where: { idCritique: reviewId },
      select: {
        idCritique: true,
        idMembre: true,
        idAnime: true,
        idManga: true,
        questions: true,
        nbClics: true,
        notation: true,
        nbCarac: true,
        dateCritique: true,
      },
    });

    if (!review) {
      throw new NotFoundException('Critique introuvable');
    }

    // Prevent self-rating
    if (review.idMembre === userId) {
      throw new ForbiddenException('Vous ne pouvez pas évaluer votre propre critique');
    }

    const questions = this.parseQuestions(review.questions);
    const userRatings = questions[userId.toString()] || {c: 0, a: 0, o: 0, y: 0, n: 0};

    // Convert legacy yes/no to y/n for internal processing
    let normalizedRatingType = ratingType;
    if (ratingType === 'yes') normalizedRatingType = 'y';
    if (ratingType === 'no') normalizedRatingType = 'n';

    // Toggle the specific rating
    userRatings[normalizedRatingType] = userRatings[normalizedRatingType] === 1 ? 0 : 1;

    // For y/n ratings, ensure only one is active
    if (normalizedRatingType === 'y' && userRatings.y === 1) {
      userRatings.n = 0;
    } else if (normalizedRatingType === 'n' && userRatings.n === 1) {
      userRatings.y = 0;
    }

    // Update the review
    const updatedQuestionsJson = this.updateQuestionsJson(review.questions, userId, userRatings);
    await this.prisma.akCritique.update({
      where: { idCritique: reviewId },
      data: { 
        questions: updatedQuestionsJson
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

    // Calculate current totals and expose the caller's ratings
    const allQuestions = this.parseQuestions(updatedQuestionsJson);
    const totals = this.calculateRatingTotals(allQuestions);
    const currentUserRatings = allQuestions[userId.toString()] || { c: 0, a: 0, o: 0, y: 0, n: 0 };

    // Send notification for positive reactions (c, a, o, y) but not for negative (n)
    const isPositiveReaction = ['c', 'a', 'o', 'y'].includes(normalizedRatingType);
    const isNewReaction = currentUserRatings[normalizedRatingType] === 1;

    if (isPositiveReaction && isNewReaction) {
      try {
        // Get review details with author and anime/manga info
        const reviewDetails = await this.prisma.akCritique.findUnique({
          where: { idCritique: reviewId },
          select: {
            idCritique: true,
            titre: true,
            niceUrl: true,
            idMembre: true,
            membre: {
              select: {
                idMember: true,
                memberName: true,
              },
            },
            anime: {
              select: {
                idAnime: true,
                titre: true,
              },
            },
            manga: {
              select: {
                idManga: true,
                titre: true,
              },
            },
          },
        });

        // Get the reactor's information
        const reactor = await this.prisma.smfMember.findUnique({
          where: { idMember: userId },
          select: {
            idMember: true,
            memberName: true,
          },
        });

        if (reviewDetails && reactor) {
          const contentTitle = reviewDetails.anime?.titre || reviewDetails.manga?.titre || 'votre contenu';

          // Map reaction types to French labels
          const reactionLabels = {
            c: 'trouve votre critique convaincante',
            a: 'trouve votre critique amusante',
            o: 'trouve votre critique originale',
            y: 'partage votre avis',
          };

          const reactionMessage = reactionLabels[normalizedRatingType] || 'a réagi à votre critique';

          // Send notification to review author
          await this.notificationsService.sendNotification({
            userId: reviewDetails.idMembre,
            type: 'review_liked',
            title: contentTitle,
            message: `${reactor.memberName} ${reactionMessage} sur "${contentTitle}"`,
            data: {
              reviewId: reviewDetails.idCritique,
              reviewSlug: reviewDetails.niceUrl,
              reviewTitle: reviewDetails.titre,
              likerName: reactor.memberName,
              likerId: reactor.idMember,
              reactionType: normalizedRatingType,
              reactionLabel: reactionLabels[normalizedRatingType],
              animeId: reviewDetails.anime?.idAnime,
              mangaId: reviewDetails.manga?.idManga,
            },
            priority: 'low',
          });
        }
      } catch (error) {
        // Log error but don't fail the rating operation
        console.error('Failed to send review reaction notification:', error);
      }
    }

    return {
      ratingType,
      active: currentUserRatings[normalizedRatingType] === 1,
      totals,
      userRatings: currentUserRatings,
      popularite: popularity,
    };
  }

  async getReviewRatings(reviewId: number, userId?: number) {
    const review = await this.prisma.akCritique.findUnique({
      where: { idCritique: reviewId },
      select: {
        idCritique: true,
        questions: true,
        idMembre: true,
      },
    });

    if (!review) {
      throw new NotFoundException('Critique introuvable');
    }

    const questions = this.parseQuestions(review.questions);
    const totals = this.calculateRatingTotals(questions);
    
    let userRatings = null;
    if (userId) {
      userRatings = questions[userId.toString()] || {c: 0, a: 0, o: 0, y: 0, n: 0};
    }

    return {
      reviewId: review.idCritique,
      totals: { c: totals.c, a: totals.a, o: totals.o, y: totals.y, n: totals.n },
      userRatings,
      canRate: !!userId && userId !== review.idMembre,
    };
  }

  async getReviewStats(reviewId: number) {
    const review = await this.prisma.akCritique.findUnique({
      where: { idCritique: reviewId },
      select: {
        idCritique: true,
        questions: true,
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

    const questions = this.parseQuestions(review.questions);
    const totals = this.calculateRatingTotals(questions);

    // Calculate various scores
    const popularity = await this.calculateReviewPopularity(reviewId);
    const trendingScore = this.calculateTrendingScore(review);
    const qualityScore = this.calculateQualityScore(review);

    const likes = totals.y;
    const dislikes = totals.n;
    const totalVotes = likes + dislikes;
    const likeRatio = totalVotes > 0 ? likes / totalVotes : 0;

    return {
      reviewId: review.idCritique,
      likes,
      dislikes,
      totalVotes,
      likeRatio,
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
        questions: true,
        nbClics: true,
        nbClicsWeek: true,
        notation: true,
        nbCarac: true,
        dateCritique: true,
        membre: {
          select: {
            idMember: true,
            posts: true,
            nbCritiques: true,
            experience: true,
          },
        },
      },
    });

    if (!review) return 0;

    const questions = this.parseQuestions(review.questions);
    const totals = this.calculateRatingTotals(questions);
    const ageInDays = review.dateCritique 
      ? Math.floor((Date.now() - new Date(review.dateCritique).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Use the popularity service with adapted ratings
    return this.popularityService.calculatePopularity({
      totalViews: review.nbClics || 0,
      recentViews: review.nbClicsWeek || 0,
      averageRating: review.notation || 0,
      ratingCount: 1, // Individual review rating
      likes: totals.y, // "Vous partagez cet avis"
      dislikes: totals.n, // "Vous ne partagez pas cet avis"
      reviewLength: review.nbCarac || 0,
      ageInDays,
    });
  }

  /**
   * Calculate trending score for recent activity
   */
  private calculateTrendingScore(review: any): number {
    const questions = this.parseQuestions(review.questions);
    const totals = this.calculateRatingTotals(questions);
    const ageInDays = review.dateCritique 
      ? Math.floor((Date.now() - new Date(review.dateCritique).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return this.popularityService.calculateTrendingScore({
      totalViews: review.nbClics || 0,
      recentViews: review.nbClicsWeek || 0,
      likes: totals.y, // "Vous partagez cet avis"
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
      pseudo = '',
      statut = '',
      minNotation = '',
      sortBy = 'dateCritique',
      sortOrder = 'desc',
      type = '',
    } = query;

    return `${page}_${limit}_${search}_${idAnime}_${idManga}_${idMembre}_${pseudo}_${statut}_${minNotation}_${sortBy}_${sortOrder}_${type}`;
  }

  // Cache invalidation methods
  async invalidateReviewCache(reviewId: number, animeId?: number, mangaId?: number, userId?: number): Promise<void> {
    await this.cacheService.del(`review:${reviewId}`);

    // Invalidate user review check cache
    if (userId) {
      if (animeId) {
        await this.cacheService.del(`user_review:${userId}:anime:${animeId}`);
      }
      if (mangaId) {
        await this.cacheService.del(`user_review:${userId}:manga:${mangaId}`);
      }
    }

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

  /**
   * Admin moderation methods
   */
  async moderate(
    id: number,
    moderateDto: ModerateReviewDto,
    userId: number,
    isAdmin: boolean,
  ): Promise<any> {
    if (!isAdmin) {
      throw new ForbiddenException('Only administrators can moderate reviews');
    }

    const review = await this.prisma.akCritique.findUnique({
      where: { idCritique: id },
      include: {
        membre: {
          select: {
            idMember: true,
            memberName: true,
            emailAddress: true,
          },
        },
        anime: {
          select: {
            idAnime: true,
            titre: true,
          },
        },
        manga: {
          select: {
            idManga: true,
            titre: true,
          },
        },
      },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    let newStatus = 0;
    let causeSuppr: string | null = null;

    if (moderateDto.action === 'approve') {
      newStatus = 0; // Published
      causeSuppr = null;
    } else if (moderateDto.action === 'reject') {
      newStatus = 2; // Rejected by moderation
      causeSuppr = moderateDto.reason || 'Contenu non conforme aux règles de la communauté';
    }

    await this.prisma.akCritique.update({
      where: { idCritique: id },
      data: {
        statut: newStatus,
        causeSuppr,
      },
    });

    // Invalidate review cache
    await this.invalidateReviewCache(id, review.idAnime, review.idManga, review.idMembre);

    // Send email notification for rejection
    if (moderateDto.action === 'reject' && review.membre?.emailAddress && causeSuppr) {
      try {
        const contentTitle = review.anime?.titre || review.manga?.titre || 'votre contenu';
        await this.emailService.sendReviewRejectionEmail(
          review.membre.emailAddress,
          review.membre.memberName,
          review.titre || contentTitle,
          causeSuppr,
          contentTitle,
        );
      } catch (error) {
        console.error('Failed to send rejection email:', error);
        // Don't throw - we don't want to fail the moderation if email fails
      }
    }

    return {
      message: `Review ${moderateDto.action}ed successfully`,
      review: {
        id: review.idCritique,
        statut: newStatus,
        causeSuppr,
      },
    };
  }

  async bulkModerate(
    reviewIds: number[],
    action: string,
    reason?: string,
  ): Promise<any> {
    const results = await Promise.allSettled(
      reviewIds.map(async (id) => {
        const review = await this.prisma.akCritique.findUnique({
          where: { idCritique: id },
          include: {
            membre: {
              select: {
                idMember: true,
                memberName: true,
                emailAddress: true,
              },
            },
            anime: {
              select: {
                titre: true,
              },
            },
            manga: {
              select: {
                titre: true,
              },
            },
          },
        });

        if (!review) {
          throw new Error('Review not found');
        }

        const newStatus = action === 'approve' ? 0 : 2; // 0=published, 1=draft, 2=rejected
        const causeSuppr: string | null = action === 'reject'
          ? (reason || 'Contenu non conforme aux règles de la communauté')
          : null;

        await this.prisma.akCritique.update({
          where: { idCritique: id },
          data: {
            statut: newStatus,
            causeSuppr,
          },
        });

        // Send email for rejection
        if (action === 'reject' && review.membre?.emailAddress && causeSuppr) {
          try {
            const contentTitle = review.anime?.titre || review.manga?.titre || 'votre contenu';
            await this.emailService.sendReviewRejectionEmail(
              review.membre.emailAddress,
              review.membre.memberName,
              review.titre || contentTitle,
              causeSuppr,
              contentTitle,
            );
          } catch (error) {
            console.error('Failed to send rejection email:', error);
          }
        }

        return { id, success: true };
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    // Invalidate all top reviews cache
    await this.cacheService.delByPattern('top_reviews:*');
    await this.cacheService.delByPattern('reviews:*');

    return {
      message: `Bulk moderation completed. ${successful} successful, ${failed} failed.`,
      successful,
      failed,
      results: results.map((r, i) => ({
        id: reviewIds[i],
        success: r.status === 'fulfilled',
        error: r.status === 'rejected' ? r.reason : null,
      })),
    };
  }

  async getStats(): Promise<any> {
    const [total, published, draft, rejected] = await Promise.all([
      this.prisma.akCritique.count(),
      this.prisma.akCritique.count({ where: { statut: 0 } }), // Published
      this.prisma.akCritique.count({ where: { statut: 1 } }), // Draft
      this.prisma.akCritique.count({ where: { statut: 2 } }), // Rejected by moderation
    ]);

    return {
      total,
      published,
      pending: draft, // For compatibility with frontend expecting "pending"
      rejected,
    };
  }
}
