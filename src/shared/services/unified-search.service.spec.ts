import { Test, TestingModule } from '@nestjs/testing';
import { UnifiedSearchService } from './unified-search.service';
import { PrismaService } from './prisma.service';

describe('UnifiedSearchService', () => {
  let service: UnifiedSearchService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    akAnime: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    akManga: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedSearchService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UnifiedSearchService>(UnifiedSearchService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('search', () => {
    const mockSearchQuery = {
      q: 'naruto',
      type: 'all' as const,
      limit: 20,
      page: 1,
      sortBy: 'relevance' as const,
      minRating: 7,
      genre: 'action',
      year: 2023,
      status: 'completed',
    };

    it('should return search results with breakdown', async () => {
      const mockAnimes = [
        {
          id_anime: 1,
          nom_anime: 'Naruto',
          synopsis_anime: 'A ninja story',
          note_anime: 8.5,
          genre_anime: 'Action',
          statut_anime: 'Completed',
          type: 'anime',
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
          type: 'manga',
          created_at: new Date(),
        },
      ];

      const mockCounts = [{ anime_count: 1, manga_count: 1 }];

      mockPrismaService.$queryRaw
        .mockResolvedValueOnce(mockAnimes)
        .mockResolvedValueOnce(mockMangas)
        .mockResolvedValueOnce(mockCounts);

      const result = await service.search(mockSearchQuery);

      expect(result).toEqual({
        results: expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            title: 'Naruto',
            type: 'anime',
            rating: 8.5,
            genre: 'Action',
            status: 'Completed',
          }),
          expect.objectContaining({
            id: 1,
            title: 'Naruto Manga',
            type: 'manga',
            rating: 9.0,
            genre: 'Action',
            status: 'Completed',
          }),
        ]),
        total: 2,
        breakdown: {
          animes: 1,
          mangas: 1,
        },
        searchTime: expect.any(Number),
      });

      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(3);
    });

    it('should filter by anime type only', async () => {
      const animeQuery = { ...mockSearchQuery, type: 'anime' as const };

      mockPrismaService.$queryRaw.mockResolvedValue([]);

      await service.search(animeQuery);

      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(2); // Only anime query + count
    });

    it('should filter by manga type only', async () => {
      const mangaQuery = { ...mockSearchQuery, type: 'manga' as const };

      mockPrismaService.$queryRaw.mockResolvedValue([]);

      await service.search(mangaQuery);

      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(2); // Only manga query + count
    });

    it('should handle empty search results', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ anime_count: 0, manga_count: 0 }]);

      const result = await service.search(mockSearchQuery);

      expect(result).toEqual({
        results: [],
        total: 0,
        breakdown: {
          animes: 0,
          mangas: 0,
        },
        searchTime: expect.any(Number),
      });
    });

    it('should handle search errors gracefully', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.search(mockSearchQuery)).rejects.toThrow(
        'Database error',
      );
    });
  });

  describe('getAutocomplete', () => {
    it('should return autocomplete suggestions', async () => {
      const mockSuggestions = ['Naruto', 'Naruto Shippuden', 'Naruto Manga'];

      jest
        .spyOn(service as any, 'generateSuggestions')
        .mockResolvedValue(mockSuggestions);

      const result = await service.getAutocomplete('naru');

      expect(result).toEqual(mockSuggestions);
    });

    it('should limit autocomplete results', async () => {
      const mockSuggestions = Array.from({ length: 15 }, (_, i) => ({
        title: `Naruto ${i}`,
        type: 'anime',
      }));

      mockPrismaService.$queryRaw.mockResolvedValue(mockSuggestions);

      const result = await service.getAutocomplete('naru', 5);

      expect(mockPrismaService.$queryRaw).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 5'),
      );
    });
  });

  describe('getPopularSearches', () => {
    it('should return popular searches', async () => {
      const mockPopular = [
        { query: 'query1', count: 1 },
        { query: 'query2', count: 2 },
        { query: 'query3', count: 3 },
      ];

      mockPrismaService.$queryRaw.mockResolvedValue([
        { query: 'query1', search_count: 1 },
        { query: 'query2', search_count: 2 },
        { query: 'query3', search_count: 3 },
      ]);

      const result = await service.getPopularSearches();

      expect(result).toEqual([
        { query: 'query1', count: 1 },
        { query: 'query2', count: 2 },
        { query: 'query3', count: 3 },
      ]);
    });

    it('should filter popular searches by type', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      await service.getPopularSearches('anime');

      expect(mockPrismaService.$queryRaw).toHaveBeenCalledWith(
        expect.stringContaining("WHERE type = 'anime'"),
      );
    });
  });

  describe('getSearchAnalytics', () => {
    it('should return search analytics', async () => {
      const mockStats = [
        { total_searches: 1000, unique_queries: 250, avg_search_time: 5.5 },
      ];

      const mockTopSearches = [
        { query: 'naruto', count: 100 },
        { query: 'one piece', count: 90 },
      ];

      mockPrismaService.$queryRaw.mockResolvedValue(mockStats);
      jest
        .spyOn(service, 'getPopularSearches')
        .mockResolvedValue(mockTopSearches);

      const result = await service.getSearchAnalytics();

      expect(result).toEqual({
        totalSearches: 1000,
        uniqueQueries: 250,
        avgSearchTime: 5.5,
        topSearches: mockTopSearches,
      });
    });

    it('should handle analytics query errors', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue(
        new Error('Database error'),
      );
      jest.spyOn(service, 'getPopularSearches').mockResolvedValue([]);

      const result = await service.getSearchAnalytics();

      expect(result).toEqual({
        totalSearches: 0,
        uniqueQueries: 0,
        avgSearchTime: 0,
        topSearches: [],
      });
    });
  });
});
