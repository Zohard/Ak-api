import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  NotificationsService,
  NotificationData,
} from './notifications.service';
import { PrismaService } from '../../shared/services/prisma.service';
import * as nodemailer from 'nodemailer';

jest.mock('nodemailer');

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prismaService: PrismaService;
  let configService: ConfigService;

  const mockTransporter = {
    sendMail: jest.fn(),
  };

  const mockPrismaService = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
      switch (key) {
        case 'SMTP_HOST':
          return 'localhost';
        case 'SMTP_PORT':
          return 587;
        case 'SMTP_USER':
          return 'test@example.com';
        case 'SMTP_PASS':
          return 'password';
        case 'SMTP_FROM':
          return 'noreply@anime-kun.com';
        case 'APP_URL':
          return 'http://localhost:3003';
        default:
          return defaultValue;
      }
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prismaService = module.get<PrismaService>(PrismaService);
    configService = module.get<ConfigService>(ConfigService);

    // Mock nodemailer
    (nodemailer.createTransport as jest.Mock).mockReturnValue(mockTransporter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendNotification', () => {
    const mockNotificationData: NotificationData = {
      userId: 123,
      type: 'new_review',
      title: 'New Review',
      message: 'A new review has been posted',
      priority: 'medium',
      data: { reviewId: 456 },
    };

    it('should send notification successfully', async () => {
      const mockPreferences = {
        emailNewReview: true,
        emailNewAnime: false,
        emailNewManga: false,
        emailReviewModerated: false,
        emailSecurityAlerts: true,
        emailMarketing: false,
      };

      const mockUser = [
        {
          email_address: 'user@example.com',
          member_name: 'TestUser',
        },
      ];

      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([{ email_new_review: true }])
        .mockResolvedValueOnce(mockUser);
      mockPrismaService.$executeRaw.mockResolvedValue(undefined);
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });

      const result = await service.sendNotification(mockNotificationData);

      expect(result).toBe(true);
      expect(mockPrismaService.$executeRaw).toHaveBeenCalledTimes(2); // Store notification + preferences
      expect(mockTransporter.sendMail).toHaveBeenCalled();
    });

    it('should not send email when user preferences block it', async () => {
      mockPrismaService.$queryRaw.mockResolvedValueOnce([
        { email_new_review: false },
      ]);
      mockPrismaService.$executeRaw.mockResolvedValue(undefined);

      const result = await service.sendNotification(mockNotificationData);

      expect(result).toBe(false);
      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
    });

    it('should handle security alerts regardless of preferences', async () => {
      const securityAlert: NotificationData = {
        userId: 123,
        type: 'security_alert',
        title: 'Security Alert',
        message: 'Suspicious login detected',
        priority: 'high',
      };

      const mockUser = [
        {
          email_address: 'user@example.com',
          member_name: 'TestUser',
        },
      ];

      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([{ email_security_alerts: false }])
        .mockResolvedValueOnce(mockUser);
      mockPrismaService.$executeRaw.mockResolvedValue(undefined);
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });

      const result = await service.sendNotification(securityAlert);

      expect(result).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalled();
    });

    it('should handle notification failure gracefully', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue(
        new Error('Database error'),
      );

      const result = await service.sendNotification(mockNotificationData);

      expect(result).toBe(false);
    });
  });

  describe('getUserPreferences', () => {
    it('should return user preferences', async () => {
      const mockDbPreferences = [
        {
          email_new_review: true,
          email_new_anime: false,
          email_new_manga: true,
          email_review_moderated: false,
          email_security_alerts: true,
          email_marketing: false,
        },
      ];

      mockPrismaService.$queryRaw.mockResolvedValue(mockDbPreferences);

      const result = await service.getUserPreferences(123);

      expect(result).toEqual({
        emailNewReview: true,
        emailNewAnime: false,
        emailNewManga: true,
        emailReviewModerated: false,
        emailSecurityAlerts: true,
        emailMarketing: false,
      });
    });

    it('should return default preferences when none exist', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const result = await service.getUserPreferences(123);

      expect(result).toEqual({
        emailNewReview: false,
        emailNewAnime: false,
        emailNewManga: false,
        emailReviewModerated: false,
        emailSecurityAlerts: true,
        emailMarketing: false,
      });
    });

    it('should handle database errors gracefully', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue(
        new Error('Database error'),
      );

      const result = await service.getUserPreferences(123);

      expect(result).toEqual({
        emailNewReview: false,
        emailNewAnime: false,
        emailNewManga: false,
        emailReviewModerated: false,
        emailSecurityAlerts: true,
        emailMarketing: false,
      });
    });
  });

  describe('updateUserPreferences', () => {
    it('should update user preferences successfully', async () => {
      const preferences = {
        emailNewReview: true,
        emailNewAnime: true,
      };

      mockPrismaService.$executeRaw.mockResolvedValue(undefined);

      const result = await service.updateUserPreferences(123, preferences);

      expect(result).toBe(true);
      expect(mockPrismaService.$executeRaw).toHaveBeenCalled();
    });

    it('should handle update failures', async () => {
      const preferences = {
        emailNewReview: true,
      };

      mockPrismaService.$executeRaw.mockRejectedValue(
        new Error('Database error'),
      );

      const result = await service.updateUserPreferences(123, preferences);

      expect(result).toBe(false);
    });
  });

  describe('getUserNotifications', () => {
    it('should return paginated user notifications', async () => {
      const mockNotifications = [
        {
          id: 1,
          type: 'new_review',
          title: 'New Review',
          message: 'A new review has been posted',
          data: '{"reviewId": 456}',
          priority: 'medium',
          read_at: null,
          created_at: new Date(),
        },
      ];

      const mockCount = [{ total: 1 }];

      mockPrismaService.$queryRaw
        .mockResolvedValueOnce(mockNotifications)
        .mockResolvedValueOnce(mockCount);

      const result = await service.getUserNotifications(123, 1, 20, false);

      expect(result).toEqual({
        notifications: mockNotifications,
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalItems: 1,
          hasNext: false,
          hasPrevious: false,
        },
      });
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      mockPrismaService.$executeRaw.mockResolvedValue(undefined);

      const result = await service.markAsRead(123, 456);

      expect(result).toBe(true);
      expect(mockPrismaService.$executeRaw).toHaveBeenCalled();
    });

    it('should handle mark as read failures', async () => {
      mockPrismaService.$executeRaw.mockRejectedValue(
        new Error('Database error'),
      );

      const result = await service.markAsRead(123, 456);

      expect(result).toBe(false);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', async () => {
      mockPrismaService.$executeRaw.mockResolvedValue(undefined);

      const result = await service.markAllAsRead(123);

      expect(result).toBe(true);
      expect(mockPrismaService.$executeRaw).toHaveBeenCalled();
    });
  });

  describe('getNotificationStats', () => {
    it('should return notification statistics', async () => {
      const mockStats = [
        {
          total: 10,
          unread: 5,
          high_priority_unread: 2,
        },
      ];

      mockPrismaService.$queryRaw.mockResolvedValue(mockStats);

      const result = await service.getNotificationStats(123);

      expect(result).toEqual({
        total: 10,
        unread: 5,
        highPriorityUnread: 2,
      });
    });

    it('should handle stats query failures', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue(
        new Error('Database error'),
      );

      const result = await service.getNotificationStats(123);

      expect(result).toEqual({
        total: 0,
        unread: 0,
        highPriorityUnread: 0,
      });
    });
  });

  describe('getEmailTemplate', () => {
    it('should generate email template for new review', () => {
      const notificationData: NotificationData = {
        userId: 123,
        type: 'new_review',
        title: 'Naruto',
        message: 'A new review has been posted',
        priority: 'medium',
        data: { reviewId: 456 },
      };

      const template = service['getEmailTemplate'](notificationData);

      expect(template.subject).toBe('Nouvelle critique ajoutée - Naruto');
      expect(template.html).toContain('Nouvelle critique disponible');
      expect(template.html).toContain('Naruto');
    });

    it('should generate email template for security alert', () => {
      const notificationData: NotificationData = {
        userId: 123,
        type: 'security_alert',
        title: 'Suspicious Login',
        message: 'Login from unknown location',
        priority: 'high',
      };

      const template = service['getEmailTemplate'](notificationData);

      expect(template.subject).toBe('Alerte de sécurité - Suspicious Login');
      expect(template.html).toContain('Alerte de sécurité');
      expect(template.html).toContain('#dc3545');
    });

    it('should generate default template for unknown type', () => {
      const notificationData: NotificationData = {
        userId: 123,
        type: 'unknown_type' as any,
        title: 'Test Title',
        message: 'Test message',
        priority: 'low',
      };

      const template = service['getEmailTemplate'](notificationData);

      expect(template.subject).toBe('Test Title');
      expect(template.html).toContain('Test Title');
      expect(template.text).toBe('Test Title\n\nTest message');
    });
  });
});
