import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReviewsService } from '../reviews/reviews.service';
import { PrismaService } from '../../shared/services/prisma.service';

@Injectable()
export class PopularityJobService {
  private readonly logger = new Logger(PopularityJobService.name);

  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Daily job: Recalculate popularity for recent reviews (last 7 days)
   * Runs at 2:00 AM every day
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
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
   * Weekly job: Recalculate popularity for all reviews
   * Runs every Sunday at 3:00 AM
   */
  @Cron('0 3 * * 0') // Every Sunday at 3:00 AM
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
   * Hourly job: Reset daily view counters
   * Runs at the beginning of each hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async resetDailyCounters() {
    // Only reset at midnight
    const now = new Date();
    if (now.getHours() !== 0) return;

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
   * Weekly job: Reset weekly view counters
   * Runs every Monday at midnight
   */
  @Cron('0 0 * * 1') // Every Monday at midnight
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
   * Monthly job: Reset monthly view counters
   * Runs on the first day of each month at midnight
   */
  @Cron('0 0 1 * *') // First day of every month at midnight
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
}