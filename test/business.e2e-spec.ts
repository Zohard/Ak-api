import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/services/prisma.service';

describe('Business (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authToken: string;
  let testBusinessId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));

    prisma = moduleFixture.get<PrismaService>(PrismaService);

    await app.init();

    // Note: In a real test environment, you would create a test admin user
    // and get an auth token here. For now, we'll skip auth tests.
  });

  afterAll(async () => {
    // Clean up test data
    if (testBusinessId) {
      await prisma.akBusiness.deleteMany({
        where: { denomination: { contains: 'Test Business' } },
      });
    }

    await app.close();
  });

  describe('/business/search (GET)', () => {
    it('should return business search results (no auth required)', () => {
      return request(app.getHttpServer())
        .get('/business/search?q=test')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    it('should return empty results for empty query', () => {
      return request(app.getHttpServer())
        .get('/business/search?q=')
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toEqual([]);
        });
    });

    it('should accept limit parameter', () => {
      return request(app.getHttpServer())
        .get('/business/search?q=test&limit=5')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(Array.isArray(res.body.data)).toBe(true);
          expect(res.body.data.length).toBeLessThanOrEqual(5);
        });
    });

    it('should validate limit parameter bounds', () => {
      return request(app.getHttpServer())
        .get('/business/search?q=test&limit=200')
        .expect(400);
    });
  });

  // Note: The following tests require admin authentication
  // In a complete test suite, you would implement proper auth setup

  describe('/business (GET) - Admin only', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer()).get('/business').expect(401);
    });

    // TODO: Add authenticated tests when auth system is fully implemented
    /*
    it('should return paginated business data for admin', () => {
      return request(app.getHttpServer())
        .get('/business')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('pagination');
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });
    */
  });

  describe('/business/analytics (GET) - Admin only', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer())
        .get('/business/analytics')
        .expect(401);
    });

    // TODO: Add authenticated tests
    /*
    it('should return business analytics for admin', () => {
      return request(app.getHttpServer())
        .get('/business/analytics')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('analytics');
          expect(res.body).toHaveProperty('details');
          expect(res.body.analytics).toHaveProperty('totalRevenue');
          expect(res.body.analytics).toHaveProperty('totalCost');
          expect(res.body.analytics).toHaveProperty('totalProfit');
          expect(res.body.analytics).toHaveProperty('averageMargin');
          expect(res.body.analytics).toHaveProperty('count');
        });
    });
    */
  });

  describe('/business (POST) - Admin only', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer())
        .post('/business')
        .send({
          idAnime: 1,
          annee: 2023,
          prixTotal: 1000000,
          coutRevient: 800000,
          benefice: 200000,
        })
        .expect(401);
    });

    // TODO: Add authenticated tests
    /*
    it('should create business data for admin', () => {
      return request(app.getHttpServer())
        .post('/business')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          idAnime: 1,
          annee: 2023,
          prixTotal: 1000000,
          coutRevient: 800000,
          benefice: 200000,
          denomination: 'Test Business Entity',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.margePercentage).toBe(25); // (1000000-800000)/800000 * 100
          testBusinessId = res.body.id;
        });
    });

    it('should validate required fields', () => {
      return request(app.getHttpServer())
        .post('/business')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          prixTotal: 1000000,
        })
        .expect(400);
    });
    */
  });

  describe('/business/:id (GET) - Admin only', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer()).get('/business/1').expect(401);
    });

    // TODO: Add authenticated tests
    /*
    it('should return business data by ID for admin', async () => {
      if (testBusinessId) {
        return request(app.getHttpServer())
          .get(`/business/${testBusinessId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200)
          .expect((res) => {
            expect(res.body).toHaveProperty('id');
            expect(res.body.id).toBe(testBusinessId);
          });
      }
    });

    it('should return 404 for non-existent business', () => {
      return request(app.getHttpServer())
        .get('/business/999999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
    */
  });

  describe('/business/:id (PATCH) - Admin only', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer())
        .patch('/business/1')
        .send({ prixTotal: 1200000 })
        .expect(401);
    });

    // TODO: Add authenticated tests
  });

  describe('/business/:id (DELETE) - Admin only', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer()).delete('/business/1').expect(401);
    });

    // TODO: Add authenticated tests
  });

  describe('Integration with Animes', () => {
    it('should return business data when querying anime business endpoint', async () => {
      // First get an anime ID
      const animeResponse = await request(app.getHttpServer()).get(
        '/animes?limit=1',
      );

      if (animeResponse.body.animes && animeResponse.body.animes.length > 0) {
        const animeId = animeResponse.body.animes[0].id;

        return request(app.getHttpServer())
          .get(`/animes/${animeId}/business`)
          .expect(200)
          .expect((res) => {
            expect(res.body).toHaveProperty('anime_id');
            expect(res.body).toHaveProperty('business_data');
            expect(res.body.anime_id).toBe(animeId);
            expect(Array.isArray(res.body.business_data)).toBe(true);
          });
      }
    });
  });
});
