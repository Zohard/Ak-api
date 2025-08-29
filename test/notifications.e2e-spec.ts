import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/services/prisma.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { AdminGuard } from '../src/common/guards/admin.guard';

describe('Notifications E2E', () => {
  let app: INestApplication;
  let prismaService: PrismaService;

  const mockUser = { id: 123, username: 'testuser' };

  const mockJwtGuard = {
    canActivate: jest.fn(() => true),
  };

  const mockAdminGuard = {
    canActivate: jest.fn(() => true),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtGuard)
      .overrideGuard(AdminGuard)
      .useValue(mockAdminGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    prismaService = moduleFixture.get<PrismaService>(PrismaService);

    // Mock request.user
    app.use((req, res, next) => {
      req.user = mockUser;
      next();
    });

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('/api/notifications (GET)', () => {
    it('should get user notifications', () => {
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

      jest
        .spyOn(prismaService, '$queryRaw')
        .mockResolvedValueOnce(mockNotifications)
        .mockResolvedValueOnce(mockCount);

      return request(app.getHttpServer())
        .get('/api/notifications')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('notifications');
          expect(res.body).toHaveProperty('pagination');
          expect(res.body.notifications).toHaveLength(1);
          expect(res.body.pagination.totalItems).toBe(1);
        });
    });

    it('should support pagination', () => {
      jest.spyOn(prismaService, '$queryRaw').mockResolvedValue([]);

      return request(app.getHttpServer())
        .get('/api/notifications?page=2&limit=10')
        .expect(200);
    });

    it('should support unread filter', () => {
      jest.spyOn(prismaService, '$queryRaw').mockResolvedValue([]);

      return request(app.getHttpServer())
        .get('/api/notifications?unreadOnly=true')
        .expect(200);
    });

    it('should require authentication', () => {
      mockJwtGuard.canActivate.mockReturnValueOnce(false);

      return request(app.getHttpServer()).get('/api/notifications').expect(401);
    });
  });

  describe('/api/notifications/stats (GET)', () => {
    it('should get notification statistics', () => {
      const mockStats = [
        {
          total: 10,
          unread: 5,
          high_priority_unread: 2,
        },
      ];

      jest.spyOn(prismaService, '$queryRaw').mockResolvedValue(mockStats);

      return request(app.getHttpServer())
        .get('/api/notifications/stats')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('total', 10);
          expect(res.body).toHaveProperty('unread', 5);
          expect(res.body).toHaveProperty('highPriorityUnread', 2);
        });
    });
  });

  describe('/api/notifications/preferences (GET)', () => {
    it('should get user preferences', () => {
      const mockPreferences = [
        {
          email_new_review: true,
          email_new_anime: false,
          email_new_manga: true,
          email_review_moderated: false,
          email_security_alerts: true,
          email_marketing: false,
        },
      ];

      jest.spyOn(prismaService, '$queryRaw').mockResolvedValue(mockPreferences);

      return request(app.getHttpServer())
        .get('/api/notifications/preferences')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('emailNewReview', true);
          expect(res.body).toHaveProperty('emailSecurityAlerts', true);
          expect(res.body).toHaveProperty('emailMarketing', false);
        });
    });
  });

  describe('/api/notifications/preferences (PATCH)', () => {
    it('should update user preferences', () => {
      jest.spyOn(prismaService, '$executeRaw').mockResolvedValue(undefined);

      const updateData = {
        emailNewReview: true,
        emailNewAnime: false,
        emailMarketing: true,
      };

      return request(app.getHttpServer())
        .patch('/api/notifications/preferences')
        .send(updateData)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body).toHaveProperty('message');
        });
    });

    it('should validate preference data', () => {
      const invalidData = {
        emailNewReview: 'not-a-boolean',
      };

      return request(app.getHttpServer())
        .patch('/api/notifications/preferences')
        .send(invalidData)
        .expect(400);
    });
  });

  describe('/api/notifications/:id/read (PATCH)', () => {
    it('should mark notification as read', () => {
      jest.spyOn(prismaService, '$executeRaw').mockResolvedValue(undefined);

      return request(app.getHttpServer())
        .patch('/api/notifications/123/read')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
        });
    });

    it('should validate notification id', () => {
      return request(app.getHttpServer())
        .patch('/api/notifications/invalid/read')
        .expect(400);
    });
  });

  describe('/api/notifications/read-all (PATCH)', () => {
    it('should mark all notifications as read', () => {
      jest.spyOn(prismaService, '$executeRaw').mockResolvedValue(undefined);

      return request(app.getHttpServer())
        .patch('/api/notifications/read-all')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
        });
    });
  });

  describe('/api/notifications/send (POST)', () => {
    it('should send notification (admin only)', () => {
      const mockPreferences = [{ email_new_review: true }];
      const mockUser = [
        {
          email_address: 'user@example.com',
          member_name: 'TestUser',
        },
      ];

      jest
        .spyOn(prismaService, '$queryRaw')
        .mockResolvedValueOnce(mockPreferences)
        .mockResolvedValueOnce(mockUser);
      jest.spyOn(prismaService, '$executeRaw').mockResolvedValue(undefined);

      const notificationData = {
        userId: 456,
        type: 'new_review',
        title: 'New Review Available',
        message: 'A new review has been posted for Naruto',
        priority: 'medium',
        data: { reviewId: 789 },
      };

      return request(app.getHttpServer())
        .post('/api/notifications/send')
        .send(notificationData)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('success');
          expect(res.body).toHaveProperty('message');
        });
    });

    it('should require admin access', () => {
      mockAdminGuard.canActivate.mockReturnValueOnce(false);

      return request(app.getHttpServer())
        .post('/api/notifications/send')
        .expect(403);
    });

    it('should validate notification data', () => {
      const invalidData = {
        userId: 'not-a-number',
        type: 'invalid-type',
      };

      return request(app.getHttpServer())
        .post('/api/notifications/send')
        .send(invalidData)
        .expect(400);
    });
  });

  describe('/api/notifications/broadcast (POST)', () => {
    it('should broadcast notification to all users (admin only)', () => {
      const mockUsers = [{ id_member: 1 }, { id_member: 2 }, { id_member: 3 }];

      jest.spyOn(prismaService, '$queryRaw').mockResolvedValue(mockUsers);
      jest.spyOn(prismaService, '$executeRaw').mockResolvedValue(undefined);

      const broadcastData = {
        type: 'new_anime',
        title: 'New Anime Added',
        message: 'A new anime has been added to the database',
        priority: 'low',
        data: { animeId: 123 },
      };

      return request(app.getHttpServer())
        .post('/api/notifications/broadcast')
        .send(broadcastData)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('message', 'Broadcast completed');
          expect(res.body).toHaveProperty('totalUsers');
          expect(res.body).toHaveProperty('successCount');
          expect(res.body).toHaveProperty('failureCount');
        });
    });

    it('should require admin access', () => {
      mockAdminGuard.canActivate.mockReturnValueOnce(false);

      return request(app.getHttpServer())
        .post('/api/notifications/broadcast')
        .expect(403);
    });

    it('should validate broadcast data', () => {
      const invalidData = {
        type: 'invalid-broadcast-type',
        title: '',
      };

      return request(app.getHttpServer())
        .post('/api/notifications/broadcast')
        .send(invalidData)
        .expect(400);
    });
  });
});
