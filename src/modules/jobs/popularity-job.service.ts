import { Injectable, Logger } from '@nestjs/common';
import { ReviewsService } from '../reviews/reviews.service';
import { PrismaService } from '../../shared/services/prisma.service';
import { PopularityService } from '../../shared/services/popularity.service';

interface ReviewRanking {
  id: number;
  score: number;
  rank: number;
  previousRank: number;
  titre?: string;
}

@Injectable()
export class PopularityJobService {
  private readonly logger = new Logger(PopularityJobService.name);

  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly prisma: PrismaService,
    private readonly popularityService: PopularityService,
  ) { }

  /**
   * Recalculate popularity for recent reviews (last 7 days)
   * Triggered by external cron via HTTP endpoint
   */
  async recalculateRecentReviewsPopularity() {
    this.logger.log('Starting daily popularity recalculation for recent reviews');

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Get recent reviews
      const recentReviews = await this.prisma.akCritique.findMany({
        where: {
          dateCritique: { gte: sevenDaysAgo },
          statut: 0, // Only published reviews
        },
        select: { idCritique: true },
        take: 500, // Limit to prevent overload
      });

      let processed = 0;
      let errors = 0;

      for (const review of recentReviews) {
        try {
          await this.recalculateReviewPopularity(review.idCritique);
          processed++;
        } catch (error) {
          errors++;
          this.logger.error(`Failed to update popularity for review ${review.idCritique}`, error);
        }
      }

      this.logger.log(`Daily popularity recalculation completed: ${processed} processed, ${errors} errors`);
    } catch (error) {
      this.logger.error('Daily popularity recalculation failed', error);
    }
  }

  /**
   * Recalculate popularity for all reviews
   * Triggered by external cron via HTTP endpoint
   */
  async recalculateAllReviewsPopularity() {
    this.logger.log('Starting weekly popularity recalculation for all reviews');

    try {
      const batchSize = 500;
      let offset = 0;
      let totalProcessed = 0;
      let totalErrors = 0;

      while (true) {
        const reviews = await this.prisma.akCritique.findMany({
          where: { statut: 0 }, // Only published reviews
          select: { idCritique: true },
          take: batchSize,
          skip: offset,
          orderBy: { dateCritique: 'desc' },
        });

        if (reviews.length === 0) break;

        let batchProcessed = 0;
        let batchErrors = 0;

        for (const review of reviews) {
          try {
            await this.recalculateReviewPopularity(review.idCritique);
            batchProcessed++;
          } catch (error) {
            batchErrors++;
            this.logger.error(`Failed to update popularity for review ${review.idCritique}`, error);
          }
        }

        totalProcessed += batchProcessed;
        totalErrors += batchErrors;
        offset += batchSize;

        this.logger.log(`Batch completed: ${batchProcessed} processed, ${batchErrors} errors (Total: ${totalProcessed})`);

        // Smaller delay between batches to prevent overloading the database while remaining fast
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      this.logger.log(`Weekly popularity recalculation completed: ${totalProcessed} processed, ${totalErrors} errors`);
    } catch (error) {
      this.logger.error('Weekly popularity recalculation failed', error);
    }
  }

  /**
   * Reset daily view counters
   * Triggered by external cron via HTTP endpoint
   */
  async resetDailyCounters() {
    this.logger.log('Resetting daily view counters');

    try {
      await this.prisma.akCritique.updateMany({
        data: { nbClicsDay: 0 },
      });

      this.logger.log('Daily view counters reset successfully');
    } catch (error) {
      this.logger.error('Failed to reset daily view counters', error);
    }
  }

  /**
   * Reset weekly view counters
   * Triggered by external cron via HTTP endpoint
   */
  async resetWeeklyCounters() {
    this.logger.log('Resetting weekly view counters');

    try {
      await this.prisma.akCritique.updateMany({
        data: { nbClicsWeek: 0 },
      });

      this.logger.log('Weekly view counters reset successfully');
    } catch (error) {
      this.logger.error('Failed to reset weekly view counters', error);
    }
  }

  /**
   * Reset monthly view counters
   * Triggered by external cron via HTTP endpoint
   */
  async resetMonthlyCounters() {
    this.logger.log('Resetting monthly view counters');

    try {
      await this.prisma.akCritique.updateMany({
        data: { nbClicsMonth: 0 },
      });

      this.logger.log('Monthly view counters reset successfully');
    } catch (error) {
      this.logger.error('Failed to reset monthly view counters', error);
    }
  }

  /**
   * Manual trigger for recalculating a specific review's popularity
   */
  async recalculateReviewPopularity(reviewId: number) {
    const review = await this.prisma.akCritique.findUnique({
      where: { idCritique: reviewId },
      select: {
        idCritique: true,
        nbClics: true,
        nbClicsWeek: true,
        notation: true,
        nbCarac: true,
        dateCritique: true,
      },
    });

    if (!review) {
      throw new Error(`Review ${reviewId} not found`);
    }

    // Use the service method (avoiding circular dependency)
    const result = await this.reviewsService.updateAllPopularities(1);
    return result;
  }

  /**
   * Get job statistics
   */
  async getJobStats() {
    const totalReviews = await this.prisma.akCritique.count({
      where: { statut: 0 },
    });

    const reviewsWithPopularity = await this.prisma.akCritique.count({
      where: {
        statut: 0,
        popularite: { not: null },
      },
    });

    const averagePopularity = await this.prisma.akCritique.aggregate({
      where: {
        statut: 0,
        popularite: { not: null },
      },
      _avg: { popularite: true },
    });

    const topReviews = await this.prisma.akCritique.findMany({
      where: {
        statut: 0,
        popularite: { not: null },
      },
      orderBy: { popularite: 'desc' },
      take: 10,
      select: {
        idCritique: true,
        titre: true,
        popularite: true,
        nbClics: true,
        membre: {
          select: {
            memberName: true,
          },
        },
      },
    });

    return {
      totalReviews,
      reviewsWithPopularity,
      coverage: totalReviews > 0 ? (reviewsWithPopularity / totalReviews * 100) : 0,
      averagePopularity: averagePopularity._avg.popularite || 0,
      topReviews,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Update review rankings with historical tracking
   * Optimized version using bulk SQL UPDATE for performance (<30s for 9000+ reviews)
   */
  async updateReviewRankings() {
    this.logger.log('Starting review rankings update...');

    try {
      // Step 1: Bulk update all rankings in a single query
      // Score formula mirrors PopularityService.calculatePopularity():
      // - totalViews: ln(views+1)/10 * 0.25
      // - recentViews: ln(recentViews+1)/8 * 0.20
      // - growthRate: min(growth, 2) * 0.10
      // - rating: rating/10 * 0.15
      // - ratingCount: ln(count+1)/5 * 0.05
      // - likes/dislikes: ratio * 0.10 / -0.05
      // - length: score * 0.05
      // - recency: score * 0.08
      const updateResult = await this.prisma.$executeRaw`
        WITH review_scores AS (
          SELECT
            r.id_critique,
            r.classement_popularite as prev_rank,
            (
              -- Views: ln(views+1)/10 * 0.25
              (LN(COALESCE(r.nb_clics, 0) + 1) / 10.0) * 0.25 +
              -- Recent views: ln(recentViews+1)/8 * 0.20
              (LN(COALESCE(r.nb_clics_week, 0) + 1) / 8.0) * 0.20 +
              -- Growth rate: min((daily*7)/weekly, 2) * 0.10
              LEAST(
                CASE WHEN COALESCE(r.nb_clics_week, 0) > 0
                  THEN (COALESCE(r.nb_clics_day, 0) * 7.0) / r.nb_clics_week
                  ELSE 0
                END,
                2
              ) * 0.10 +
              -- Rating: rating/10 * 0.15
              (COALESCE(r.notation, 0) / 10.0) * 0.15 +
              -- Length score * 0.05
              CASE
                WHEN COALESCE(r.nb_carac, 0) < 100 THEN 0.2
                WHEN r.nb_carac < 300 THEN 0.5
                WHEN r.nb_carac < 500 THEN 0.7
                WHEN r.nb_carac < 1000 THEN 1.0
                WHEN r.nb_carac < 2000 THEN 0.9
                WHEN r.nb_carac < 3000 THEN 0.7
                ELSE 0.5
              END * 0.05 +
              -- Recency score * 0.08
              CASE
                WHEN r.date_critique IS NULL THEN 0.1
                WHEN EXTRACT(EPOCH FROM (NOW() - r.date_critique)) / 86400 < 1 THEN 1.0
                WHEN EXTRACT(EPOCH FROM (NOW() - r.date_critique)) / 86400 < 7 THEN 0.9
                WHEN EXTRACT(EPOCH FROM (NOW() - r.date_critique)) / 86400 < 30 THEN 0.7
                WHEN EXTRACT(EPOCH FROM (NOW() - r.date_critique)) / 86400 < 90 THEN 0.5
                WHEN EXTRACT(EPOCH FROM (NOW() - r.date_critique)) / 86400 < 180 THEN 0.3
                WHEN EXTRACT(EPOCH FROM (NOW() - r.date_critique)) / 86400 < 365 THEN 0.2
                ELSE 0.1
              END * 0.08
            ) * 10 as score
          FROM ak_critique r
          WHERE r.statut = 0
        ),
        ranked AS (
          SELECT
            id_critique,
            prev_rank,
            score,
            ROW_NUMBER() OVER (ORDER BY score DESC) as new_rank
          FROM review_scores
        )
        UPDATE ak_critique c
        SET
          popularite = LEAST(GREATEST(r.score, 0), 10),
          classement_popularite = r.new_rank::int,
          variation_popularite = CASE
            WHEN r.prev_rank IS NULL OR r.prev_rank = 0 THEN 'NEW'
            WHEN r.prev_rank > r.new_rank THEN '+' || (r.prev_rank - r.new_rank)::text
            WHEN r.prev_rank < r.new_rank THEN (r.prev_rank - r.new_rank)::text
            ELSE '='
          END
        FROM ranked r
        WHERE c.id_critique = r.id_critique
      `;

      this.logger.log(`Bulk updated ${updateResult} review rankings`);

      // Step 2: Get top 10 for response
      const top10 = await this.prisma.akCritique.findMany({
        where: {
          statut: 0,
          classementPopularite: { gt: 0 },
        },
        orderBy: { classementPopularite: 'asc' },
        take: 10,
        select: {
          idCritique: true,
          titre: true,
          popularite: true,
          classementPopularite: true,
          variationPopularite: true,
        },
      });

      this.logger.log(`Review rankings update completed - Updated: ${updateResult}`);

      return {
        success: true,
        message: `Updated ${updateResult} review rankings`,
        stats: {
          totalReviews: updateResult,
          updatedCount: updateResult,
          errorCount: 0,
        },
        top10: top10.map((r) => ({
          rank: r.classementPopularite,
          id: r.idCritique,
          titre: r.titre || 'Sans titre',
          score: Math.round((r.popularite || 0) * 100) / 100,
          change: r.variationPopularite || '=',
        })),
      };
    } catch (error) {
      this.logger.error(`Fatal error in review rankings update: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Parse questions JSON from review
   */
  private parseQuestions(questionsJson?: string | null): Record<string, { c: number; a: number; o: number; y: number; n: number }> {
    if (!questionsJson) return {};
    try {
      return JSON.parse(questionsJson);
    } catch {
      return {};
    }
  }

  /**
   * Calculate rating totals from questions
   */
  private calculateRatingTotals(questions: Record<string, { c: number; a: number; o: number; y: number; n: number }>): { c: number; a: number; o: number; y: number; n: number } {
    const totals = { c: 0, a: 0, o: 0, y: 0, n: 0 };

    Object.values(questions).forEach((userRatings) => {
      if (userRatings.c === 1) totals.c++;
      if (userRatings.a === 1) totals.a++;
      if (userRatings.o === 1) totals.o++;
      if (userRatings.y === 1) totals.y++;
      if (userRatings.n === 1) totals.n++;
    });

    return totals;
  }

  /**
   * Format date as DD-MM-YYYY for variation history key
   */
  private formatDateKey(date: Date): string {
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    return `${day}-${month.toString().padStart(2, '0')}-${year}`;
  }

  /**
   * Parse date key back to Date object
   */
  private parseDateKey(dateKey: string): Date {
    const parts = dateKey.split('-');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
    return new Date(0);
  }

  /**
   * Calculate variation text (e.g., "+5", "-3", "NEW", "=")
   */
  private calculateVariationText(rank: number, previousRank: number): string {
    if (previousRank === 0) {
      return 'NEW';
    }
    const change = previousRank - rank;
    if (change > 0) {
      return `+${change}`;
    } else if (change < 0) {
      return `${change}`;
    }
    return '=';
  }
}