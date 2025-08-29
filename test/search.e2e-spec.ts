import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/services/prisma.service';

describe('Search E2E', () => {
  let app: INestApplication;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prismaService = moduleFixture.get<PrismaService>(PrismaService);

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('/api/search (GET)', () => {
    it('should perform basic search', () => {
      const mockAnimes = [
        {
          id_anime: 1,
          nom_anime: 'Naruto',
          synopsis_anime: 'A ninja story',
          note_anime: 8.5,
          genre_anime: 'Action',
          statut_anime: 'Completed',
          created_at: new Date(),
        },
      ];

      const mockMangas = [
        {
          id_manga: 1,
          nom_manga: 'Naruto Manga',
          synopsis_manga: 'The original manga',
          note_manga: 9.0,
          genre_manga: 'Action',
          statut_manga: 'Completed',
          created_at: new Date(),
        },
      ];

      const mockCounts = [{ anime_count: 1, manga_count: 1 }];

      jest
        .spyOn(prismaService, '$queryRaw')
        .mockResolvedValueOnce(mockAnimes)
        .mockResolvedValueOnce(mockMangas)
        .mockResolvedValueOnce(mockCounts);
      jest.spyOn(prismaService, '$executeRaw').mockResolvedValue(undefined);

      return request(app.getHttpServer())
        .get('/api/search?q=naruto')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('results');
          expect(res.body).toHaveProperty('total', 2);
          expect(res.body).toHaveProperty('breakdown');
          expect(res.body).toHaveProperty('searchTime');
          expect(res.body.breakdown).toEqual({
            animes: 1,
            mangas: 1,
          });
        });
    });

    it('should filter by type', () => {
      const mockAnimes = [
        {
          id_anime: 1,
          nom_anime: 'Naruto',
          synopsis_anime: 'A ninja story',
          note_anime: 8.5,
          genre_anime: 'Action',
          statut_anime: 'Completed',
          created_at: new Date(),
        },
      ];

      jest
        .spyOn(prismaService, '$queryRaw')
        .mockResolvedValueOnce(mockAnimes)
        .mockResolvedValueOnce([{ anime_count: 1, manga_count: 0 }]);
      jest.spyOn(prismaService, '$executeRaw').mockResolvedValue(undefined);

      return request(app.getHttpServer())
        .get('/api/search?q=naruto&type=anime')
        .expect(200)
        .expect((res) => {
          expect(res.body.results).toHaveLength(1);
          expect(res.body.results[0].type).toBe('anime');
        });
    });

    it('should support pagination', () => {
      jest.spyOn(prismaService, '$queryRaw').mockResolvedValue([]);
      jest.spyOn(prismaService, '$executeRaw').mockResolvedValue(undefined);

      return request(app.getHttpServer())
        .get('/api/search?q=test&page=2&limit=5')
        .expect(200);
    });

    it('should support filtering by rating', () => {
      jest.spyOn(prismaService, '$queryRaw').mockResolvedValue([]);
      jest.spyOn(prismaService, '$executeRaw').mockResolvedValue(undefined);

      return request(app.getHttpServer())
        .get('/api/search?q=test&minRating=8')
        .expect(200);
    });

    it('should support filtering by genre', () => {
      jest.spyOn(prismaService, '$queryRaw').mockResolvedValue([]);
      jest.spyOn(prismaService, '$executeRaw').mockResolvedValue(undefined);

      return request(app.getHttpServer())
        .get('/api/search?q=test&genre=action')
        .expect(200);
    });

    it('should support sorting', () => {
      jest.spyOn(prismaService, '$queryRaw').mockResolvedValue([]);
      jest.spyOn(prismaService, '$executeRaw').mockResolvedValue(undefined);

      return request(app.getHttpServer())
        .get('/api/search?q=test&sortBy=rating')
        .expect(200);
    });

    it('should require search query', () => {
      return request(app.getHttpServer()).get('/api/search').expect(400);
    });
  });

  describe('/api/search/autocomplete (GET)', () => {
    it('should return autocomplete suggestions', () => {
      const mockSuggestions = [
        { title: 'Naruto', type: 'anime' },
        { title: 'Naruto Shippuden', type: 'anime' },
        { title: 'Naruto Manga', type: 'manga' },
      ];

      jest.spyOn(prismaService, '$queryRaw').mockResolvedValue(mockSuggestions);

      return request(app.getHttpServer())
        .get('/api/search/autocomplete?q=naru')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('suggestions');
          expect(res.body.suggestions).toHaveLength(3);
          expect(res.body.suggestions[0]).toHaveProperty('title', 'Naruto');
          expect(res.body.suggestions[0]).toHaveProperty('type', 'anime');
        });
    });

    it('should limit autocomplete results', () => {
      jest.spyOn(prismaService, '$queryRaw').mockResolvedValue([]);

      return request(app.getHttpServer())
        .get('/api/search/autocomplete?q=test&limit=5')
        .expect(200);
    });

    it('should require search query for autocomplete', () => {
      return request(app.getHttpServer())
        .get('/api/search/autocomplete')
        .expect(400);
    });
  });

  describe('/api/search/popular (GET)', () => {
    it('should return popular searches', () => {
      const mockPopular = [
        { search_term: 'naruto', search_count: 100, type: 'anime' },
        { search_term: 'one piece', search_count: 90, type: 'manga' },
        { search_term: 'dragon ball', search_count: 80, type: 'anime' },
      ];

      jest.spyOn(prismaService, '$queryRaw').mockResolvedValue(mockPopular);

      return request(app.getHttpServer())
        .get('/api/search/popular')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('popular');
          expect(res.body.popular).toHaveLength(3);
          expect(res.body.popular[0]).toHaveProperty('term', 'naruto');
          expect(res.body.popular[0]).toHaveProperty('count', 100);
          expect(res.body.popular[0]).toHaveProperty('type', 'anime');
        });
    });

    it('should filter popular searches by type', () => {
      const mockPopular = [
        { search_term: 'naruto', search_count: 100, type: 'anime' },
        { search_term: 'dragon ball', search_count: 80, type: 'anime' },
      ];

      jest.spyOn(prismaService, '$queryRaw').mockResolvedValue(mockPopular);

      return request(app.getHttpServer())
        .get('/api/search/popular?type=anime')
        .expect(200)
        .expect((res) => {
          expect(res.body.popular.every((item) => item.type === 'anime')).toBe(
            true,
          );
        });
    });

    it('should limit popular search results', () => {
      jest.spyOn(prismaService, '$queryRaw').mockResolvedValue([]);

      return request(app.getHttpServer())
        .get('/api/search/popular?limit=5')
        .expect(200);
    });
  });

  describe('/api/search/analytics (GET)', () => {
    it('should return search analytics', () => {
      const mockStats = [
        { total_searches: 1000, unique_terms: 250, avg_results: 5.5 },
      ];

      const mockTopSearches = [
        { search_term: 'naruto', search_count: 100 },
        { search_term: 'one piece', search_count: 90 },
      ];

      const mockRecentSearches = [
        { search_term: 'demon slayer', created_at: new Date() },
        { search_term: 'attack on titan', created_at: new Date() },
      ];

      jest
        .spyOn(prismaService, '$queryRaw')
        .mockResolvedValueOnce(mockStats)
        .mockResolvedValueOnce(mockTopSearches)
        .mockResolvedValueOnce(mockRecentSearches);

      return request(app.getHttpServer())
        .get('/api/search/analytics')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('totalSearches', 1000);
          expect(res.body).toHaveProperty('uniqueTerms', 250);
          expect(res.body).toHaveProperty('averageResults', 5.5);
          expect(res.body).toHaveProperty('topSearches');
          expect(res.body).toHaveProperty('recentSearches');
          expect(res.body.topSearches).toHaveLength(2);
          expect(res.body.recentSearches).toHaveLength(2);
        });
    });
  });

  describe('/api/search/recommendations/:type/:id (GET)', () => {
    it('should return recommendations for anime', () => {
      const mockRecommendations = [
        {
          id_anime: 2,
          nom_anime: 'Naruto Shippuden',
          synopsis_anime: 'Continuation of Naruto',
          note_anime: 8.8,
          genre_anime: 'Action',
          statut_anime: 'Completed',
          created_at: new Date(),
        },
      ];

      jest
        .spyOn(prismaService, '$queryRaw')
        .mockResolvedValue(mockRecommendations);

      return request(app.getHttpServer())
        .get('/api/search/recommendations/anime/1')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('recommendations');
          expect(res.body.recommendations).toHaveLength(1);
          expect(res.body.recommendations[0]).toHaveProperty('type', 'anime');
        });
    });

    it('should return recommendations for manga', () => {
      const mockRecommendations = [
        {
          id_manga: 2,
          nom_manga: 'Boruto Manga',
          synopsis_manga: 'Next generation',
          note_manga: 7.5,
          genre_manga: 'Action',
          statut_manga: 'Ongoing',
          created_at: new Date(),
        },
      ];

      jest
        .spyOn(prismaService, '$queryRaw')
        .mockResolvedValue(mockRecommendations);

      return request(app.getHttpServer())
        .get('/api/search/recommendations/manga/1')
        .expect(200)
        .expect((res) => {
          expect(res.body.recommendations[0]).toHaveProperty('type', 'manga');
        });
    });

    it('should validate recommendation type', () => {
      return request(app.getHttpServer())
        .get('/api/search/recommendations/invalid/1')
        .expect(400);
    });

    it('should validate recommendation id', () => {
      return request(app.getHttpServer())
        .get('/api/search/recommendations/anime/invalid')
        .expect(400);
    });
  });
});
