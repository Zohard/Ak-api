import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../shared/services/prisma.service';

@Injectable()
export class EventsJobService {
  private readonly logger = new Logger(EventsJobService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Hourly job: Update event statuses based on voting dates
   * Runs every hour to check for events that need status transitions
   */
  @Cron(CronExpression.EVERY_HOUR)
  async updateEventStatuses() {
    this.logger.log('Checking event statuses for automatic transitions');

    try {
      const now = new Date();
      let updatedToVoting = 0;
      let updatedToClosed = 0;

      // Transition active events to voting when voting_start has passed
      const toVotingResult = await this.prisma.$queryRaw<{ count: string }[]>`
        UPDATE ak_events
        SET status = 'voting', updated_at = NOW()
        WHERE status = 'active'
          AND voting_start IS NOT NULL
          AND voting_start <= ${now}
        RETURNING id
      `;
      updatedToVoting = Array.isArray(toVotingResult) ? toVotingResult.length : 0;

      // Transition voting events to closed when voting_end has passed
      const toClosedResult = await this.prisma.$queryRaw<{ count: string }[]>`
        UPDATE ak_events
        SET status = 'closed', updated_at = NOW()
        WHERE status = 'voting'
          AND voting_end IS NOT NULL
          AND voting_end <= ${now}
        RETURNING id
      `;
      updatedToClosed = Array.isArray(toClosedResult) ? toClosedResult.length : 0;

      if (updatedToVoting > 0 || updatedToClosed > 0) {
        this.logger.log(
          `Event status updates: ${updatedToVoting} opened for voting, ${updatedToClosed} closed`
        );
      }

      return {
        success: true,
        updatedToVoting,
        updatedToClosed,
        timestamp: now.toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to update event statuses', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Daily job: Clean up old events and send notifications
   * Runs at 6:00 AM every day
   */
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async dailyEventMaintenance() {
    this.logger.log('Starting daily event maintenance');

    try {
      // Get events starting voting today (for notification purposes)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const eventsStartingToday = await this.prisma.$queryRaw<any[]>`
        SELECT id, title, notify_users
        FROM ak_events
        WHERE voting_start >= ${today}
          AND voting_start < ${tomorrow}
          AND notify_users = true
          AND status IN ('active', 'voting')
      `;

      const eventsEndingToday = await this.prisma.$queryRaw<any[]>`
        SELECT id, title, notify_users
        FROM ak_events
        WHERE voting_end >= ${today}
          AND voting_end < ${tomorrow}
          AND notify_users = true
          AND status = 'voting'
      `;

      this.logger.log(
        `Daily maintenance: ${eventsStartingToday.length} events starting, ${eventsEndingToday.length} events ending today`
      );

      // TODO: Send notifications to subscribed users

      return {
        success: true,
        eventsStartingToday: eventsStartingToday.length,
        eventsEndingToday: eventsEndingToday.length,
      };
    } catch (error) {
      this.logger.error('Daily event maintenance failed', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get statistics about events
   */
  async getEventStats() {
    try {
      const stats = await this.prisma.$queryRaw<any[]>`
        SELECT
          status,
          COUNT(*) as count,
          SUM((SELECT COUNT(*) FROM ak_event_categories WHERE event_id = e.id)) as total_categories,
          SUM((SELECT COUNT(*) FROM ak_event_votes v
            JOIN ak_event_nominees n ON v.nominee_id = n.id
            JOIN ak_event_categories c ON n.category_id = c.id
            WHERE c.event_id = e.id)) as total_votes
        FROM ak_events e
        GROUP BY status
      `;

      const upcomingEvents = await this.prisma.$queryRaw<any[]>`
        SELECT id, title, slug, voting_start
        FROM ak_events
        WHERE status = 'active'
          AND voting_start IS NOT NULL
          AND voting_start > NOW()
        ORDER BY voting_start ASC
        LIMIT 5
      `;

      return {
        statusCounts: stats,
        upcomingEvents,
        lastChecked: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to get event stats', error);
      throw error;
    }
  }
}
