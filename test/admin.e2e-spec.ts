import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/config/database.config';

describe('Admin Module (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let regularUserToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();

    // Create test users and get tokens
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  describe('Admin Dashboard', () => {
    it('/admin/dashboard (GET) - should return dashboard stats for admin', () => {
      return request(app.getHttpServer())
        .get('/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('users');
          expect(res.body).toHaveProperty('content');
          expect(res.body).toHaveProperty('moderation');
          expect(res.body).toHaveProperty('recent_activity');
          expect(res.body).toHaveProperty('system_health');

          expect(res.body.users).toHaveProperty('total_users');
          expect(res.body.content).toHaveProperty('active_animes');
          expect(res.body.moderation).toHaveProperty('pending_reviews');
        });
    });

    it('/admin/dashboard (GET) - should deny access for regular users', () => {
      return request(app.getHttpServer())
        .get('/admin/dashboard')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403);
    });

    it('/admin/dashboard (GET) - should deny access without token', () => {
      return request(app.getHttpServer()).get('/admin/dashboard').expect(401);
    });
  });

  describe('Admin Users Management', () => {
    let testUserId: number;

    it('/admin/users (GET) - should return paginated users list', () => {
      return request(app.getHttpServer())
        .get('/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 1, limit: 10 })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('users');
          expect(res.body).toHaveProperty('pagination');
          expect(Array.isArray(res.body.users)).toBe(true);
          expect(res.body.pagination).toHaveProperty('currentPage');
          expect(res.body.pagination).toHaveProperty('totalPages');
        });
    });

    it('/admin/users (GET) - should filter users by search term', () => {
      return request(app.getHttpServer())
        .get('/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ search: 'test' })
        .expect(200);
    });

    it('/admin/users/stats (GET) - should return user statistics', () => {
      return request(app.getHttpServer())
        .get('/admin/users/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('total_users');
          expect(res.body).toHaveProperty('active_users');
          expect(res.body).toHaveProperty('banned_users');
        });
    });

    it('/admin/users/:id (GET) - should return user details', async () => {
      // First get a user ID from the users list
      const usersResponse = await request(app.getHttpServer())
        .get('/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ limit: 1 });

      if (usersResponse.body.users.length > 0) {
        testUserId = usersResponse.body.users[0].id_member;

        return request(app.getHttpServer())
          .get(`/admin/users/${testUserId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200)
          .expect((res) => {
            expect(res.body).toHaveProperty('user');
            expect(res.body).toHaveProperty('recent_activity');
            expect(res.body.user).toHaveProperty('id_member', testUserId);
          });
      }
    });

    it('/admin/users/:id (PUT) - should update user details', async () => {
      if (testUserId) {
        return request(app.getHttpServer())
          .put(`/admin/users/${testUserId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            real_name: 'Updated Test User',
            bio: 'Updated bio for testing',
          })
          .expect(200);
      }
    });

    it('/admin/users/:id/ban (POST) - should ban a user', async () => {
      if (testUserId) {
        return request(app.getHttpServer())
          .post(`/admin/users/${testUserId}/ban`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            reason: 'Test ban reason',
          })
          .expect(200)
          .expect((res) => {
            expect(res.body).toHaveProperty('message');
          });
      }
    });

    it('/admin/users/:id/unban (POST) - should unban a user', async () => {
      if (testUserId) {
        return request(app.getHttpServer())
          .post(`/admin/users/${testUserId}/unban`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200)
          .expect((res) => {
            expect(res.body).toHaveProperty('message');
          });
      }
    });
  });

  describe('Admin Content Management', () => {
    let testAnimeId: number;

    it('/admin/content (GET) - should return paginated content list', () => {
      return request(app.getHttpServer())
        .get('/admin/content')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 1, limit: 10 })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('content');
          expect(res.body).toHaveProperty('pagination');
          expect(Array.isArray(res.body.content)).toBe(true);
        });
    });

    it('/admin/content/stats (GET) - should return content statistics', () => {
      return request(app.getHttpServer())
        .get('/admin/content/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('active_animes');
          expect(res.body).toHaveProperty('active_mangas');
          expect(res.body).toHaveProperty('pending_reviews');
        });
    });

    it('/admin/content (GET) - should filter content by type', () => {
      return request(app.getHttpServer())
        .get('/admin/content')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ type: 'anime' })
        .expect(200);
    });

    it('/admin/content/anime/:id (GET) - should return anime details', async () => {
      // First get an anime ID
      const contentResponse = await request(app.getHttpServer())
        .get('/admin/content')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ type: 'anime', limit: 1 });

      if (contentResponse.body.content.length > 0) {
        testAnimeId = contentResponse.body.content[0].id;

        return request(app.getHttpServer())
          .get(`/admin/content/anime/${testAnimeId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200)
          .expect((res) => {
            expect(res.body).toHaveProperty('id', testAnimeId);
            expect(res.body).toHaveProperty('titre');
          });
      }
    });

    it('/admin/content/bulk-action (POST) - should perform bulk actions', () => {
      return request(app.getHttpServer())
        .post('/admin/content/bulk-action')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ids: [1, 2, 3],
          action: 'activate',
          contentType: 'anime',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('message');
          expect(res.body).toHaveProperty('results');
          expect(Array.isArray(res.body.results)).toBe(true);
        });
    });
  });

  describe('Admin Moderation', () => {
    it('/admin/moderation/queue (GET) - should return moderation queue', () => {
      return request(app.getHttpServer())
        .get('/admin/moderation/queue')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('reviews');
          expect(res.body).toHaveProperty('pagination');
          expect(Array.isArray(res.body.reviews)).toBe(true);
        });
    });

    it('/admin/moderation/stats (GET) - should return moderation statistics', () => {
      return request(app.getHttpServer())
        .get('/admin/moderation/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('pending_reviews');
          expect(res.body).toHaveProperty('approved_reviews');
          expect(res.body).toHaveProperty('rejected_reviews');
        });
    });

    it('/admin/moderation/reports (GET) - should return moderation reports', () => {
      return request(app.getHttpServer())
        .get('/admin/moderation/reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('reports');
          expect(res.body).toHaveProperty('pagination');
          expect(Array.isArray(res.body.reports)).toBe(true);
        });
    });

    it('/admin/moderation/reports (POST) - should create a content report', () => {
      return request(app.getHttpServer())
        .post('/admin/moderation/reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          contentType: 'anime',
          contentId: 1,
          reason: 'inappropriate_content',
          details: 'Test report for inappropriate content',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('message');
        });
    });

    it('/admin/moderation/reviews/bulk-moderate (POST) - should perform bulk moderation', () => {
      return request(app.getHttpServer())
        .post('/admin/moderation/reviews/bulk-moderate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reviewIds: [1, 2, 3],
          action: 'approve',
          reason: 'Bulk approval for testing',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('message');
          expect(res.body).toHaveProperty('results');
        });
    });
  });

  describe('System Administration', () => {
    it('/admin/system/health (GET) - should return system health status', () => {
      return request(app.getHttpServer())
        .get('/admin/system/health')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('database');
          expect(res.body).toHaveProperty('storage');
          expect(res.body).toHaveProperty('performance');
          expect(res.body).toHaveProperty('status');
        });
    });

    it('/admin/activity (GET) - should return recent activity', () => {
      return request(app.getHttpServer())
        .get('/admin/activity')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ limit: 20 })
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('/admin/settings (GET) - should return system settings', () => {
      return request(app.getHttpServer())
        .get('/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('site_name');
          expect(res.body).toHaveProperty('maintenance_mode');
          expect(res.body).toHaveProperty('registration_enabled');
        });
    });

    it('/admin/settings (PUT) - should update system settings', () => {
      return request(app.getHttpServer())
        .put('/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          site_name: 'Anime-Kun Test',
          maintenance_mode: false,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('message');
          expect(res.body).toHaveProperty('updated_settings');
        });
    });

    it('/admin/export (POST) - should initiate data export', () => {
      return request(app.getHttpServer())
        .post('/admin/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'users',
          format: 'csv',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('message');
          expect(res.body).toHaveProperty('export_id');
          expect(res.body).toHaveProperty('estimated_completion');
        });
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent user', () => {
      return request(app.getHttpServer())
        .get('/admin/users/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('should return 400 for invalid bulk action', () => {
      return request(app.getHttpServer())
        .post('/admin/content/bulk-action')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ids: [],
          action: 'invalid_action',
          contentType: 'anime',
        })
        .expect(400);
    });

    it('should validate DTO constraints', () => {
      return request(app.getHttpServer())
        .post('/admin/moderation/reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          contentType: 'invalid_type',
          contentId: 'not_a_number',
          reason: '',
        })
        .expect(400);
    });
  });

  // Helper functions
  async function setupTestData() {
    // Create test admin user and get token
    const adminLoginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        member_name: 'admin_test',
        password: 'admin_password',
      });

    if (adminLoginResponse.status === 200) {
      adminToken = adminLoginResponse.body.access_token;
    } else {
      // Create admin user if login fails
      await createTestAdmin();
      const retryLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          member_name: 'admin_test',
          password: 'admin_password',
        });
      adminToken = retryLogin.body.access_token;
    }

    // Create regular user and get token
    const userLoginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        member_name: 'regular_test',
        password: 'user_password',
      });

    if (userLoginResponse.status === 200) {
      regularUserToken = userLoginResponse.body.access_token;
    } else {
      await createTestUser();
      const retryLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          member_name: 'regular_test',
          password: 'user_password',
        });
      regularUserToken = retryLogin.body.access_token;
    }
  }

  async function createTestAdmin() {
    await prisma.$queryRaw`
      INSERT INTO smf_members (
        member_name, 
        real_name, 
        email_address, 
        passwd, 
        id_group,
        date_registered,
        is_activated
      ) VALUES (
        'admin_test',
        'Admin Test User',
        'admin@test.com',
        '$2b$10$hash', -- This should be properly hashed
        1, -- Admin group
        ${Math.floor(Date.now() / 1000)},
        1
      ) ON CONFLICT (member_name) DO NOTHING
    `;
  }

  async function createTestUser() {
    await prisma.$queryRaw`
      INSERT INTO smf_members (
        member_name, 
        real_name, 
        email_address, 
        passwd, 
        id_group,
        date_registered,
        is_activated
      ) VALUES (
        'regular_test',
        'Regular Test User',
        'user@test.com',
        '$2b$10$hash', -- This should be properly hashed
        0, -- Regular user group
        ${Math.floor(Date.now() / 1000)},
        1
      ) ON CONFLICT (member_name) DO NOTHING
    `;
  }

  async function cleanupTestData() {
    // Clean up test data
    await prisma.$queryRaw`
      DELETE FROM smf_members 
      WHERE member_name IN ('admin_test', 'regular_test')
    `;
  }
});
