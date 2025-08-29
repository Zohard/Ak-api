import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

export interface NotificationPreferences {
  emailNewReview: boolean;
  emailNewAnime: boolean;
  emailNewManga: boolean;
  emailReviewModerated: boolean;
  emailSecurityAlerts: boolean;
  emailMarketing: boolean;
}

export interface NotificationData {
  userId: number;
  type:
    | 'new_review'
    | 'new_anime'
    | 'new_manga'
    | 'review_moderated'
    | 'security_alert'
    | 'marketing';
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
        await this.sendEmail(data);
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
          email_new_anime,
          email_new_manga,
          email_review_moderated,
          email_security_alerts,
          email_marketing
        FROM user_notification_preferences 
        WHERE user_id = ${userId}
      `;

      if (!preferences || (preferences as any[]).length === 0) {
        // Return default preferences if none exist
        return this.getDefaultPreferences();
      }

      const prefs = (preferences as any[])[0];
      return {
        emailNewReview: prefs.email_new_review || false,
        emailNewAnime: prefs.email_new_anime || false,
        emailNewManga: prefs.email_new_manga || false,
        emailReviewModerated: prefs.email_review_moderated || false,
        emailSecurityAlerts: prefs.email_security_alerts || true, // Default to true for security
        emailMarketing: prefs.email_marketing || false,
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
      await this.prisma.$executeRaw`
        INSERT INTO user_notification_preferences (
          user_id, 
          email_new_review, 
          email_new_anime, 
          email_new_manga,
          email_review_moderated,
          email_security_alerts,
          email_marketing,
          updated_at
        ) VALUES (
          ${userId},
          ${preferences.emailNewReview || false},
          ${preferences.emailNewAnime || false},
          ${preferences.emailNewManga || false},
          ${preferences.emailReviewModerated || false},
          ${preferences.emailSecurityAlerts !== undefined ? preferences.emailSecurityAlerts : true},
          ${preferences.emailMarketing || false},
          NOW()
        )
        ON CONFLICT (user_id) DO UPDATE SET
          email_new_review = EXCLUDED.email_new_review,
          email_new_anime = EXCLUDED.email_new_anime,
          email_new_manga = EXCLUDED.email_new_manga,
          email_review_moderated = EXCLUDED.email_review_moderated,
          email_security_alerts = EXCLUDED.email_security_alerts,
          email_marketing = EXCLUDED.email_marketing,
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

    const whereClause = unreadOnly
      ? `WHERE user_id = ${userId} AND read_at IS NULL`
      : `WHERE user_id = ${userId}`;

    const notifications = await this.prisma.$queryRaw`
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
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countResult = await this.prisma.$queryRaw`
      SELECT COUNT(*) as total
      FROM user_notifications 
      ${whereClause}
    `;

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
      emailNewReview: false,
      emailNewAnime: false,
      emailNewManga: false,
      emailReviewModerated: false,
      emailSecurityAlerts: true, // Security alerts should be enabled by default
      emailMarketing: false,
    };
  }

  private shouldSendNotification(
    type: string,
    preferences: NotificationPreferences,
  ): boolean {
    // Always send security alerts
    if (type === 'security_alert') return true;

    // Check user preferences for other types
    switch (type) {
      case 'new_review':
        return preferences.emailNewReview;
      case 'new_anime':
        return preferences.emailNewAnime;
      case 'new_manga':
        return preferences.emailNewManga;
      case 'review_moderated':
        return preferences.emailReviewModerated;
      case 'marketing':
        return preferences.emailMarketing;
      default:
        return false;
    }
  }

  private shouldSendEmail(
    type: string,
    preferences: NotificationPreferences,
  ): boolean {
    return this.shouldSendNotification(type, preferences);
  }

  private async storeNotification(data: NotificationData): Promise<void> {
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
        ${data.data ? JSON.stringify(data.data) : null},
        ${data.priority},
        NOW()
      )
    `;
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
}
