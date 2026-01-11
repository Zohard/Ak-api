import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';

interface MediaScore {
  id: number;
  score: number;
}

interface MediaRanking {
  id: number;
  score: number;
  rank: number;
  previousRank: number;
  titre?: string;
  annee?: number;
}

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate variation text (e.g., "+5", "-3", "NEW", "=")
   */
  private calculateVariation(rank: number, previousRank: number): string {
    if (previousRank === 0) {
      return 'NEW';
    }
    const change = previousRank - rank;
    if (change > 0) {
      return `+${change}`;
    } else if (change < 0) {
      return `${change}`;
    }
    return '=';
  }

  /**
   * Update anime popularity rankings
   */
  async updateAnimePopularity() {
    this.logger.log('Starting anime popularity calculation...');

    try {
      // Step 1: Calculate scores
      const scores = await this.calculateAnimeScores();

      if (scores.length === 0) {
        this.logger.warn('No animes found to rank');
        return {
          success: true,
          message: 'No animes to rank',
          stats: {
            totalAnimes: 0,
            updatedCount: 0,
            errorCount: 0,
          },
          top10: [],
        };
      }

      // Step 2: Get current ranks
      const currentRanks = await this.prisma.akAnime.findMany({
        where: {
          statut: 1,
          classementPopularite: { not: 0 },
        },
        select: {
          idAnime: true,
          classementPopularite: true,
        },
      });

      const currentRankMap = new Map(
        currentRanks.map((a) => [a.idAnime, a.classementPopularite]),
      );

      // Step 3: Assign ranks
      const rankings: MediaRanking[] = scores.map((anime, index) => ({
        id: anime.id,
        score: anime.score,
        rank: index + 1,
        previousRank: currentRankMap.get(anime.id) || 0,
      }));

      // Step 4: Update database
      let updatedCount = 0;
      let errorCount = 0;

      const batchSize = 100;
      for (let i = 0; i < rankings.length; i += batchSize) {
        const batch = rankings.slice(i, i + batchSize);

        const promises = batch.map(async (anime) => {
          try {
            const variation = this.calculateVariation(
              anime.rank,
              anime.previousRank,
            );

            await this.prisma.akAnime.update({
              where: { idAnime: anime.id },
              data: {
                classementPopularite: anime.rank,
                variationPopularite: variation,
              },
            });

            updatedCount++;
          } catch (error) {
            this.logger.error(
              `Error updating anime ${anime.id}: ${error.message}`,
            );
            errorCount++;
          }
        });

        await Promise.all(promises);
      }

      // Step 5: Get top 10 with details
      const top10Ids = rankings.slice(0, 10).map((r) => r.id);
      const top10Animes = await this.prisma.akAnime.findMany({
        where: { idAnime: { in: top10Ids } },
        select: {
          idAnime: true,
          titre: true,
          annee: true,
        },
      });

      const top10Map = new Map(
        top10Animes.map((a) => [a.idAnime, { titre: a.titre, annee: a.annee }]),
      );

      const top10 = rankings.slice(0, 10).map((r) => {
        const details = top10Map.get(r.id);
        const variation =
          r.previousRank === 0
            ? 'NEW'
            : r.previousRank > r.rank
              ? `+${r.previousRank - r.rank}`
              : r.previousRank < r.rank
                ? `${r.previousRank - r.rank}`
                : '=';

        return {
          rank: r.rank,
          id: r.id,
          titre: details?.titre || 'Unknown',
          annee: details?.annee,
          score: Math.round(r.score * 100) / 100,
          change: variation,
        };
      });

      this.logger.log(
        `Anime popularity update completed - Updated: ${updatedCount}, Errors: ${errorCount}`,
      );

      return {
        success: true,
        message: `Updated ${updatedCount} anime rankings`,
        stats: {
          totalAnimes: rankings.length,
          updatedCount,
          errorCount,
        },
        top10,
      };
    } catch (error) {
      this.logger.error(
        `Fatal error in anime popularity update: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Calculate popularity scores for all animes
   * Formula: (usersInCollection * 10) + (avgReviewScore * 5) + (views / 100) + (collectionScore * 2)
   */
  private async calculateAnimeScores(): Promise<MediaScore[]> {
    this.logger.log('Calculating anime popularity scores...');

    const scores = await this.prisma.$queryRaw<MediaScore[]>`
      WITH anime_stats AS (
        SELECT
          a.id_anime,
          -- Number of unique users who have this anime in their collection
          (SELECT COUNT(DISTINCT id_membre) FROM collection_animes WHERE id_anime = a.id_anime) as users_in_collection,
          -- Average review score from ak_animes
          COALESCE(a.moyennenotes, 0) as avg_review_score,
          -- Total views
          COALESCE(a.nb_clics, 0) as views,
          -- Average collection score from user evaluations
          COALESCE((
            SELECT AVG(evaluation)
            FROM collection_animes
            WHERE id_anime = a.id_anime AND evaluation > 0.0
          ), 0) as collection_score
        FROM ak_animes a
        WHERE a.statut = 1
      )
      SELECT
        id_anime as id,
        (
          (users_in_collection * 10) +
          (avg_review_score * 5) +
          (views / 100.0) +
          (collection_score * 2)
        ) as score
      FROM anime_stats
      ORDER BY score DESC
    `;

    this.logger.log(`Calculated scores for ${scores.length} animes`);
    return scores;
  }

  /**
   * Update manga popularity rankings
   */
  async updateMangaPopularity() {
    this.logger.log('Starting manga popularity calculation...');

    try {
      // Step 1: Calculate scores
      const scores = await this.calculateMangaScores();

      if (scores.length === 0) {
        this.logger.warn('No mangas found to rank');
        return {
          success: true,
          message: 'No mangas to rank',
          stats: {
            totalMangas: 0,
            updatedCount: 0,
            errorCount: 0,
          },
          top10: [],
        };
      }

      // Step 2: Get current ranks
      const currentRanks = await this.prisma.akManga.findMany({
        where: {
          statut: 1,
          classementPopularite: { not: 0 },
        },
        select: {
          idManga: true,
          classementPopularite: true,
        },
      });

      const currentRankMap = new Map(
        currentRanks.map((m) => [m.idManga, m.classementPopularite]),
      );

      // Step 3: Assign ranks
      const rankings: MediaRanking[] = scores.map((manga, index) => ({
        id: manga.id,
        score: manga.score,
        rank: index + 1,
        previousRank: currentRankMap.get(manga.id) || 0,
      }));

      // Step 4: Update database
      let updatedCount = 0;
      let errorCount = 0;

      const batchSize = 100;
      for (let i = 0; i < rankings.length; i += batchSize) {
        const batch = rankings.slice(i, i + batchSize);

        const promises = batch.map(async (manga) => {
          try {
            const variation = this.calculateVariation(
              manga.rank,
              manga.previousRank,
            );

            await this.prisma.akManga.update({
              where: { idManga: manga.id },
              data: {
                classementPopularite: manga.rank,
                variationPopularite: variation,
              },
            });

            updatedCount++;
          } catch (error) {
            this.logger.error(
              `Error updating manga ${manga.id}: ${error.message}`,
            );
            errorCount++;
          }
        });

        await Promise.all(promises);
      }

      // Step 5: Get top 10 with details
      const top10Ids = rankings.slice(0, 10).map((r) => r.id);
      const top10Mangas = await this.prisma.akManga.findMany({
        where: { idManga: { in: top10Ids } },
        select: {
          idManga: true,
          titre: true,
          annee: true,
        },
      });

      const top10Map = new Map(
        top10Mangas.map((m) => [m.idManga, { titre: m.titre, annee: m.annee }]),
      );

      const top10 = rankings.slice(0, 10).map((r) => {
        const details = top10Map.get(r.id);
        const variation =
          r.previousRank === 0
            ? 'NEW'
            : r.previousRank > r.rank
              ? `+${r.previousRank - r.rank}`
              : r.previousRank < r.rank
                ? `${r.previousRank - r.rank}`
                : '=';

        return {
          rank: r.rank,
          id: r.id,
          titre: details?.titre || 'Unknown',
          annee: details?.annee,
          score: Math.round(r.score * 100) / 100,
          change: variation,
        };
      });

      this.logger.log(
        `Manga popularity update completed - Updated: ${updatedCount}, Errors: ${errorCount}`,
      );

      return {
        success: true,
        message: `Updated ${updatedCount} manga rankings`,
        stats: {
          totalMangas: rankings.length,
          updatedCount,
          errorCount,
        },
        top10,
      };
    } catch (error) {
      this.logger.error(
        `Fatal error in manga popularity update: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Calculate popularity scores for all mangas
   * Formula: (usersInCollection * 10) + (avgReviewScore * 5) + (views / 100) + (collectionScore * 2)
   */
  private async calculateMangaScores(): Promise<MediaScore[]> {
    this.logger.log('Calculating manga popularity scores...');

    const scores = await this.prisma.$queryRaw<MediaScore[]>`
      WITH manga_stats AS (
        SELECT
          m.id_manga,
          -- Number of unique users who have this manga in their collection
          (SELECT COUNT(DISTINCT id_membre) FROM collection_mangas WHERE id_manga = m.id_manga) as users_in_collection,
          -- Average review score from ak_mangas
          COALESCE(m.moyennenotes, 0) as avg_review_score,
          -- Total views
          COALESCE(m.nb_clics, 0) as views,
          -- Average collection score from user evaluations
          COALESCE((
            SELECT AVG(evaluation)
            FROM collection_mangas
            WHERE id_manga = m.id_manga AND evaluation > 0.0
          ), 0) as collection_score
        FROM ak_mangas m
        WHERE m.statut = 1
      )
      SELECT
        id_manga as id,
        (
          (users_in_collection * 10) +
          (avg_review_score * 5) +
          (views / 100.0) +
          (collection_score * 2)
        ) as score
      FROM manga_stats
      ORDER BY score DESC
    `;

    this.logger.log(`Calculated scores for ${scores.length} mangas`);
    return scores;
  }
}
