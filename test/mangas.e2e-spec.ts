import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/services/prisma.service';

describe('Mangas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));

    prisma = moduleFixture.get<PrismaService>(PrismaService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/mangas (GET)', () => {
    it('should return paginated list of mangas', () => {
      return request(app.getHttpServer())
        .get('/mangas')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('mangas');
          expect(res.body).toHaveProperty('pagination');
          expect(Array.isArray(res.body.mangas)).toBe(true);
          expect(res.body.pagination).toHaveProperty('page');
          expect(res.body.pagination).toHaveProperty('limit');
          expect(res.body.pagination).toHaveProperty('total');
          expect(res.body.pagination).toHaveProperty('totalPages');
        });
    });

    it('should accept search parameter', () => {
      return request(app.getHttpServer())
        .get('/mangas?search=one')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('mangas');
        });
    });

    it('should accept author filter', () => {
      return request(app.getHttpServer())
        .get('/mangas?auteur=oda')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('mangas');
        });
    });
  });

  describe('/mangas/top (GET)', () => {
    it('should return top rated mangas', () => {
      return request(app.getHttpServer())
        .get('/mangas/top')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('topMangas');
          expect(res.body).toHaveProperty('generatedAt');
          expect(Array.isArray(res.body.topMangas)).toBe(true);
        });
    });
  });

  describe('/mangas/random (GET)', () => {
    it('should return a random manga or 404 if none available', async () => {
      const response = await request(app.getHttpServer()).get('/mangas/random');

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('titre');
      }
    });
  });

  describe('/mangas/genres (GET)', () => {
    it('should return list of available genres', () => {
      return request(app.getHttpServer())
        .get('/mangas/genres')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('genres');
          expect(res.body).toHaveProperty('count');
          expect(Array.isArray(res.body.genres)).toBe(true);
        });
    });
  });

  describe('/mangas/genre/:genre (GET)', () => {
    it('should return mangas for a specific genre', () => {
      return request(app.getHttpServer())
        .get('/mangas/genre/aventure')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('genre');
          expect(res.body).toHaveProperty('mangas');
          expect(res.body).toHaveProperty('count');
          expect(res.body.genre).toBe('aventure');
          expect(Array.isArray(res.body.mangas)).toBe(true);
        });
    });
  });

  describe('/mangas/autocomplete (GET)', () => {
    it('should return autocomplete results', () => {
      return request(app.getHttpServer())
        .get('/mangas/autocomplete?q=na')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    it('should return empty results for short queries', () => {
      return request(app.getHttpServer())
        .get('/mangas/autocomplete?q=a')
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toEqual([]);
        });
    });
  });

  describe('/mangas/:id/tags (GET)', () => {
    it('should return tags for manga if exists', async () => {
      // First get a manga ID from the list
      const listResponse = await request(app.getHttpServer()).get(
        '/mangas?limit=1',
      );

      if (listResponse.body.mangas && listResponse.body.mangas.length > 0) {
        const mangaId = listResponse.body.mangas[0].id;

        return request(app.getHttpServer())
          .get(`/mangas/${mangaId}/tags`)
          .expect(200)
          .expect((res) => {
            expect(res.body).toHaveProperty('manga_id');
            expect(res.body).toHaveProperty('tags');
            expect(res.body.manga_id).toBe(mangaId);
            expect(Array.isArray(res.body.tags)).toBe(true);
          });
      }
    });

    it('should return 404 for non-existent manga', () => {
      return request(app.getHttpServer())
        .get('/mangas/999999/tags')
        .expect(404);
    });
  });
});
