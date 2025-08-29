import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/services/prisma.service';

describe('Animes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authToken: string;
  let testAnimeId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));

    prisma = moduleFixture.get<PrismaService>(PrismaService);

    await app.init();

    // Create test user and get auth token (assuming auth system is implemented)
    // This would typically involve creating a test user and logging in
    // For now, we'll skip authentication tests
  });

  afterAll(async () => {
    // Clean up test data
    if (testAnimeId) {
      await prisma.akAnime.deleteMany({
        where: { titre: { contains: 'Test Anime' } },
      });
    }

    await app.close();
  });

  describe('/animes (GET)', () => {
    it('should return paginated list of animes', () => {
      return request(app.getHttpServer())
        .get('/animes')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('animes');
          expect(res.body).toHaveProperty('pagination');
          expect(Array.isArray(res.body.animes)).toBe(true);
          expect(res.body.pagination).toHaveProperty('page');
          expect(res.body.pagination).toHaveProperty('limit');
          expect(res.body.pagination).toHaveProperty('total');
          expect(res.body.pagination).toHaveProperty('totalPages');
        });
    });

    it('should accept pagination parameters', () => {
      return request(app.getHttpServer())
        .get('/animes?page=1&limit=5')
        .expect(200)
        .expect((res) => {
          expect(res.body.pagination.page).toBe(1);
          expect(res.body.pagination.limit).toBe(5);
          expect(res.body.animes.length).toBeLessThanOrEqual(5);
        });
    });

    it('should accept search parameter', () => {
      return request(app.getHttpServer())
        .get('/animes?search=naruto')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('animes');
          // All returned animes should contain 'naruto' in title or synopsis
          if (res.body.animes.length > 0) {
            res.body.animes.forEach((anime) => {
              const titleMatch = anime.titre.toLowerCase().includes('naruto');
              const synopsisMatch =
                anime.synopsis &&
                anime.synopsis.toLowerCase().includes('naruto');
              expect(titleMatch || synopsisMatch).toBe(true);
            });
          }
        });
    });

    it('should accept genre filter', () => {
      return request(app.getHttpServer())
        .get('/animes?genre=action')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('animes');
        });
    });

    it('should validate pagination limits', () => {
      return request(app.getHttpServer())
        .get('/animes?page=0&limit=200')
        .expect(400);
    });
  });

  describe('/animes/top (GET)', () => {
    it('should return top rated animes', () => {
      return request(app.getHttpServer())
        .get('/animes/top')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('topAnimes');
          expect(res.body).toHaveProperty('generatedAt');
          expect(Array.isArray(res.body.topAnimes)).toBe(true);
        });
    });

    it('should accept limit parameter', () => {
      return request(app.getHttpServer())
        .get('/animes/top?limit=5')
        .expect(200)
        .expect((res) => {
          expect(res.body.topAnimes.length).toBeLessThanOrEqual(5);
        });
    });
  });

  describe('/animes/random (GET)', () => {
    it('should return a random anime or 404 if none available', async () => {
      const response = await request(app.getHttpServer()).get('/animes/random');

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('titre');
      }
    });
  });

  describe('/animes/genres (GET)', () => {
    it('should return list of available genres', () => {
      return request(app.getHttpServer())
        .get('/animes/genres')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('genres');
          expect(res.body).toHaveProperty('count');
          expect(Array.isArray(res.body.genres)).toBe(true);
        });
    });
  });

  describe('/animes/genre/:genre (GET)', () => {
    it('should return animes for a specific genre', () => {
      return request(app.getHttpServer())
        .get('/animes/genre/action')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('genre');
          expect(res.body).toHaveProperty('animes');
          expect(res.body).toHaveProperty('count');
          expect(res.body.genre).toBe('action');
          expect(Array.isArray(res.body.animes)).toBe(true);
        });
    });
  });

  describe('/animes/autocomplete (GET)', () => {
    it('should return autocomplete results', () => {
      return request(app.getHttpServer())
        .get('/animes/autocomplete?q=na')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    it('should return empty results for short queries', () => {
      return request(app.getHttpServer())
        .get('/animes/autocomplete?q=a')
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toEqual([]);
        });
    });

    it('should exclude specified IDs', () => {
      return request(app.getHttpServer())
        .get('/animes/autocomplete?q=na&exclude=1,2,3&limit=10')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          // Verify excluded IDs are not in results
          res.body.data.forEach((anime) => {
            expect([1, 2, 3]).not.toContain(anime.id_anime);
          });
        });
    });
  });

  describe('/animes/:id (GET)', () => {
    it('should return anime details for valid ID', async () => {
      // First get an anime ID from the list
      const listResponse = await request(app.getHttpServer()).get(
        '/animes?limit=1',
      );

      if (listResponse.body.animes.length > 0) {
        const animeId = listResponse.body.animes[0].id;

        return request(app.getHttpServer())
          .get(`/animes/${animeId}`)
          .expect(200)
          .expect((res) => {
            expect(res.body).toHaveProperty('id');
            expect(res.body).toHaveProperty('titre');
            expect(res.body.id).toBe(animeId);
          });
      }
    });

    it('should return 404 for non-existent anime', () => {
      return request(app.getHttpServer()).get('/animes/999999').expect(404);
    });

    it('should include reviews when requested', async () => {
      // Get an anime ID first
      const listResponse = await request(app.getHttpServer()).get(
        '/animes?limit=1',
      );

      if (listResponse.body.animes.length > 0) {
        const animeId = listResponse.body.animes[0].id;

        return request(app.getHttpServer())
          .get(`/animes/${animeId}?includeReviews=true`)
          .expect(200)
          .expect((res) => {
            expect(res.body).toHaveProperty('reviews');
            expect(Array.isArray(res.body.reviews)).toBe(true);
          });
      }
    });
  });

  describe('/animes/:id/business (GET)', () => {
    it('should return business information for anime', async () => {
      // Get an anime ID first
      const listResponse = await request(app.getHttpServer()).get(
        '/animes?limit=1',
      );

      if (listResponse.body.animes.length > 0) {
        const animeId = listResponse.body.animes[0].id;

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

    it('should return 404 for non-existent anime', () => {
      return request(app.getHttpServer())
        .get('/animes/999999/business')
        .expect(404);
    });
  });

  describe('/animes/:id/tags (GET)', () => {
    it('should return tags for anime', async () => {
      // Get an anime ID first
      const listResponse = await request(app.getHttpServer()).get(
        '/animes?limit=1',
      );

      if (listResponse.body.animes.length > 0) {
        const animeId = listResponse.body.animes[0].id;

        return request(app.getHttpServer())
          .get(`/animes/${animeId}/tags`)
          .expect(200)
          .expect((res) => {
            expect(res.body).toHaveProperty('anime_id');
            expect(res.body).toHaveProperty('tags');
            expect(res.body.anime_id).toBe(animeId);
            expect(Array.isArray(res.body.tags)).toBe(true);
          });
      }
    });

    it('should return 404 for non-existent anime', () => {
      return request(app.getHttpServer())
        .get('/animes/999999/tags')
        .expect(404);
    });
  });

  describe('/animes/:id/relations (GET)', () => {
    it('should return relations for anime', async () => {
      // Get an anime ID first
      const listResponse = await request(app.getHttpServer()).get(
        '/animes?limit=1',
      );

      if (listResponse.body.animes.length > 0) {
        const animeId = listResponse.body.animes[0].id;

        return request(app.getHttpServer())
          .get(`/animes/${animeId}/relations`)
          .expect(200)
          .expect((res) => {
            expect(res.body).toHaveProperty('anime_id');
            expect(res.body).toHaveProperty('relations');
            expect(res.body.anime_id).toBe(animeId);
            expect(Array.isArray(res.body.relations)).toBe(true);
          });
      }
    });

    it('should return 404 for non-existent anime', () => {
      return request(app.getHttpServer())
        .get('/animes/999999/relations')
        .expect(404);
    });
  });

  // TODO: Add authenticated endpoint tests when auth is fully implemented
  // These would test:
  // - POST /animes (create)
  // - PATCH /animes/:id (update)
  // - DELETE /animes/:id (delete)
});
