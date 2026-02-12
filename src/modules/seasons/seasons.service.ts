import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';

import { EpisodesService } from '../animes/episodes/episodes.service';

@Injectable()
export class SeasonsService {
  private readonly logger = new Logger(SeasonsService.name);

  constructor(
    private prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly episodesService: EpisodesService,
  ) { }

  async syncSeasonEpisodes(seasonId: number) {
    const season = await this.findById(seasonId);
    if (!season) {
      throw new NotFoundException(`Season with ID ${seasonId} not found`);
    }

    const animeIds = [...new Set(this.normalizeJsonData(season.json_data))]; // Deduplicate IDs to prevent processing twice and frontend key collisions

    this.logger.log(`Syncing episodes for ${animeIds.length} animes in season ${seasonId}`);

    const results = [];
    for (const animeId of animeIds) {
      try {
        // Ensure ID is number
        const id = Number(animeId);
        if (id) {
          // Check if episodes already exist
          const existingCount = await this.episodesService.countEpisodes(id);

          if (existingCount > 0) {
            // Simply sync (will skip internal API call logic inside service)
            // But we do NOT wait 2.5s here because we didn't hit AniList API
            await this.episodesService.fetchAndSyncEpisodes(id);
            results.push({ id, status: 'success', skipped: true });
          } else {
            // No episodes exist, this will trigger AniList API
            await this.episodesService.fetchAndSyncEpisodes(id);
            results.push({ id, status: 'success', skipped: false });

            // Rate limiting: wait 2500ms ONLY if we effectively made a request
            await new Promise(resolve => setTimeout(resolve, 2500));
          }
        }
      } catch (e) {
        this.logger.error(`Failed to sync episodes for anime ${animeId} in season ${seasonId}:`, e.message);
        results.push({ id: animeId, status: 'error', error: e.message });
      }
    }

    return {
      total: animeIds.length,
      success: results.filter(r => r.status === 'success').length,
      errors: results.filter(r => r.status === 'error').length,
      details: results
    };
  }

  async findAll() {
    try {
      // Try to get from cache first
      const cached = await this.cacheService.get('seasons:all');
      if (cached) {
        return cached;
      }

      const seasons = await this.prisma.$queryRaw`
        SELECT id_saison, saison, annee, statut, current_season, json_data
        FROM ak_animes_saisons
        ORDER BY annee DESC, saison DESC, id_saison DESC
      `;

      // Cache for 1 hour (3600 seconds) - seasons don't change often
      await this.cacheService.set('seasons:all', seasons, 3600);

      return seasons;
    } catch (error) {
      this.logger.error('Error fetching seasons:', error);
      throw error;
    }
  }

  async findCurrent() {
    try {
      // Try to get from cache first
      const cached = await this.cacheService.get('seasons:current');
      if (cached) {
        return cached;
      }

      // Current season = entry with current_season = true
      const currentSeason = await this.prisma.$queryRaw`
        SELECT id_saison, saison, annee, statut, current_season, json_data
        FROM ak_animes_saisons
        WHERE current_season = true
        ORDER BY id_saison DESC
        LIMIT 1
      `;

      const result = Array.isArray(currentSeason) && currentSeason.length > 0 ? currentSeason[0] : null;

      // Cache for 4 hours (14400 seconds) - current season rarely changes, invalidated on admin updates
      await this.cacheService.set('seasons:current', result, 14400);

      return result;
    } catch (error) {
      this.logger.error('Error fetching current season:', error);
      throw error;
    }
  }

  async findLastCreated() {
    try {
      // Try to get from cache first
      const cached = await this.cacheService.get('seasons:last-created');
      if (cached) {
        return cached;
      }

      // Last created season = most recent entry regardless of status (ordered by id_saison DESC)
      const lastSeason = await this.prisma.$queryRaw`
        SELECT id_saison, saison, annee, statut, current_season, json_data
        FROM ak_animes_saisons
        ORDER BY id_saison DESC
        LIMIT 1
      `;

      const result = Array.isArray(lastSeason) && lastSeason.length > 0 ? lastSeason[0] : null;

      // Cache for 4 hours (14400 seconds) - rarely changes
      await this.cacheService.set('seasons:last-created', result, 14400);

      return result;
    } catch (error) {
      this.logger.error('Error fetching last created season:', error);
      throw error;
    }
  }

  async findById(id: number) {
    try {
      // Try to get from cache first
      const cached = await this.cacheService.get(`season:${id}`);
      if (cached) {
        return cached;
      }

      const season = await this.prisma.$queryRaw`
        SELECT id_saison, saison, annee, statut, current_season, json_data
        FROM ak_animes_saisons
        WHERE id_saison = ${id}
      `;

      const result = Array.isArray(season) && season.length > 0 ? season[0] : null;

      // Cache for 2 hours (7200 seconds) - individual seasons rarely change
      await this.cacheService.set(`season:${id}`, result, 7200);

      return result;
    } catch (error) {
      this.logger.error(`Error fetching season with ID ${id}:`, error);
      throw error;
    }
  }

  async getSeasonAnimes(seasonId: number) {
    try {
      // Try to get from cache first
      const cached = await this.cacheService.get(`season_animes:${seasonId}`);
      if (cached) {
        return cached;
      }

      // First get the season data to extract anime IDs from json_data
      const season = await this.findById(seasonId);
      if (!season) {
        return [];
      }

      const animeIds = this.normalizeJsonData(season.json_data);

      if (animeIds.length === 0) {
        const emptyResult = [];
        await this.cacheService.set(`season_animes:${seasonId}`, emptyResult, 86400);
        return emptyResult;
      }

      // Create a parameterized query with the anime IDs
      const placeholders = animeIds.map((_, index) => `$${index + 1}::integer`).join(', ');

      const animes = await this.prisma.$queryRawUnsafe(`
        SELECT
          "id_anime" as id,
          "id_anime" as "idAnime",
          "nice_url" as "niceUrl",
          "titre",
          "titre_orig" as "titreOrig",
          "annee",
          "nb_ep" as "nbEp",
          "image",
          "studio",
          "synopsis",
          "statut",
          "realisateur",
          "nb_reviews" as "nbReviews",
          "moyennenotes" as "moyenneNotes",
          "date_ajout" as "dateAjout",
          "format"
        FROM ak_animes
        WHERE "id_anime" IN (${placeholders})
          AND "statut" = 1
        ORDER BY "titre"
      `, ...animeIds);

      // Add format field if missing (default to 'Série TV') and deduplicate studios
      const result = (animes as any[]).map((anime: any) => ({
        ...anime,
        format: anime.format || 'Série TV',
        studio: this.deduplicateStudios(anime.studio)
      }));

      // Cache for 24 hours (86400 seconds) - season animes rarely change, invalidated on admin updates
      await this.cacheService.set(`season_animes:${seasonId}`, result, 86400);

      return result;

    } catch (error) {
      this.logger.error(`Error fetching animes for season ${seasonId}:`, error);
      throw error;
    }
  }

  // Admin: create a new season
  async createSeason(data: { annee: number; saison: number; statut?: number; id_article?: number; json_auteurs?: string; currentSeason?: boolean }) {
    const statut = typeof data.statut === 'number' ? data.statut : 0
    const id_article = typeof data.id_article === 'number' ? data.id_article : 0
    const json_auteurs = data.json_auteurs || ''
    const currentSeason = data.currentSeason === true ? true : false
    const created = (await this.prisma.$queryRaw`INSERT INTO ak_animes_saisons (annee, saison, statut, json_data, id_article, json_auteurs, current_season)
      VALUES (${data.annee}, ${data.saison}, ${statut}, ${this.serializeJsonData([])}, ${id_article}, ${json_auteurs}, ${currentSeason})
      RETURNING id_saison, saison, annee, statut, current_season, json_data, id_article, json_auteurs`) as any

    // Invalidate caches related to seasons lists/current
    await this.cacheService.del('seasons:all')
    await this.cacheService.del('seasons:current')
    return Array.isArray(created) ? created[0] : created
  }

  private normalizeJsonData(json_data: any): number[] {
    let animeIds: number[] = []
    if (json_data) {
      try {
        const jd = typeof json_data === 'string' ? JSON.parse(json_data) : json_data
        if (Array.isArray(jd)) animeIds = jd.map(id => Number(id))
        else if (Array.isArray(jd.animes)) animeIds = jd.animes.map(id => Number(id))
        else if (Array.isArray(jd.anime_ids)) animeIds = jd.anime_ids.map(id => Number(id))
      } catch { }
    }
    return animeIds
  }

  /** Convert anime IDs array to the stored format: ["123","456",...] */
  private serializeJsonData(animeIds: number[]): string {
    return JSON.stringify(animeIds.map(id => String(id)))
  }

  /**
   * Deduplicate studio names in comma-separated string
   * Example: "Gekkou, Gekkou" -> "Gekkou"
   * Example: "Zero-G, Liber, Zero-G" -> "Zero-G, Liber"
   */
  private deduplicateStudios(studio: string | null): string | null {
    if (!studio) return null;

    const studios = studio
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // Remove duplicates while preserving order
    const uniqueStudios = [...new Set(studios)];

    return uniqueStudios.join(', ');
  }

  // Admin: add an anime to a season (in json_data)
  async addAnimeToSeason(seasonId: number, animeId: number) {
    const season = await this.findById(seasonId)
    if (!season) return null

    const animeIds = this.normalizeJsonData(season.json_data)
    if (!animeIds.includes(animeId)) animeIds.push(animeId)

    await this.prisma.$executeRaw`
      UPDATE ak_animes_saisons
      SET json_data = ${this.serializeJsonData(animeIds)}
      WHERE id_saison = ${seasonId}
    `

    // Invalidate caches
    await this.cacheService.del(`season:${seasonId}`)
    await this.cacheService.del(`season_animes:${seasonId}`)
    await this.cacheService.del('seasons:all')
    await this.cacheService.del('seasons:current')
    // Invalidate homepage cache since seasonal anime changed
    await this.cacheService.invalidateHomepageSeason()

    return { success: true, seasonId, animeId }
  }

  // Admin: remove an anime from a season
  async removeAnimeFromSeason(seasonId: number, animeId: number) {
    const season = await this.findById(seasonId)
    if (!season) return null

    const animeIds = this.normalizeJsonData(season.json_data)
    const before = animeIds.length
    const filtered = animeIds.filter((id) => id !== animeId)

    if (filtered.length !== before) {
      await this.prisma.$executeRaw`
        UPDATE ak_animes_saisons
        SET json_data = ${this.serializeJsonData(filtered)}
        WHERE id_saison = ${seasonId}
      `
      await this.cacheService.del(`season:${seasonId}`)
      await this.cacheService.del(`season_animes:${seasonId}`)
      await this.cacheService.del('seasons:all')
      await this.cacheService.del('seasons:current')
      // Invalidate homepage cache since seasonal anime changed
      await this.cacheService.invalidateHomepageSeason()
    }
    return { success: true, seasonId, animeId }
  }

  // Admin: update season status
  async updateSeasonStatus(seasonId: number, statut: number) {
    const season = await this.findById(seasonId)
    if (!season) return null

    await this.prisma.$executeRaw`
      UPDATE ak_animes_saisons
      SET statut = ${statut}
      WHERE id_saison = ${seasonId}
    `

    // Invalidate caches
    await this.cacheService.del(`season:${seasonId}`)
    await this.cacheService.del(`season_animes:${seasonId}`)
    await this.cacheService.del('seasons:all')
    await this.cacheService.del('seasons:current')
    // Invalidate homepage cache since season status affects current season
    await this.cacheService.invalidateHomepageSeason()

    return { success: true, seasonId, statut }
  }

  // Admin: set a season as the current season (only one can be current at a time)
  async setCurrentSeason(seasonId: number, isCurrent: boolean) {
    const season = await this.findById(seasonId)
    if (!season) return null

    if (isCurrent) {
      // Unset all seasons and set the target one in a single query to avoid Accelerate timeout
      await this.prisma.$executeRaw`
        UPDATE ak_animes_saisons
        SET current_season = CASE WHEN id_saison = ${seasonId} THEN true ELSE false END
        WHERE current_season = true OR id_saison = ${seasonId}
      `
    } else {
      // Just unset this specific season
      await this.prisma.$executeRaw`
        UPDATE ak_animes_saisons
        SET current_season = false
        WHERE id_saison = ${seasonId}
      `
    }

    // Invalidate all season-related caches
    await this.cacheService.del(`season:${seasonId}`)
    await this.cacheService.del(`season_animes:${seasonId}`)
    await this.cacheService.del('seasons:all')
    await this.cacheService.del('seasons:current')
    await this.cacheService.del('seasons:last-created')
    await this.cacheService.invalidateHomepageSeason()

    return { success: true, seasonId, currentSeason: isCurrent }
  }

  // Admin: delete a season
  async deleteSeason(seasonId: number) {
    const season = await this.findById(seasonId)
    if (!season) return null

    await this.prisma.$executeRaw`
      DELETE FROM ak_animes_saisons
      WHERE id_saison = ${seasonId}
    `

    // Invalidate caches
    await this.cacheService.del(`season:${seasonId}`)
    await this.cacheService.del(`season_animes:${seasonId}`)
    await this.cacheService.del('seasons:all')
    await this.cacheService.del('seasons:current')
    await this.cacheService.invalidateHomepageSeason()

    return { success: true, seasonId }
  }
}
