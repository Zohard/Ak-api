import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';

interface TagWeight {
  tagName: string;
  weight: number;
}

export interface RecommendationItem {
  id: number;
  title: string;
  titleFr?: string;
  image: string;
  averageRating: number;
  reviewCount: number;
  synopsis?: string;
  year?: number;
  type: 'anime' | 'manga';
  score: number;
  matchingTags: string[];
}

export interface RecommendationsResponse {
  recommendations: RecommendationItem[];
  userTopTags: { tag: string; weight: number }[];
  totalAnalyzed: number;
}

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async getRecommendationsForUser(
    userId: number,
    limit: number = 20,
    mediaType?: 'anime' | 'manga',
  ): Promise<RecommendationsResponse> {
    const cacheKey = `recommendations:${userId}:${mediaType || 'all'}:${limit}`;

    // Check cache first (30 minute TTL)
    const cached = await this.cacheService.get<RecommendationsResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    // Step 1: Get user's collection (completed + currently watching/reading)
    const includeTypes = [1, 2]; // Type 1 = Completed, Type 2 = Currently watching/reading

    const [animeCollections, mangaCollections] = await Promise.all([
      mediaType === 'manga' ? [] : this.prisma.collectionAnime.findMany({
        where: {
          idMembre: userId,
          type: { in: includeTypes },
        },
        include: {
          anime: {
            select: {
              idAnime: true,
              businessRelations: {
                include: {
                  business: true,
                },
              },
            },
          },
        },
      }),
      mediaType === 'anime' ? [] : this.prisma.collectionManga.findMany({
        where: {
          idMembre: userId,
          type: { in: includeTypes },
        },
        include: {
          manga: {
            select: {
              idManga: true,
              tags: true,
              businessRelations: {
                include: {
                  business: true,
                },
              },
            },
          },
        },
      }),
    ]);

    // Step 2: Get all items in user's collection (for exclusion)
    const [allAnimeIds, allMangaIds] = await Promise.all([
      this.prisma.collectionAnime.findMany({
        where: { idMembre: userId },
        select: { idAnime: true },
      }).then(items => items.map(item => item.idAnime)),
      this.prisma.collectionManga.findMany({
        where: { idMembre: userId },
        select: { idManga: true },
      }).then(items => items.map(item => item.idManga)),
    ]);

    // Step 3: Extract tags with weights based on user ratings
    const tagWeights = this.extractWeightedTags(animeCollections, mangaCollections);

    if (tagWeights.length === 0) {
      return {
        recommendations: [],
        userTopTags: [],
        totalAnalyzed: animeCollections.length + mangaCollections.length,
      };
    }

    // Step 4: Get top tags
    const topTags = tagWeights
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 20)
      .map(t => t.tagName);

    // Step 5: Find recommendations
    const recommendations = await this.findRecommendations(
      topTags,
      tagWeights,
      allAnimeIds,
      allMangaIds,
      limit,
      mediaType,
    );

    const result = {
      recommendations,
      userTopTags: tagWeights
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 10)
        .map(t => ({ tag: t.tagName, weight: Math.round(t.weight * 100) / 100 })),
      totalAnalyzed: animeCollections.length + mangaCollections.length,
    };

    // Cache for 30 minutes
    await this.cacheService.set(cacheKey, result, 1800);

    return result;
  }

  private extractWeightedTags(
    animeCollections: any[],
    mangaCollections: any[],
  ): TagWeight[] {
    const tagWeightMap = new Map<string, number>();

    // Process anime collections
    for (const item of animeCollections) {
      const rating = item.evaluation ? parseFloat(item.evaluation.toString()) : 0;
      const weight = this.calculateWeight(rating);

      // Extract tags from business relations (genres, studios, etc.)
      if (item.anime?.businessRelations) {
        for (const relation of item.anime.businessRelations) {
          if (relation.business?.denomination) {
            const tagName = relation.business.denomination.toLowerCase().trim();
            tagWeightMap.set(tagName, (tagWeightMap.get(tagName) || 0) + weight);
          }
        }
      }
    }

    // Process manga collections
    for (const item of mangaCollections) {
      const rating = item.evaluation ? parseFloat(item.evaluation.toString()) : 0;
      const weight = this.calculateWeight(rating);

      // Extract tags from manga.tags field (comma-separated)
      if (item.manga?.tags) {
        const tags = item.manga.tags
          .split(',')
          .map(t => t.trim().toLowerCase())
          .filter(t => t.length > 0);

        for (const tag of tags) {
          tagWeightMap.set(tag, (tagWeightMap.get(tag) || 0) + weight);
        }
      }

      // Extract tags from business relations
      if (item.manga?.businessRelations) {
        for (const relation of item.manga.businessRelations) {
          if (relation.business?.denomination) {
            const tagName = relation.business.denomination.toLowerCase().trim();
            tagWeightMap.set(tagName, (tagWeightMap.get(tagName) || 0) + weight);
          }
        }
      }
    }

    return Array.from(tagWeightMap.entries()).map(([tagName, weight]) => ({
      tagName,
      weight,
    }));
  }

  private calculateWeight(rating: number): number {
    // Weight based on rating:
    // 5.0 stars = 3x weight
    // 4.0-4.9 stars = 2x weight
    // 3.0-3.9 stars = 1x weight
    // Below 3.0 = 0.5x weight
    // No rating = 1x weight

    if (rating === 0) return 1.0;
    if (rating >= 4.5) return 3.0;
    if (rating >= 4.0) return 2.5;
    if (rating >= 3.5) return 2.0;
    if (rating >= 3.0) return 1.5;
    return 0.5;
  }

  private async findRecommendations(
    topTags: string[],
    allTagWeights: TagWeight[],
    excludeAnimeIds: number[],
    excludeMangaIds: number[],
    limit: number,
    mediaType?: 'anime' | 'manga',
  ): Promise<RecommendationItem[]> {
    const recommendations: RecommendationItem[] = [];

    // Search for anime recommendations
    if (mediaType !== 'manga') {
      const animeRecs = await this.findAnimeRecommendations(
        topTags,
        allTagWeights,
        excludeAnimeIds,
        Math.ceil(limit * 1.5), // Get more than needed for better filtering
      );
      recommendations.push(...animeRecs);
    }

    // Search for manga recommendations
    if (mediaType !== 'anime') {
      const mangaRecs = await this.findMangaRecommendations(
        topTags,
        allTagWeights,
        excludeMangaIds,
        Math.ceil(limit * 1.5),
      );
      recommendations.push(...mangaRecs);
    }

    // Sort by score and return top N
    return recommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async findAnimeRecommendations(
    topTags: string[],
    tagWeights: TagWeight[],
    excludeIds: number[],
    limit: number,
  ): Promise<RecommendationItem[]> {
    // Find anime with matching business relations (genres, studios)
    const animes = await this.prisma.akAnime.findMany({
      where: {
        idAnime: { notIn: excludeIds },
        ficheComplete: 1,
        businessRelations: {
          some: {
            business: {
              denomination: {
                in: topTags.map(t => t.charAt(0).toUpperCase() + t.slice(1)),
                mode: 'insensitive',
              },
            },
          },
        },
      },
      include: {
        businessRelations: {
          include: {
            business: true,
          },
        },
      },
      take: limit * 2,
    });

    return animes.map(anime => {
      const matchingTags: string[] = [];
      let tagScore = 0;

      // Calculate tag matching score
      if (anime.businessRelations) {
        for (const relation of anime.businessRelations) {
          const businessName = relation.business?.denomination?.toLowerCase().trim();
          if (businessName) {
            const tagWeight = tagWeights.find(tw => tw.tagName === businessName);
            if (tagWeight) {
              matchingTags.push(businessName);
              tagScore += tagWeight.weight;
            }
          }
        }
      }

      // Calculate final score
      const avgRating = anime.moyenneNotes ? parseFloat(anime.moyenneNotes.toString()) : 0;
      const reviewCount = anime.nbReviews || 0;
      const popularityScore = Math.log(reviewCount + 1) * 0.5;

      const score = tagScore * 10 + avgRating * 2 + popularityScore;

      return {
        id: anime.idAnime,
        title: anime.titre,
        titleFr: anime.titreFr || undefined,
        image: anime.image || '',
        averageRating: avgRating,
        reviewCount,
        synopsis: anime.synopsis || undefined,
        year: anime.annee || undefined,
        type: 'anime' as const,
        score,
        matchingTags,
      };
    }).filter(item => item.matchingTags.length > 0);
  }

  private async findMangaRecommendations(
    topTags: string[],
    tagWeights: TagWeight[],
    excludeIds: number[],
    limit: number,
  ): Promise<RecommendationItem[]> {
    // Build OR conditions for tag matching
    const tagConditions = topTags.map(tag => ({
      tags: {
        contains: tag,
        mode: 'insensitive' as const,
      },
    }));

    const mangas = await this.prisma.akManga.findMany({
      where: {
        idManga: { notIn: excludeIds },
        ficheComplete: 1,
        OR: [
          ...tagConditions,
          {
            businessRelations: {
              some: {
                business: {
                  denomination: {
                    in: topTags.map(t => t.charAt(0).toUpperCase() + t.slice(1)),
                    mode: 'insensitive',
                  },
                },
              },
            },
          },
        ],
      },
      include: {
        businessRelations: {
          include: {
            business: true,
          },
        },
      },
      take: limit * 2,
    });

    return mangas.map(manga => {
      const matchingTags: string[] = [];
      let tagScore = 0;

      // Extract and match tags from manga.tags field
      if (manga.tags) {
        const mangaTags = manga.tags
          .split(',')
          .map(t => t.trim().toLowerCase())
          .filter(t => t.length > 0);

        for (const tag of mangaTags) {
          const tagWeight = tagWeights.find(tw => tw.tagName === tag);
          if (tagWeight) {
            matchingTags.push(tag);
            tagScore += tagWeight.weight;
          }
        }
      }

      // Match tags from business relations
      if (manga.businessRelations) {
        for (const relation of manga.businessRelations) {
          const businessName = relation.business?.denomination?.toLowerCase().trim();
          if (businessName) {
            const tagWeight = tagWeights.find(tw => tw.tagName === businessName);
            if (tagWeight && !matchingTags.includes(businessName)) {
              matchingTags.push(businessName);
              tagScore += tagWeight.weight;
            }
          }
        }
      }

      // Calculate final score
      const avgRating = manga.moyenneNotes ? parseFloat(manga.moyenneNotes.toString()) : 0;
      const reviewCount = manga.nbReviews || 0;
      const popularityScore = Math.log(reviewCount + 1) * 0.5;

      const score = tagScore * 10 + avgRating * 2 + popularityScore;

      return {
        id: manga.idManga,
        title: manga.titre,
        titleFr: manga.titreFr || undefined,
        image: manga.image || '',
        averageRating: avgRating,
        reviewCount,
        synopsis: manga.synopsis || undefined,
        year: manga.annee ? parseInt(manga.annee) : undefined,
        type: 'manga' as const,
        score,
        matchingTags,
      };
    }).filter(item => item.matchingTags.length > 0);
  }

  async invalidateUserRecommendations(userId: number): Promise<void> {
    const patterns = [
      `recommendations:${userId}:*`,
    ];

    for (const pattern of patterns) {
      await this.cacheService.delByPattern(pattern);
    }
  }
}
