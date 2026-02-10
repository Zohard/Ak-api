import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { EpisodesService } from '../animes/episodes/episodes.service';
import { MangaVolumesService } from '../mangas/manga-volumes.service';

// Max users to notify per single content item (episode, volume, related content)
const MAX_USERS_PER_CONTENT = 500;

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

export interface NotificationPreferences {
  // Email preferences
  emailNewReview: boolean;
  emailNewSeasonAnime: boolean;
  emailReviewModerated: boolean;
  emailSecurityAlerts: boolean;
  emailMarketing: boolean;
  emailReviewLiked: boolean;
  emailRelatedContent: boolean;
  emailFriendRequest: boolean;
  emailFriendAccepted: boolean;
  emailEventVoting: boolean;
  // Website (in-app) preferences
  webNewReview: boolean;
  webNewSeasonAnime: boolean;
  webReviewModerated: boolean;
  webSecurityAlerts: boolean;
  webMarketing: boolean;
  webReviewLiked: boolean;
  webRelatedContent: boolean;
  webFriendRequest: boolean;
  webFriendAccepted: boolean;
  webEventVoting: boolean;
}

export interface NotificationData {
  userId: number;
  type:
  | 'new_review'
  | 'new_season_anime'
  | 'review_moderated'
  | 'review_liked'
  | 'security_alert'
  | 'marketing'
  | 'friend_request'
  | 'friend_accepted'
  | 'event_voting_started'
  | 'event_voting_ended'
  | 'related_content_added'
  | 'related_content_added'
  | 'episode_release'
  | 'volume_release';
  title: string;
  message: string;
  data?: any;
  priority: 'low' | 'medium' | 'high';
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private episodesService: EpisodesService,
    private mangaVolumesService: MangaVolumesService,
  ) {
    this.initializeEmailTransporter();
  }

  private initializeEmailTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        host: this.configService.get('SMTP_HOST', 'localhost'),
        port: this.configService.get('SMTP_PORT', 587),
        secure: this.configService.get('SMTP_SECURE', false),
        auth: {
          user: this.configService.get('SMTP_USER'),
          pass: this.configService.get('SMTP_PASS'),
        },
      });

      this.logger.log('Email transporter initialized successfully');
    } catch (error) {
      this.logger.error(
        'Failed to initialize email transporter:',
        error.message,
      );
    }
  }

  // Send notification
  async sendNotification(data: NotificationData): Promise<boolean> {
    try {
      // Check user preferences
      const preferences = await this.getUserPreferences(data.userId);
      if (!this.shouldSendNotification(data.type, preferences)) {
        this.logger.debug(
          `Notification blocked by user preferences: ${data.type} for user ${data.userId}`,
        );
        return false;
      }

      // Store notification in database
      await this.storeNotification(data);

      // Send email if user has email notifications enabled for this type
      const shouldSendEmail = this.shouldSendEmail(data.type, preferences);
      if (shouldSendEmail) {
        // Run email sending in background to avoid blocking the response
        this.sendEmail(data).catch(err =>
          this.logger.error(`Background email sending failed: ${err.message}`)
        );
      }

      this.logger.log(
        `Notification sent successfully: ${data.type} to user ${data.userId}`,
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to send notification: ${error.message}`);
      return false;
    }
  }

  // Get user notification preferences
  async getUserPreferences(userId: number): Promise<NotificationPreferences> {
    try {
      const preferences = await this.prisma.$queryRaw`
        SELECT
          email_new_review,
          email_new_season_anime,
          email_review_moderated,
          email_security_alerts,
          email_marketing,
          email_review_liked,
          email_related_content,
          email_friend_request,
          email_friend_accepted,
          email_event_voting,
          web_new_review,
          web_new_season_anime,
          web_review_moderated,
          web_security_alerts,
          web_marketing,
          web_review_liked,
          web_related_content,
          web_friend_request,
          web_friend_accepted,
          web_event_voting
        FROM user_notification_preferences
        WHERE user_id = ${userId}
      `;

      if (!preferences || (preferences as any[]).length === 0) {
        // Return default preferences if none exist
        return this.getDefaultPreferences();
      }

      const prefs = (preferences as any[])[0];
      return {
        // Email preferences
        emailNewReview: prefs.email_new_review ?? false,
        emailNewSeasonAnime: prefs.email_new_season_anime ?? false,
        emailReviewModerated: prefs.email_review_moderated ?? false,
        emailSecurityAlerts: prefs.email_security_alerts ?? true,
        emailMarketing: prefs.email_marketing ?? false,
        emailReviewLiked: prefs.email_review_liked ?? true,
        emailRelatedContent: prefs.email_related_content ?? true,
        emailFriendRequest: prefs.email_friend_request ?? true,
        emailFriendAccepted: prefs.email_friend_accepted ?? true,
        emailEventVoting: prefs.email_event_voting ?? true,
        // Website (in-app) preferences - default to true
        webNewReview: prefs.web_new_review ?? true,
        webNewSeasonAnime: prefs.web_new_season_anime ?? true,
        webReviewModerated: prefs.web_review_moderated ?? true,
        webSecurityAlerts: prefs.web_security_alerts ?? true,
        webMarketing: prefs.web_marketing ?? true,
        webReviewLiked: prefs.web_review_liked ?? true,
        webRelatedContent: prefs.web_related_content ?? true,
        webFriendRequest: prefs.web_friend_request ?? true,
        webFriendAccepted: prefs.web_friend_accepted ?? true,
        webEventVoting: prefs.web_event_voting ?? true,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to get user preferences for user ${userId}, using defaults: ${error.message}`,
      );
      return this.getDefaultPreferences();
    }
  }

  // Update user notification preferences
  async updateUserPreferences(
    userId: number,
    preferences: Partial<NotificationPreferences>,
  ): Promise<boolean> {
    try {
      // First get current preferences to merge with updates
      const current = await this.getUserPreferences(userId);
      const merged = { ...current, ...preferences };

      await this.prisma.$executeRaw`
        INSERT INTO user_notification_preferences (
          user_id,
          email_new_review,
          email_new_season_anime,
          email_review_moderated,
          email_security_alerts,
          email_marketing,
          email_review_liked,
          email_related_content,
          email_friend_request,
          email_friend_accepted,
          email_event_voting,
          web_new_review,
          web_new_season_anime,
          web_review_moderated,
          web_security_alerts,
          web_marketing,
          web_review_liked,
          web_related_content,
          web_friend_request,
          web_friend_accepted,
          web_event_voting,
          updated_at
        ) VALUES (
          ${userId},
          ${merged.emailNewReview},
          ${merged.emailNewSeasonAnime},
          ${merged.emailReviewModerated},
          ${merged.emailSecurityAlerts},
          ${merged.emailMarketing},
          ${merged.emailReviewLiked},
          ${merged.emailRelatedContent},
          ${merged.emailFriendRequest},
          ${merged.emailFriendAccepted},
          ${merged.emailEventVoting},
          ${merged.webNewReview},
          ${merged.webNewSeasonAnime},
          ${merged.webReviewModerated},
          ${merged.webSecurityAlerts},
          ${merged.webMarketing},
          ${merged.webReviewLiked},
          ${merged.webRelatedContent},
          ${merged.webFriendRequest},
          ${merged.webFriendAccepted},
          ${merged.webEventVoting},
          NOW()
        )
        ON CONFLICT (user_id) DO UPDATE SET
          email_new_review = EXCLUDED.email_new_review,
          email_new_season_anime = EXCLUDED.email_new_season_anime,
          email_review_moderated = EXCLUDED.email_review_moderated,
          email_security_alerts = EXCLUDED.email_security_alerts,
          email_marketing = EXCLUDED.email_marketing,
          email_review_liked = EXCLUDED.email_review_liked,
          email_related_content = EXCLUDED.email_related_content,
          email_friend_request = EXCLUDED.email_friend_request,
          email_friend_accepted = EXCLUDED.email_friend_accepted,
          email_event_voting = EXCLUDED.email_event_voting,
          web_new_review = EXCLUDED.web_new_review,
          web_new_season_anime = EXCLUDED.web_new_season_anime,
          web_review_moderated = EXCLUDED.web_review_moderated,
          web_security_alerts = EXCLUDED.web_security_alerts,
          web_marketing = EXCLUDED.web_marketing,
          web_review_liked = EXCLUDED.web_review_liked,
          web_related_content = EXCLUDED.web_related_content,
          web_friend_request = EXCLUDED.web_friend_request,
          web_friend_accepted = EXCLUDED.web_friend_accepted,
          web_event_voting = EXCLUDED.web_event_voting,
          updated_at = NOW()
      `;

      this.logger.log(`Updated notification preferences for user ${userId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to update user preferences: ${error.message}`);
      return false;
    }
  }

  // Get user notifications (inbox)
  async getUserNotifications(
    userId: number,
    page = 1,
    limit = 20,
    unreadOnly = false,
  ) {
    const offset = (page - 1) * limit;

    let notifications;
    let countResult;

    if (unreadOnly) {
      notifications = await this.prisma.$queryRaw`
        SELECT
          id,
          type,
          title,
          message,
          data,
          priority,
          read_at,
          created_at
        FROM user_notifications
        WHERE user_id = ${userId} AND read_at IS NULL
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      countResult = await this.prisma.$queryRaw`
        SELECT COUNT(*) as total
        FROM user_notifications
        WHERE user_id = ${userId} AND read_at IS NULL
      `;
    } else {
      notifications = await this.prisma.$queryRaw`
        SELECT
          id,
          type,
          title,
          message,
          data,
          priority,
          read_at,
          created_at
        FROM user_notifications
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      countResult = await this.prisma.$queryRaw`
        SELECT COUNT(*) as total
        FROM user_notifications
        WHERE user_id = ${userId}
      `;
    }

    const total = Number((countResult as any[])[0]?.total || 0);

    return {
      notifications: notifications as any[],
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrevious: page > 1,
      },
    };
  }

  // Mark notification as read
  async markAsRead(notificationId: number, userId: number): Promise<boolean> {
    try {
      await this.prisma.$executeRaw`
        UPDATE user_notifications 
        SET read_at = NOW()
        WHERE id = ${notificationId} AND user_id = ${userId} AND read_at IS NULL
      `;

      this.logger.debug(
        `Marked notification ${notificationId} as read for user ${userId}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to mark notification as read: ${error.message}`,
      );
      return false;
    }
  }

  // Mark all notifications as read for a user
  async markAllAsRead(userId: number): Promise<boolean> {
    try {
      await this.prisma.$executeRaw`
        UPDATE user_notifications 
        SET read_at = NOW()
        WHERE user_id = ${userId} AND read_at IS NULL
      `;

      this.logger.log(`Marked all notifications as read for user ${userId}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to mark all notifications as read: ${error.message}`,
      );
      return false;
    }
  }

  // Get notification statistics
  async getNotificationStats(userId: number) {
    try {
      const stats = await this.prisma.$queryRaw`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN read_at IS NULL THEN 1 END) as unread,
          COUNT(CASE WHEN priority = 'high' AND read_at IS NULL THEN 1 END) as high_priority_unread
        FROM user_notifications 
        WHERE user_id = ${userId}
      `;

      const result = (stats as any[])[0];
      return {
        total: Number(result.total),
        unread: Number(result.unread),
        highPriorityUnread: Number(result.high_priority_unread),
      };
    } catch (error) {
      this.logger.error(`Failed to get notification stats: ${error.message}`);
      return { total: 0, unread: 0, highPriorityUnread: 0 };
    }
  }

  // Helper methods
  private getDefaultPreferences(): NotificationPreferences {
    return {
      // Email preferences - most off by default except important ones
      emailNewReview: false,
      emailNewSeasonAnime: false,
      emailReviewModerated: false,
      emailSecurityAlerts: true,
      emailMarketing: false,
      emailReviewLiked: true,
      emailRelatedContent: true,
      emailFriendRequest: true,
      emailFriendAccepted: true,
      emailEventVoting: true,
      // Website (in-app) preferences - all on by default
      webNewReview: true,
      webNewSeasonAnime: true,
      webReviewModerated: true,
      webSecurityAlerts: true,
      webMarketing: true,
      webReviewLiked: true,
      webRelatedContent: true,
      webFriendRequest: true,
      webFriendAccepted: true,
      webEventVoting: true,
    };
  }

  // Check if we should store the notification in the database (website notifications)
  private shouldSendNotification(
    type: string,
    preferences: NotificationPreferences,
  ): boolean {
    // Always store security alerts
    if (type === 'security_alert') return preferences.webSecurityAlerts;

    // Check user web preferences for other types
    switch (type) {
      case 'new_review':
        return preferences.webNewReview;
      case 'new_season_anime':
        return preferences.webNewSeasonAnime;
      case 'review_moderated':
        return preferences.webReviewModerated;
      case 'review_liked':
        return preferences.webReviewLiked;
      case 'marketing':
        return preferences.webMarketing;
      case 'related_content_added':
        return preferences.webRelatedContent;
      case 'friend_request':
        return preferences.webFriendRequest;
      case 'friend_accepted':
        return preferences.webFriendAccepted;
      case 'event_voting_started':
      case 'event_voting_ended':
        return preferences.webEventVoting;
      case 'episode_release':
        // Reuse new season anime preference for episode releases
        return preferences.webNewSeasonAnime;
      case 'volume_release':
        // Reuse new season anime preference (or new review?) - Let's reuse new season anime for now as "New Content"
        return preferences.webNewSeasonAnime;
      default:
        return true;
    }
  }

  // Check if we should send an email for this notification type
  private shouldSendEmail(
    type: string,
    preferences: NotificationPreferences,
  ): boolean {
    switch (type) {
      case 'new_review':
        return preferences.emailNewReview;
      case 'new_season_anime':
        return preferences.emailNewSeasonAnime;
      case 'review_moderated':
        return preferences.emailReviewModerated;
      case 'review_liked':
        return preferences.emailReviewLiked;
      case 'security_alert':
        return preferences.emailSecurityAlerts;
      case 'marketing':
        return preferences.emailMarketing;
      case 'related_content_added':
        return preferences.emailRelatedContent;
      case 'friend_request':
        return preferences.emailFriendRequest;
      case 'friend_accepted':
        return preferences.emailFriendAccepted;
      case 'event_voting_started':
      case 'event_voting_ended':
        return preferences.emailEventVoting;
      case 'episode_release':
        return preferences.emailNewSeasonAnime;
      case 'volume_release':
        return preferences.emailNewSeasonAnime;
      default:
        return false;
    }
  }

  /**
   * Send notifications to many users at once using bulk DB insert.
   * Skips per-user preference check and email sending to avoid N+1 queries.
   * Returns the number of notifications actually inserted.
   */
  private async sendBulkNotifications(
    userIds: number[],
    notification: Omit<NotificationData, 'userId'>,
    dedupeKey?: string,
  ): Promise<number> {
    if (userIds.length === 0) return 0;

    const type = notification.type;
    const jsonData = notification.data ? JSON.stringify(notification.data) : null;

    // Bulk duplicate check: find users who already received this notification type + dedupeKey within 24h
    let existingUserIds: Set<number> = new Set();
    if (dedupeKey) {
      try {
        const existing = await this.prisma.$queryRaw<{ user_id: number }[]>`
          SELECT DISTINCT user_id FROM user_notifications
          WHERE user_id = ANY(${userIds}::int[])
            AND type = ${type}
            AND data->>${'episodeId'} = ${dedupeKey}
            AND created_at > NOW() - INTERVAL '24 hours'
        `;
        existingUserIds = new Set(existing.map((r) => Number(r.user_id)));
      } catch (error) {
        this.logger.warn(`Bulk duplicate check failed: ${error.message}`);
      }
    }

    const newUserIds = userIds.filter((id) => !existingUserIds.has(id));
    if (newUserIds.length === 0) return 0;

    // Bulk insert in batches of 500 using unnest for efficiency
    const batchSize = 500;
    let inserted = 0;

    for (let i = 0; i < newUserIds.length; i += batchSize) {
      const batch = newUserIds.slice(i, i + batchSize);
      try {
        await this.prisma.$executeRaw`
          INSERT INTO user_notifications (user_id, type, title, message, data, priority, created_at)
          SELECT unnest(${batch}::int[]),
                 ${type}, ${notification.title}, ${notification.message},
                 ${jsonData}::jsonb, ${notification.priority}, NOW()
        `;
        inserted += batch.length;
      } catch (error) {
        this.logger.error(`Bulk insert batch failed: ${error.message}`);
      }
    }

    return inserted;
  }

  private async storeNotification(data: NotificationData): Promise<void> {
    // Check for duplicate notification (same user, type, and key data within 24 hours)
    const isDuplicate = await this.checkDuplicateNotification(data);
    if (isDuplicate) {
      this.logger.debug(`Duplicate notification skipped: ${data.type} for user ${data.userId}`);
      return;
    }

    const jsonData = data.data ? JSON.stringify(data.data) : null;
    await this.prisma.$executeRaw`
      INSERT INTO user_notifications (
        user_id,
        type,
        title,
        message,
        data,
        priority,
        created_at
      ) VALUES (
        ${data.userId},
        ${data.type},
        ${data.title},
        ${data.message},
        ${jsonData}::jsonb,
        ${data.priority},
        NOW()
      )
    `;
  }

  /**
   * Check if a similar notification was already sent within 24 hours
   */
  private async checkDuplicateNotification(data: NotificationData): Promise<boolean> {
    try {
      let duplicateCheck: any[] = [];

      if (data.type === 'episode_release' && data.data?.episodeId) {
        // For episode releases, check by episodeId
        duplicateCheck = await this.prisma.$queryRaw`
          SELECT 1 FROM user_notifications
          WHERE user_id = ${data.userId}
            AND type = ${data.type}
            AND data->>'episodeId' = ${String(data.data.episodeId)}
            AND created_at > NOW() - INTERVAL '24 hours'
          LIMIT 1
        `;
      } else if (data.type === 'review_liked' && data.data?.reviewId) {
        // For review likes, check by reviewId and reactorId
        duplicateCheck = await this.prisma.$queryRaw`
          SELECT 1 FROM user_notifications
          WHERE user_id = ${data.userId}
            AND type = ${data.type}
            AND data->>'reviewId' = ${String(data.data.reviewId)}
            AND data->>'reactorId' = ${String(data.data.reactorId || '')}
            AND created_at > NOW() - INTERVAL '24 hours'
          LIMIT 1
        `;
      } else if (data.data?.animeId || data.data?.mangaId) {
        // For other content-related notifications
        const contentId = data.data.animeId || data.data.mangaId;
        const contentKey = data.data.animeId ? 'animeId' : 'mangaId';
        duplicateCheck = await this.prisma.$queryRaw`
          SELECT 1 FROM user_notifications
          WHERE user_id = ${data.userId}
            AND type = ${data.type}
            AND data->>${contentKey} = ${String(contentId)}
            AND created_at > NOW() - INTERVAL '24 hours'
          LIMIT 1
        `;
      }

      return duplicateCheck.length > 0;
    } catch (error) {
      this.logger.warn(`Error checking duplicate notification: ${error.message}`);
      return false; // Allow notification if check fails
    }
  }

  private async sendEmail(data: NotificationData): Promise<void> {
    if (!this.transporter) {
      this.logger.warn('Email transporter not available, skipping email');
      return;
    }

    try {
      // Get user email
      const user = await this.prisma.$queryRaw`
        SELECT email_address, member_name
        FROM smf_members 
        WHERE id_member = ${data.userId}
      `;

      if (!user || (user as any[]).length === 0) {
        this.logger.warn(`User ${data.userId} not found, cannot send email`);
        return;
      }

      const userData = (user as any[])[0];
      const template = this.getEmailTemplate(data);

      await this.transporter.sendMail({
        from: this.configService.get('SMTP_FROM', 'noreply@anime-kun.com'),
        to: userData.email_address,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });

      this.logger.log(
        `Email sent successfully to ${userData.email_address} for notification type: ${data.type}`,
      );
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`);
    }
  }

  private getEmailTemplate(data: NotificationData): EmailTemplate {
    const baseUrl = this.configService.get('APP_URL', 'http://localhost:3003');

    switch (data.type) {
      case 'new_review':
        return {
          subject: `Nouvelle critique ajoutée - ${data.title}`,
          html: `
            <h2>Nouvelle critique disponible</h2>
            <p>Une nouvelle critique a été ajoutée pour <strong>${data.title}</strong>.</p>
            <p>${data.message}</p>
            <a href="${baseUrl}/reviews/${data.data?.reviewId}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Voir la critique</a>
          `,
          text: `Nouvelle critique ajoutée pour ${data.title}. ${data.message}`,
        };

      case 'new_season_anime':
        return {
          subject: `📺 Nouvelle saison disponible : ${data.title}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
              <div style="background-color: #3b82f6; padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">📺 Nouvelle Saison !</h1>
              </div>
              <div style="padding: 30px; line-height: 1.6; color: #374151;">
                <h2 style="margin-top: 0;">Une nouvelle saison a été ajoutée</h2>
                <p>Bonne nouvelle ! Une nouvelle saison pour l'anime <strong>${data.title}</strong> est maintenant disponible sur Anime-Kun.</p>
                <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 0;">${data.message}</p>
                </div>
                <div style="text-align: center; margin-top: 30px;">
                  <a href="${baseUrl}/anime/${data.data?.animeSlug || data.data?.animeId}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Voir la fiche</a>
                </div>
              </div>
              <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
                Vous recevez cet email car vous avez ajouté cet anime ou un lien à vos favoris.
              </div>
            </div>
          `,
          text: `Nouvelle saison disponible pour ${data.title}. ${data.message}`,
        };

      case 'episode_release':
        return {
          subject: `${data.title}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
              <div style="background-color: #3b82f6; padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">▶️ Nouvel Épisode !</h1>
              </div>
              <div style="padding: 30px; line-height: 1.6; color: #374151;">
                <h2 style="margin-top: 0;">Un nouvel épisode est disponible</h2>
                <p>${data.message}</p>
                <div style="text-align: center; margin-top: 30px;">
                  <a href="${baseUrl}/anime/${data.data?.animeSlug || data.data?.animeId}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Voir la fiche</a>
                </div>
              </div>
              <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
                Vous recevez cet email car vous avez cet anime dans votre collection.
              </div>
            </div>
          `,
          text: `${data.title}. ${data.message}`,
        };

      case 'volume_release':
        return {
          subject: `${data.title}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
              <div style="background-color: #f97316; padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">📚 Nouveau Tome !</h1>
              </div>
              <div style="padding: 30px; line-height: 1.6; color: #374151;">
                <h2 style="margin-top: 0;">Un nouveau volume est disponible</h2>
                <p>${data.message}</p>
                <div style="text-align: center; margin-top: 30px;">
                  <a href="${baseUrl}/manga/${data.data?.mangaSlug || data.data?.mangaId}" style="background-color: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Voir la fiche</a>
                </div>
              </div>
              <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
                Vous recevez cet email car vous avez ce manga dans votre collection.
              </div>
            </div>
          `,
          text: `${data.title}. ${data.message}`,
        };

      case 'review_moderated':
        return {
          subject: `Votre critique a été ${data.data?.status === 'approved' ? 'approuvée' : 'rejetée'}`,
          html: `
            <h2>Statut de votre critique</h2>
            <p>Votre critique pour <strong>${data.title}</strong> a été ${data.data?.status === 'approved' ? 'approuvée' : 'rejetée'}.</p>
            <p>${data.message}</p>
            ${data.data?.reason ? `<p><strong>Raison:</strong> ${data.data.reason}</p>` : ''}
            <a href="${baseUrl}/profile/reviews" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Voir mes critiques</a>
          `,
        };

      case 'security_alert':
        return {
          subject: `Alerte de sécurité - ${data.title}`,
          html: `
            <h2 style="color: #dc3545;">Alerte de sécurité</h2>
            <p><strong>${data.title}</strong></p>
            <p>${data.message}</p>
            <p style="color: #6c757d; font-size: 0.9em;">Si vous n'êtes pas à l'origine de cette action, veuillez contacter immédiatement notre support.</p>
            <a href="${baseUrl}/profile/security" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Vérifier mon compte</a>
          `,
        };

      case 'friend_request':
        return {
          subject: `🤝 Nouvelle demande d'ami de ${data.title}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
              <div style="padding: 30px; line-height: 1.6; color: #374151;">
                <h2 style="margin-top: 0;">🤝 Nouvelle demande d'ami</h2>
                <p><strong>${data.title}</strong> souhaite devenir votre ami sur Anime-Kun.</p>
                <p>${data.message}</p>
                <div style="text-align: center; margin-top: 30px;">
                  <a href="${baseUrl}/user/${data.data?.senderUsername || data.title}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Voir son profil</a>
                </div>
              </div>
            </div>
          `,
          text: `${data.title} souhaite devenir votre ami. ${data.message}`,
        };

      case 'friend_accepted':
        return {
          subject: `👋 Demande d'ami acceptée - ${data.title}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
              <div style="padding: 30px; line-height: 1.6; color: #374151;">
                <h2 style="margin-top: 0;">🎉 C'est officiel !</h2>
                <p><strong>${data.title}</strong> a accepté votre demande d'ami. Vous pouvez maintenant suivre son activité de plus près.</p>
                <div style="text-align: center; margin-top: 30px;">
                  <a href="${baseUrl}/user/${data.data?.username || data.title}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Voir son profil</a>
                </div>
              </div>
            </div>
          `,
          text: `${data.title} a accepté votre demande d'ami.`,
        };

      case 'marketing':
        return {
          subject: `✨ Actualités Anime-Kun : ${data.title}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
              <div style="background-color: #6366f1; padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">Anime-Kun News</h1>
              </div>
              <div style="padding: 30px; line-height: 1.6; color: #374151;">
                <h2 style="margin-top: 0;">${data.title}</h2>
                <p>${data.message}</p>
                <div style="text-align: center; margin-top: 30px;">
                  <a href="${baseUrl}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Visiter le site</a>
                </div>
              </div>
            </div>
          `,
          text: `${data.title}\n\n${data.message}`,
        };

      case 'review_liked':
        const reactionEmojis = {
          c: '💡',  // Convincing
          a: '😄',  // Amusing
          o: '⭐',  // Original
          y: '👍',  // Agree
        };
        const reactionType = data.data?.reactionType || 'y';
        const emoji = reactionEmojis[reactionType] || '👍';

        return {
          subject: `${emoji} ${data.data?.likerName || 'Quelqu\'un'} a réagi à votre critique`,
          html: `
            <h2>${emoji} Votre critique a reçu une réaction !</h2>
            <p><strong>${data.data?.likerName || 'Un membre'}</strong> ${data.data?.reactionLabel || 'a réagi à votre critique'} pour <strong>${data.title}</strong>.</p>
            <p>${data.message}</p>
            <a href="${baseUrl}/review/${data.data?.reviewSlug || data.data?.reviewId}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Voir votre critique</a>
          `,
          text: `${data.data?.likerName || 'Quelqu\'un'} ${data.data?.reactionLabel || 'a réagi à votre critique'} pour ${data.title}. ${data.message}`,
        };

      case 'event_voting_started':
        return {
          subject: `🎉 Les votes sont ouverts - ${data.title}`,
          html: `
            <h2>🎉 Les votes sont maintenant ouverts !</h2>
            <p>L'événement <strong>${data.title}</strong> a commencé et vous pouvez maintenant voter pour vos favoris.</p>
            <p>${data.message}</p>
            ${data.data?.votingEnd ? `<p><em>Les votes se terminent le ${new Date(data.data.votingEnd).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}</em></p>` : ''}
            <a href="${baseUrl}/events/${data.data?.eventSlug || data.data?.eventId}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Voter maintenant</a>
          `,
          text: `Les votes sont ouverts pour ${data.title}. ${data.message}`,
        };

      case 'event_voting_ended':
        return {
          subject: `📊 Les résultats sont disponibles - ${data.title}`,
          html: `
            <h2>📊 Les votes sont terminés !</h2>
            <p>L'événement <strong>${data.title}</strong> est maintenant terminé et les résultats ${data.data?.resultsVisible ? 'sont disponibles' : 'seront bientôt disponibles'}.</p>
            <p>${data.message}</p>
            <a href="${baseUrl}/events/${data.data?.eventSlug || data.data?.eventId}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Voir ${data.data?.resultsVisible ? 'les résultats' : 'l\'événement'}</a>
          `,
          text: `Les votes sont terminés pour ${data.title}. ${data.message}`,
        };

      case 'related_content_added':
        const contentTypeLabels: Record<string, string> = {
          anime: 'anime',
          manga: 'manga',
          'jeu-video': 'jeu vidéo',
        };
        const typeLabel =
          contentTypeLabels[data.data?.contentType] || data.data?.contentType;
        const contentUrl = data.data?.url || '#';
        return {
          subject: `🔗 Nouveau contenu lié - ${data.title}`,
          html: `
            <h2>🔗 Un nouveau ${typeLabel} a été ajouté !</h2>
            <p><strong>${data.title}</strong> est maintenant disponible et lié à un contenu de vos favoris ou collection.</p>
            <p>${data.message}</p>
            <a href="${baseUrl}${contentUrl}" style="background-color: #6366f1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Découvrir</a>
          `,
          text: `Un nouveau ${typeLabel} "${data.title}" lié à vos favoris a été ajouté. ${data.message}`,
        };

      default:
        return {
          subject: data.title,
          html: `
            <h2>${data.title}</h2>
            <p>${data.message}</p>
          `,
          text: `${data.title}\n\n${data.message}`,
        };
    }
  }

  /**
   * Check for episodes released on a specific date and notify users who have them in their collection.
   * @param date Date to check for releases (defaults to today)
   */
  async checkAndNotifyReleasedEpisodes(date: Date = new Date()): Promise<{ episodesFound: number; notificationsSent: number }> {
    this.logger.log(`Checking episode releases for ${date.toISOString()}...`);
    let notificationsSent = 0;

    try {
      // 1. Get episodes released on the date
      const episodes: any[] = await this.episodesService.getEpisodesByDate(date);

      if (episodes.length === 0) {
        this.logger.log('No episodes released on this date.');
        return { episodesFound: 0, notificationsSent: 0 };
      }

      this.logger.log(`Found ${episodes.length} episodes released.`);

      for (const episode of episodes) {
        this.logger.log(`Processing episode: ${JSON.stringify({ idAnime: episode.idAnime, numero: episode.numero, anime: episode.anime ? episode.anime.titre : 'NO ANIME RELATION' })}`);

        if (!episode.anime) {
          this.logger.warn(`Episode ${episode.idEpisode} has no anime relation, skipping`);
          continue;
        }

        // 2. Find users who have this anime in their collection (capped)
        // Status 1 = Watching, 2 = Plan to Watch, 3 = On Hold
        let users: { idMembre: number }[] = [];
        try {
          users = await this.prisma.collectionAnime.findMany({
            where: {
              idAnime: episode.idAnime,
              type: { in: [1, 2, 3] }
            },
            select: { idMembre: true },
            take: MAX_USERS_PER_CONTENT,
          });
          this.logger.log(`Found ${users.length} users with anime ${episode.idAnime} (${episode.anime.titre}) in collection`);
        } catch (queryError) {
          this.logger.error(`Error querying users for anime ${episode.idAnime}: ${queryError.message}`);
          try {
            const rawUsers = await this.prisma.$queryRaw<{ id_membre: number }[]>`
              SELECT id_membre FROM collection_animes
              WHERE id_anime = ${episode.idAnime} AND type IN (1, 2, 3)
              LIMIT ${MAX_USERS_PER_CONTENT}
            `;
            users = rawUsers.map(u => ({ idMembre: u.id_membre }));
            this.logger.log(`Fallback raw query found ${users.length} users`);
          } catch (rawError) {
            this.logger.error(`Fallback raw query also failed: ${rawError.message}`);
          }
        }

        if (users.length === 0) continue;

        this.logger.log(`Notifying ${users.length} users for ${episode.anime.titre} episode ${episode.numero}`);

        // 3. Bulk insert notifications (single query instead of per-user)
        const userIds = users.map((u) => u.idMembre);
        const sent = await this.sendBulkNotifications(
          userIds,
          {
            type: 'episode_release',
            title: `Nouvel épisode : ${episode.anime.titre}`,
            message: `L'épisode ${episode.numero} de ${episode.anime.titre} est disponible !`,
            data: {
              animeId: episode.idAnime,
              animeSlug: episode.anime.niceUrl,
              episodeId: episode.idEpisode,
              episodeNum: episode.numero,
              image: episode.image || episode.anime.image,
            },
            priority: 'medium',
          },
          String(episode.idEpisode),
        );
        notificationsSent += sent;
      }

      this.logger.log(`Episode notifications check completed. Sent ${notificationsSent} notifications.`);
      return { episodesFound: episodes.length, notificationsSent };
    } catch (error) {
      this.logger.error(`Error checking episode releases: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check for manga volumes released on a specific date and notify users.
   */
  async checkAndNotifyReleasedVolumes(date: Date = new Date()): Promise<{ volumesFound: number; notificationsSent: number }> {
    this.logger.log(`Checking volume releases for ${date.toISOString()}...`);
    let notificationsSent = 0;

    try {
      // 1. Get volumes released on the date
      const volumes = await this.mangaVolumesService.getVolumesReleasedOn(date);

      if (volumes.length === 0) {
        this.logger.log('No volumes released on this date.');
        return { volumesFound: 0, notificationsSent: 0 };
      }

      this.logger.log(`Found ${volumes.length} volumes released.`);

      for (const volume of volumes) {
        if (!volume.manga) continue;

        // 2. Find users who have this manga in their collection (capped)
        // Status 1 = Reading, 2 = Plan to Read, 3 = On Hold
        let users: { idMembre: number }[] = [];
        try {
          users = await this.prisma.collectionManga.findMany({
            where: {
              idManga: volume.idManga,
              type: { in: [1, 2, 3] }
            },
            select: { idMembre: true },
            take: MAX_USERS_PER_CONTENT,
          });
        } catch (e) {
          this.logger.error(`Error querying users for manga ${volume.idManga}: ${e.message}`);
          continue;
        }

        if (users.length === 0) continue;

        this.logger.log(`Notifying ${users.length} users for ${volume.manga.titre} Volume ${volume.volumeNumber}`);

        // 3. Bulk insert notifications
        const userIds = users.map((u) => u.idMembre);
        const sent = await this.sendBulkNotifications(
          userIds,
          {
            type: 'volume_release',
            title: `Nouveau tome : ${volume.manga.titre}`,
            message: `Le volume ${volume.volumeNumber} de ${volume.manga.titre} est sorti !`,
            data: {
              mangaId: volume.idManga,
              mangaSlug: volume.manga.niceUrl,
              volumeId: volume.idVolume,
              volumeNum: volume.volumeNumber,
              image: volume.coverImage || volume.manga.image,
            },
            priority: 'medium',
          },
          String(volume.idVolume),
        );
        notificationsSent += sent;
      }

      return { volumesFound: volumes.length, notificationsSent };
    } catch (error) {
      this.logger.error(`Error checking volume releases: ${error.message}`);
      throw error;
    }
  }

  /**
   * Notify users when new content is added that is related to items in their favorites or collection.
   * @param newContent - The newly added/related content info
   * @param relatedTo - The existing content that the new content is related to
   */
  async notifyRelatedContent(
    newContent: { id: number; type: string; title: string; niceUrl: string },
    relatedTo: { id: number; type: string },
    notificationType: string = 'related_content_added',
  ): Promise<void> {
    try {
      // Get users who have the related content in their favorites
      const favoriteUsers = await this.getUsersWithFavorite(
        relatedTo.id,
        relatedTo.type,
      );

      // Get users who have the related content in their collection
      const collectionUsers = await this.getUsersWithCollection(
        relatedTo.id,
        relatedTo.type,
      );

      // Combine and deduplicate user IDs
      const allUserIds = new Set([...favoriteUsers, ...collectionUsers]);

      if (allUserIds.size === 0) {
        this.logger.debug(
          `No users to notify for related content: ${newContent.type} ${newContent.id}`,
        );
        return;
      }

      const contentTypeLabels: Record<string, string> = {
        anime: 'Un anime',
        manga: 'Un manga',
        'jeu-video': 'Un jeu vidéo',
      };

      const typeLabel =
        contentTypeLabels[newContent.type] || `Un ${newContent.type}`;

      // Bulk insert notifications
      const userIdsArray = Array.from(allUserIds).slice(0, MAX_USERS_PER_CONTENT);
      const sent = await this.sendBulkNotifications(
        userIdsArray,
        {
          type: notificationType as any,
          title: newContent.title,
          message: `${typeLabel} "${newContent.title}" lié à vos favoris a été ajouté.`,
          data: {
            contentId: newContent.id,
            contentType: newContent.type,
            url: newContent.niceUrl,
            relatedToId: relatedTo.id,
            relatedToType: relatedTo.type,
          },
          priority: 'low',
        },
      );

      this.logger.log(
        `Sent ${sent} related content notifications for ${newContent.type} ${newContent.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send related content notifications: ${error.message}`,
      );
    }
  }

  /**
   * Get user IDs who have the specified content in their favorites
   */
  private async getUsersWithFavorite(
    contentId: number,
    contentType: string,
  ): Promise<number[]> {
    try {
      let result: any[];

      if (contentType === 'anime') {
        result = await this.prisma.$queryRaw`
          SELECT DISTINCT user_id FROM ak_user_favorites
          WHERE anime_id = ${contentId} AND type = 'anime'
          LIMIT ${MAX_USERS_PER_CONTENT}
        `;
      } else if (contentType === 'manga') {
        result = await this.prisma.$queryRaw`
          SELECT DISTINCT user_id FROM ak_user_favorites
          WHERE manga_id = ${contentId} AND type = 'manga'
          LIMIT ${MAX_USERS_PER_CONTENT}
        `;
      } else if (contentType === 'jeu-video') {
        result = await this.prisma.$queryRaw`
          SELECT DISTINCT user_id FROM ak_user_favorites
          WHERE jeu_id = ${contentId} AND type = 'jeu-video'
          LIMIT ${MAX_USERS_PER_CONTENT}
        `;
      } else {
        return [];
      }

      return (result || []).map((row: any) => Number(row.user_id));
    } catch (error) {
      this.logger.warn(
        `Failed to get favorite users for ${contentType} ${contentId}: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Get user IDs who have the specified content in their collection
   */
  private async getUsersWithCollection(
    contentId: number,
    contentType: string,
  ): Promise<number[]> {
    try {
      let result: any[];

      if (contentType === 'anime') {
        result = await this.prisma.$queryRaw`
          SELECT DISTINCT id_membre FROM collection_animes
          WHERE id_anime = ${contentId}
          LIMIT ${MAX_USERS_PER_CONTENT}
        `;
        return (result || []).map((row: any) => Number(row.id_membre));
      } else if (contentType === 'manga') {
        result = await this.prisma.$queryRaw`
          SELECT DISTINCT id_membre FROM collection_mangas
          WHERE id_manga = ${contentId}
          LIMIT ${MAX_USERS_PER_CONTENT}
        `;
        return (result || []).map((row: any) => Number(row.id_membre));
      } else if (contentType === 'jeu-video') {
        result = await this.prisma.$queryRaw`
          SELECT DISTINCT id_membre FROM collection_jeuxvideo
          WHERE id_jeu = ${contentId}
          LIMIT ${MAX_USERS_PER_CONTENT}
        `;
        return (result || []).map((row: any) => Number(row.id_membre));
      } else {
        return [];
      }
    } catch (error) {
      this.logger.warn(
        `Failed to get collection users for ${contentType} ${contentId}: ${error.message}`,
      );
      return [];
    }
  }
}
