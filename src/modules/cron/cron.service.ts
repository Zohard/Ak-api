import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { MangaVolumesService } from '../mangas/manga-volumes.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly mangaVolumesService: MangaVolumesService,
  ) { }

  /**
   * Update anime popularity rankings
   * Optimized version using bulk UPDATE for performance (<30s for 8000+ animes)
   */
  async updateAnimePopularity() {
    this.logger.log('Starting anime popularity calculation...');

    try {
      // Step 1: Bulk update all rankings in a single query
      const updateResult = await this.prisma.$executeRaw`
        WITH collection_stats AS (
          SELECT
            id_anime,
            COUNT(DISTINCT id_membre) as users_in_collection,
            AVG(CASE WHEN evaluation > 0 THEN evaluation END) as collection_score
          FROM collection_animes
          GROUP BY id_anime
        ),
        anime_scores AS (
          SELECT
            a.id_anime,
            (
              COALESCE(c.users_in_collection, 0) * 10 +
              COALESCE(a.moyennenotes, 0) * 5 +
              COALESCE(a.nb_clics, 0) / 100.0 +
              COALESCE(c.collection_score, 0) * 2
            ) as score
          FROM ak_animes a
          LEFT JOIN collection_stats c ON a.id_anime = c.id_anime
          WHERE a.statut = 1
        ),
        ranked AS (
          SELECT
            id_anime,
            score,
            ROW_NUMBER() OVER (ORDER BY score DESC) as new_rank
          FROM anime_scores
        )
        UPDATE ak_animes a
        SET
          classement_popularite = r.new_rank::int,
          variation_popularite = CASE
            WHEN a.classement_popularite IS NULL OR a.classement_popularite = 0 THEN 'NEW'
            WHEN a.classement_popularite > r.new_rank THEN '+' || (a.classement_popularite - r.new_rank)::text
            WHEN a.classement_popularite < r.new_rank THEN (a.classement_popularite - r.new_rank)::text
            ELSE '='
          END
        FROM ranked r
        WHERE a.id_anime = r.id_anime
      `;

      this.logger.log(`Bulk updated ${updateResult} anime rankings`);

      // Step 2: Get top 10 for response
      const top10 = await this.prisma.$queryRaw<
        Array<{
          id: number;
          titre: string;
          annee: number | null;
          rank: number;
          change: string;
          score: number;
        }>
      >`
        WITH collection_stats AS (
          SELECT
            id_anime,
            COUNT(DISTINCT id_membre) as users_in_collection,
            AVG(CASE WHEN evaluation > 0 THEN evaluation END) as collection_score
          FROM collection_animes
          GROUP BY id_anime
        )
        SELECT
          a.id_anime as id,
          a.titre,
          a.annee,
          a.classement_popularite as rank,
          a.variation_popularite as change,
          ROUND((
            COALESCE(c.users_in_collection, 0) * 10 +
            COALESCE(a.moyennenotes, 0) * 5 +
            COALESCE(a.nb_clics, 0) / 100.0 +
            COALESCE(c.collection_score, 0) * 2
          )::numeric, 2) as score
        FROM ak_animes a
        LEFT JOIN collection_stats c ON a.id_anime = c.id_anime
        WHERE a.statut = 1 AND a.classement_popularite > 0
        ORDER BY a.classement_popularite ASC
        LIMIT 10
      `;

      // Step 3: Invalidate rankings cache
      await this.cacheService.invalidateRankings('anime');

      this.logger.log(
        `Anime popularity update completed - Updated: ${updateResult}`,
      );

      return {
        success: true,
        message: `Updated ${updateResult} anime rankings`,
        stats: {
          totalAnimes: updateResult,
          updatedCount: updateResult,
          errorCount: 0,
        },
        top10: top10.map((r) => ({
          rank: r.rank,
          id: r.id,
          titre: r.titre || 'Unknown',
          annee: r.annee,
          score: Number(r.score),
          change: r.change || '=',
        })),
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
   * Sync volumes for active mangas
   * Fetches pending/active mangas and updates their volume list
   */
  async syncMangaVolumes(limit: number = 5): Promise<{
    processed: number;
    results: any[];
  }> {
    this.logger.log(`Starting manga volume sync (limit: ${limit})...`);

    // Find active mangas (statut = 1) that haven't been updated recently?
    // Or just pick random ones? Or order by update date?
    // Let's pick active mangas, prioritizing those that haven't been cached/updated recently
    const mangas = await this.prisma.akManga.findMany({
      where: {
        statut: 1, // Only active/validated mangas
        // Maybe exclude those marked as "Finished" in publication status if we check that field?
        // statutVol != 'Terminé' ?
      },
      orderBy: {
        latestCache: 'asc', // Process oldest cache first
      },
      take: limit,
    });

    this.logger.log(`Found ${mangas.length} mangas to sync volumes for`);

    const results = [];
    for (const manga of mangas) {
      try {
        this.logger.debug(`Syncing volumes for ${manga.titre} (ID: ${manga.idManga})`);

        // We use the exported service from MangasModule
        // But we need to inject it. We'll add it to constructor below.
        // For now let's assume it's injected as private readonly mangaVolumesService
        const result = await this.mangaVolumesService.syncAllVolumes(manga.idManga, {
          uploadCovers: true,
          force: false, // Don't overwrite existing complete info
          filterDate: new Date(), // Sync only for current month/year
        });

        results.push({
          id: manga.idManga,
          title: manga.titre,
          success: result.success,
          summary: result.summary,
        });
      } catch (error) {
        this.logger.error(`Failed to sync volumes for ${manga.titre}: ${error.message}`);
        results.push({
          id: manga.idManga,
          title: manga.titre,
          success: false,
          error: error.message,
        });
      }
    }

    return {
      processed: mangas.length,
      results,
    };
  }

  /**
   * Update manga popularity rankings
   * Optimized version using bulk UPDATE for performance (<30s for all mangas)
   */
  async updateMangaPopularity() {
    this.logger.log('Starting manga popularity calculation...');

    try {
      // Step 1: Bulk update all rankings in a single query
      const updateResult = await this.prisma.$executeRaw`
        WITH collection_stats AS (
          SELECT
            id_manga,
            COUNT(DISTINCT id_membre) as users_in_collection,
            AVG(CASE WHEN evaluation > 0 THEN evaluation END) as collection_score
          FROM collection_mangas
          GROUP BY id_manga
        ),
        manga_scores AS (
          SELECT
            m.id_manga,
            (
              COALESCE(c.users_in_collection, 0) * 10 +
              COALESCE(m.moyennenotes, 0) * 5 +
              COALESCE(m.nb_clics, 0) / 100.0 +
              COALESCE(c.collection_score, 0) * 2
            ) as score
          FROM ak_mangas m
          LEFT JOIN collection_stats c ON m.id_manga = c.id_manga
          WHERE m.statut = 1
        ),
        ranked AS (
          SELECT
            id_manga,
            score,
            ROW_NUMBER() OVER (ORDER BY score DESC) as new_rank
          FROM manga_scores
        )
        UPDATE ak_mangas m
        SET
          classement_popularite = r.new_rank::int,
          variation_popularite = CASE
            WHEN m.classement_popularite IS NULL OR m.classement_popularite = 0 THEN 'NEW'
            WHEN m.classement_popularite > r.new_rank THEN '+' || (m.classement_popularite - r.new_rank)::text
            WHEN m.classement_popularite < r.new_rank THEN (m.classement_popularite - r.new_rank)::text
            ELSE '='
          END
        FROM ranked r
        WHERE m.id_manga = r.id_manga
      `;

      this.logger.log(`Bulk updated ${updateResult} manga rankings`);

      // Step 2: Get top 10 for response
      const top10 = await this.prisma.$queryRaw<
        Array<{
          id: number;
          titre: string;
          annee: number | null;
          rank: number;
          change: string;
          score: number;
        }>
      >`
        WITH collection_stats AS (
          SELECT
            id_manga,
            COUNT(DISTINCT id_membre) as users_in_collection,
            AVG(CASE WHEN evaluation > 0 THEN evaluation END) as collection_score
          FROM collection_mangas
          GROUP BY id_manga
        )
        SELECT
          m.id_manga as id,
          m.titre,
          m.annee,
          m.classement_popularite as rank,
          m.variation_popularite as change,
          ROUND((
            COALESCE(c.users_in_collection, 0) * 10 +
            COALESCE(m.moyennenotes, 0) * 5 +
            COALESCE(m.nb_clics, 0) / 100.0 +
            COALESCE(c.collection_score, 0) * 2
          )::numeric, 2) as score
        FROM ak_mangas m
        LEFT JOIN collection_stats c ON m.id_manga = c.id_manga
        WHERE m.statut = 1 AND m.classement_popularite > 0
        ORDER BY m.classement_popularite ASC
        LIMIT 10
      `;

      // Step 3: Invalidate rankings cache
      await this.cacheService.invalidateRankings('manga');

      this.logger.log(
        `Manga popularity update completed - Updated: ${updateResult}`,
      );

      return {
        success: true,
        message: `Updated ${updateResult} manga rankings`,
        stats: {
          totalMangas: updateResult,
          updatedCount: updateResult,
          errorCount: 0,
        },
        top10: top10.map((r) => ({
          rank: r.rank,
          id: r.id,
          titre: r.titre || 'Unknown',
          annee: r.annee,
          score: Number(r.score),
          change: r.change || '=',
        })),
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
   * Update anime episode counts
   * Updates `nb_ep` in `ak_animes` based on count in `ak_animes_episodes`
   */
  async updateAnimeEpisodeCount() {
    this.logger.log('Starting anime episode count update...');

    try {
      // Execute raw query to count episodes and update anime table
      // Only updates where the count is different to avoid unnecessary writes
      const updateResult = await this.prisma.$executeRaw`
        WITH episode_counts AS (
          SELECT
            id_anime,
            COUNT(*) as actual_count
          FROM ak_animes_episodes
          GROUP BY id_anime
        )
        UPDATE ak_animes a
        SET nb_ep = ec.actual_count
        FROM episode_counts ec
        WHERE a.id_anime = ec.id_anime
        AND (a.nb_ep IS NULL OR a.nb_ep != ec.actual_count)
      `;

      this.logger.log(`Updated episode counts for ${updateResult} animes`);

      // Invalidate anime caches if any updates happened
      if (updateResult > 0) {
        await this.cacheService.delByPattern('anime:*');
      }

      return {
        success: true,
        message: `Updated episode counts for ${updateResult} animes`,
        stats: {
          updatedCount: updateResult,
          errorCount: 0,
        },
      };
    } catch (error) {
      this.logger.error(
        `Fatal error in anime episode count update: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
