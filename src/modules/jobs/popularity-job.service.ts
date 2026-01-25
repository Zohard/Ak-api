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
  ) {}

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
      const batchSize = 100;
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

        // Small delay between batches to prevent overloading the database
        await new Promise(resolve => setTimeout(resolve, 1000));
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
   * This calculates popularity scores for all reviews, assigns ranks,
   * and stores historical ranking data in variationPopularite as JSON
   */
  async updateReviewRankings() {
    this.logger.log('Starting review rankings update...');

    try {
      // Step 1: Get all published reviews with their data for popularity calculation
      const reviews = await this.prisma.akCritique.findMany({
        where: { statut: 0 },
        select: {
          idCritique: true,
          titre: true,
          nbClics: true,
          nbClicsDay: true,
          nbClicsWeek: true,
          nbClicsMonth: true,
          notation: true,
          nbCarac: true,
          dateCritique: true,
          questions: true,
          classementPopularite: true,
          variationPopularite: true,
        },
      });

      if (reviews.length === 0) {
        this.logger.warn('No reviews found to rank');
        return {
          success: true,
          message: 'No reviews to rank',
          stats: { totalReviews: 0, updatedCount: 0, errorCount: 0 },
          top10: [],
        };
      }

      // Step 2: Calculate popularity score for each review
      const reviewsWithScores = reviews.map((review) => {
        const questions = this.parseQuestions(review.questions);
        const totals = this.calculateRatingTotals(questions);
        const ageInDays = review.dateCritique
          ? Math.floor((Date.now() - new Date(review.dateCritique).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        // Calculate comprehensive popularity score
        const score = this.popularityService.calculatePopularity({
          totalViews: review.nbClics || 0,
          recentViews: review.nbClicsWeek || 0,
          viewsGrowthRate: review.nbClicsDay && review.nbClicsWeek
            ? (review.nbClicsDay * 7) / Math.max(review.nbClicsWeek, 1)
            : 0,
          averageRating: review.notation || 0,
          ratingCount: totals.c + totals.a + totals.o + totals.y + totals.n,
          likes: totals.c + totals.a + totals.o + totals.y, // All positive ratings
          dislikes: totals.n,
          reviewLength: review.nbCarac || 0,
          ageInDays,
        });

        return {
          id: review.idCritique,
          titre: review.titre,
          score,
          previousRank: review.classementPopularite || 0,
          currentVariation: review.variationPopularite,
        };
      });

      // Step 3: Sort by score and assign ranks
      reviewsWithScores.sort((a, b) => b.score - a.score);
      const rankings: ReviewRanking[] = reviewsWithScores.map((review, index) => ({
        id: review.id,
        titre: review.titre || undefined,
        score: review.score,
        rank: index + 1,
        previousRank: review.previousRank,
      }));

      // Step 4: Update database with new rankings and historical data
      const today = this.formatDateKey(new Date());
      let updatedCount = 0;
      let errorCount = 0;

      const batchSize = 100;
      for (let i = 0; i < rankings.length; i += batchSize) {
        const batch = rankings.slice(i, i + batchSize);
        const batchReviews = reviewsWithScores.slice(i, i + batchSize);

        const promises = batch.map(async (ranking, batchIndex) => {
          try {
            // Parse existing variation history
            const existingVariation = batchReviews[batchIndex].currentVariation;
            let variationHistory: Record<string, number> = {};

            if (existingVariation) {
              try {
                variationHistory = JSON.parse(existingVariation);
              } catch {
                // If it's not valid JSON (old format like "+5", "NEW"), start fresh
                variationHistory = {};
              }
            }

            // Add today's ranking to history (keep last 30 days)
            variationHistory[today] = ranking.rank;

            // Clean up old entries (keep only last 30 days)
            const sortedDates = Object.keys(variationHistory).sort((a, b) => {
              const dateA = this.parseDateKey(a);
              const dateB = this.parseDateKey(b);
              return dateB.getTime() - dateA.getTime();
            });

            if (sortedDates.length > 30) {
              const datesToKeep = sortedDates.slice(0, 30);
              const cleanedHistory: Record<string, number> = {};
              datesToKeep.forEach(date => {
                cleanedHistory[date] = variationHistory[date];
              });
              variationHistory = cleanedHistory;
            }

            await this.prisma.akCritique.update({
              where: { idCritique: ranking.id },
              data: {
                popularite: ranking.score,
                classementPopularite: ranking.rank,
                variationPopularite: JSON.stringify(variationHistory),
              },
            });

            updatedCount++;
          } catch (error) {
            this.logger.error(`Error updating review ${ranking.id}: ${error.message}`);
            errorCount++;
          }
        });

        await Promise.all(promises);
        this.logger.log(`Batch ${Math.floor(i / batchSize) + 1} completed: ${batch.length} reviews processed`);

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Step 5: Build top 10 results
      const top10 = rankings.slice(0, 10).map((r) => {
        const change = this.calculateVariationText(r.rank, r.previousRank);
        return {
          rank: r.rank,
          id: r.id,
          titre: r.titre || 'Sans titre',
          score: Math.round(r.score * 100) / 100,
          change,
        };
      });

      this.logger.log(`Review rankings update completed - Updated: ${updatedCount}, Errors: ${errorCount}`);

      return {
        success: true,
        message: `Updated ${updatedCount} review rankings`,
        stats: {
          totalReviews: rankings.length,
          updatedCount,
          errorCount,
        },
        top10,
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