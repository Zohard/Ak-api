import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';

@Injectable()
export class SeasonsService {
  private readonly logger = new Logger(SeasonsService.name);

  constructor(private prisma: PrismaService) {}

  async findAll() {
    try {
      const seasons = await this.prisma.$queryRaw`
        SELECT id_saison, saison, annee, statut, json_data
        FROM ak_animes_saisons
        ORDER BY annee DESC, saison DESC
      `;
      
      return seasons;
    } catch (error) {
      this.logger.error('Error fetching seasons:', error);
      throw error;
    }
  }

  async findCurrent() {
    try {
      const currentSeason = await this.prisma.$queryRaw`
        SELECT id_saison, saison, annee, statut, json_data
        FROM ak_animes_saisons
        WHERE statut = 1
        ORDER BY annee DESC, saison DESC
        LIMIT 1
      `;
      
      return Array.isArray(currentSeason) && currentSeason.length > 0 ? currentSeason[0] : null;
    } catch (error) {
      this.logger.error('Error fetching current season:', error);
      throw error;
    }
  }

  async findById(id: number) {
    try {
      const season = await this.prisma.$queryRaw`
        SELECT id_saison, saison, annee, statut, json_data
        FROM ak_animes_saisons
        WHERE id_saison = ${id}
      `;
      
      return Array.isArray(season) && season.length > 0 ? season[0] : null;
    } catch (error) {
      this.logger.error(`Error fetching season with ID ${id}:`, error);
      throw error;
    }
  }

  async getSeasonAnimes(seasonId: number) {
    try {
      // First get the season data to extract anime IDs from json_data
      const season = await this.findById(seasonId);
      if (!season) {
        return [];
      }

      let animeIds: number[] = [];
      
      // Parse json_data to get anime IDs
      if (season.json_data) {
        try {
          const jsonData = typeof season.json_data === 'string' 
            ? JSON.parse(season.json_data) 
            : season.json_data;
          
          // Handle different possible JSON structures
          if (Array.isArray(jsonData)) {
            animeIds = jsonData;
          } else if (jsonData.animes && Array.isArray(jsonData.animes)) {
            animeIds = jsonData.animes;
          } else if (jsonData.anime_ids && Array.isArray(jsonData.anime_ids)) {
            animeIds = jsonData.anime_ids;
          }
        } catch (parseError) {
          this.logger.error('Error parsing season json_data:', parseError);
        }
      }

      if (animeIds.length === 0) {
        return [];
      }

      // Create a parameterized query with the anime IDs
      const placeholders = animeIds.map((_, index) => `$${index + 1}::integer`).join(', ');
      
      const animes = await this.prisma.$queryRawUnsafe(`
        SELECT 
          "id_anime" as id,
          "id_anime",
          "nice_url",
          "titre",
          "titre_orig",
          "annee",
          "nb_ep",
          "image",
          "studio",
          "synopsis",
          "statut",
          "realisateur",
          "nb_reviews",
          "moyennenotes",
          "date_ajout",
          "format"
        FROM ak_animes
        WHERE "id_anime" IN (${placeholders})
        ORDER BY "titre"
      `, ...animeIds);

      // Add format field if missing (default to 'Série TV')
      return (animes as any[]).map((anime: any) => ({
        ...anime,
        format: anime.format || 'Série TV'
      }));

    } catch (error) {
      this.logger.error(`Error fetching animes for season ${seasonId}:`, error);
      throw error;
    }
  }
}