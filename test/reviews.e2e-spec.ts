import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/shared/services/prisma.service';

describe('Reviews (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/reviews (GET)', () => {
    it('should return reviews list with pagination', () => {
      return request(app.getHttpServer())
        .get('/reviews')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('reviews');
          expect(res.body).toHaveProperty('pagination');
          expect(res.body.pagination).toHaveProperty('page');
          expect(res.body.pagination).toHaveProperty('limit');
          expect(res.body.pagination).toHaveProperty('total');
          expect(res.body.pagination).toHaveProperty('totalPages');
        });
    });

    it('should accept page and limit parameters', () => {
      return request(app.getHttpServer())
        .get('/reviews?page=1&limit=5')
        .expect(200)
        .expect((res) => {
          expect(res.body.pagination.page).toBe(1);
          expect(res.body.pagination.limit).toBe(5);
        });
    });

    it('should filter by anime ID', () => {
      return request(app.getHttpServer()).get('/reviews?idAnime=1').expect(200);
    });

    it('should filter by manga ID', () => {
      return request(app.getHttpServer()).get('/reviews?idManga=1').expect(200);
    });

    it('should search in reviews', () => {
      return request(app.getHttpServer())
        .get('/reviews?search=test')
        .expect(200);
    });
  });

  describe('/reviews/top (GET)', () => {
    it('should return top reviews', () => {
      return request(app.getHttpServer())
        .get('/reviews/top')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('topReviews');
          expect(res.body).toHaveProperty('generatedAt');
        });
    });

    it('should accept limit parameter', () => {
      return request(app.getHttpServer())
        .get('/reviews/top?limit=5')
        .expect(200);
    });
  });

  describe('/reviews/user/:userId (GET)', () => {
    it('should return user reviews', () => {
      return request(app.getHttpServer())
        .get('/reviews/user/1')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('reviews');
          expect(res.body).toHaveProperty('total');
        });
    });

    it('should accept limit parameter', () => {
      return request(app.getHttpServer())
        .get('/reviews/user/1?limit=10')
        .expect(200);
    });
  });

  describe('/reviews (POST) - Auth required', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer())
        .post('/reviews')
        .send({
          titre: 'Test Review',
          critique: 'This is a test review content',
          notation: 8,
          idAnime: 1,
        })
        .expect(401);
    });
  });

  describe('/reviews/my-reviews (GET) - Auth required', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer())
        .get('/reviews/my-reviews')
        .expect(401);
    });
  });

  describe('/reviews/:id (GET)', () => {
    it('should return 404 for non-existent review', () => {
      return request(app.getHttpServer()).get('/reviews/999999').expect(404);
    });
  });

  describe('/reviews/:id (PATCH) - Auth required', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer())
        .patch('/reviews/1')
        .send({
          titre: 'Updated Review Title',
        })
        .expect(401);
    });
  });

  describe('/reviews/:id (DELETE) - Auth required', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer()).delete('/reviews/1').expect(401);
    });
  });

  describe('/reviews/:id/validate (PATCH) - Admin required', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer())
        .patch('/reviews/1/validate')
        .expect(401);
    });
  });

  describe('/reviews/:id/reject (PATCH) - Admin required', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer())
        .patch('/reviews/1/reject')
        .expect(401);
    });
  });

  describe('Integration with Animes and Mangas', () => {
    it('should return anime information in review details', async () => {
      // This test would need actual data or mocking
      // For now, just test the endpoint structure
      const response = await request(app.getHttpServer())
        .get('/reviews')
        .expect(200);

      if (response.body.reviews.length > 0) {
        const reviewWithAnime = response.body.reviews.find(
          (r: any) => r.animeId,
        );
        if (reviewWithAnime) {
          expect(reviewWithAnime).toHaveProperty('anime');
        }
      }
    });

    it('should return manga information in review details', async () => {
      // This test would need actual data or mocking
      // For now, just test the endpoint structure
      const response = await request(app.getHttpServer())
        .get('/reviews')
        .expect(200);

      if (response.body.reviews.length > 0) {
        const reviewWithManga = response.body.reviews.find(
          (r: any) => r.mangaId,
        );
        if (reviewWithManga) {
          expect(reviewWithManga).toHaveProperty('manga');
        }
      }
    });
  });
});
