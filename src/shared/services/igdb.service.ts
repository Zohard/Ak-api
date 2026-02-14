import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';

interface IgdbGame {
  id: number;
  name: string;
  summary?: string;
  first_release_date?: number;
  cover?: {
    id: number;
    url: string;
    image_id: string;
  };
  screenshots?: Array<{
    id: number;
    image_id: string;
  }>;
  videos?: Array<{
    id: number;
    video_id: string;
    name?: string;
  }>;
  genres?: Array<{ id: number; name: string }>;
  platforms?: Array<{ id: number; name: string; abbreviation?: string }>;
  involved_companies?: Array<{
    company: {
      id: number;
      name: string;
      logo?: {
        id: number;
        image_id: string;
      };
    };
    publisher: boolean;
    developer: boolean;
  }>;
  release_dates?: Array<{
    id: number;
    date?: number;
    region?: number;
    platform?: { id: number; name: string };
  }>;
}

@Injectable()
export class IgdbService {
  private readonly logger = new Logger(IgdbService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(private prisma: PrismaService) {
    this.clientId = process.env.IGDB_CLIENT_ID || '';
    this.clientSecret = process.env.IGDB_CLIENT_SECRET || '';

    if (!this.clientId || !this.clientSecret) {
      this.logger.warn('IGDB credentials not configured');
    }
  }

  async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    if (!this.clientId || !this.clientSecret) {
      throw new Error('IGDB credentials not configured');
    }

    try {
      const response = await fetch(
        `https://id.twitch.tv/oauth2/token?client_id=${this.clientId}&client_secret=${this.clientSecret}&grant_type=client_credentials`,
        { method: 'POST' }
      );

      if (!response.ok) {
        throw new Error(`Failed to get access token: ${response.statusText}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      // Set expiry to 5 minutes before actual expiry
      this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;

      this.logger.log('Successfully obtained IGDB access token');

      if (!this.accessToken) {
        throw new Error('Failed to obtain access token from response');
      }

      return this.accessToken;
    } catch (error) {
      this.logger.error('Failed to get IGDB access token', error);
      throw error;
    }
  }

  async searchGames(query: string, limit = 10): Promise<IgdbGame[]> {
    const token = await this.getAccessToken();

    try {
      const response = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: {
          'Client-ID': this.clientId,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'text/plain',
        },
        body: `
          search "${query}";
          fields name, summary, first_release_date, category, cover.url, cover.image_id,
                 screenshots.image_id,
                 videos.video_id, videos.name,
                 genres.name, platforms.name, platforms.abbreviation,
                 involved_companies.company.name, involved_companies.company.logo.image_id, involved_companies.publisher, involved_companies.developer,
                 release_dates.date, release_dates.region, release_dates.platform;
          limit ${limit};
        `,
      });

      if (!response.ok) {
        throw new Error(`IGDB API error: ${response.statusText}`);
      }

      const games = await response.json();
      this.logger.log(`Found ${games.length} games for query: ${query}`);
      return games;
    } catch (error) {
      this.logger.error('Failed to search games on IGDB', error);
      throw error;
    }
  }

  /**
   * Get games released in a specific month
   * @param year - Year (e.g., 2024)
   * @param month - Month (1-12)
   * @param limit - Maximum number of results
   * @param offset - Offset for pagination
   */
  async getGamesByReleaseMonth(
    year: number,
    month: number,
    limit = 50,
    offset = 0
  ): Promise<IgdbGame[]> {
    const token = await this.getAccessToken();

    // Calculate start and end timestamps for the month
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 1));

    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);

    try {
      const response = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: {
          'Client-ID': this.clientId,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'text/plain',
        },
        body: `
          where first_release_date >= ${startTimestamp} & first_release_date < ${endTimestamp};
          fields name, summary, first_release_date, category, cover.url, cover.image_id,
                 screenshots.image_id,
                 videos.video_id, videos.name,
                 genres.name, platforms.name, platforms.abbreviation,
                 involved_companies.company.name, involved_companies.company.logo.image_id, involved_companies.publisher, involved_companies.developer,
                 release_dates.date, release_dates.region, release_dates.platform;
          sort first_release_date asc;
          limit ${limit};
          offset ${offset};
        `,
      });

      if (!response.ok) {
        throw new Error(`IGDB API error: ${response.statusText}`);
      }

      const games = await response.json();
      this.logger.log(`Found ${games.length} games for ${year}-${String(month).padStart(2, '0')} (${startTimestamp} to ${endTimestamp})`);

      // Log if no games found to help with debugging
      if (games.length === 0) {
        this.logger.warn(`No games found for ${year}-${String(month).padStart(2, '0')}. This might be normal if IGDB doesn't have data for this period yet.`);
      }

      return games;
    } catch (error) {
      this.logger.error(`Failed to get games for ${year}-${month}`, error);
      throw error;
    }
  }

  async getGameById(igdbId: number): Promise<IgdbGame | null> {
    const token = await this.getAccessToken();

    try {
      const response = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: {
          'Client-ID': this.clientId,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'text/plain',
        },
        body: `
          where id = ${igdbId};
          fields name, summary, first_release_date, cover.url, cover.image_id,
                 screenshots.image_id,
                 videos.video_id, videos.name,
                 genres.name, platforms.name, platforms.abbreviation,
                 involved_companies.company.name, involved_companies.company.logo.image_id, involved_companies.publisher, involved_companies.developer,
                 release_dates.date, release_dates.region, release_dates.platform;
          limit 1;
        `,
      });

      if (!response.ok) {
        throw new Error(`IGDB API error: ${response.statusText}`);
      }

      const games = await response.json();
      const game = games.length > 0 ? games[0] : null;
      if (game) {
        this.logger.log(`IGDB game data for ID ${igdbId}:`);
        this.logger.log(`Release dates count: ${game.release_dates?.length || 0}`);
        if (game.release_dates) {
          this.logger.log(`Release dates: ${JSON.stringify(game.release_dates, null, 2)}`);
        }
      }
      return game;
    } catch (error) {
      this.logger.error(`Failed to get game ${igdbId} from IGDB`, error);
      throw error;
    }
  }

  /**
   * Download image from IGDB and return base64 data
   */
  async downloadCoverImage(imageId: string, size: 'cover_small' | 'cover_big' | 'screenshot_med' = 'cover_big'): Promise<Buffer | null> {
    try {
      const url = `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`;
      const response = await fetch(url);

      if (!response.ok) {
        this.logger.warn(`Failed to download cover image: ${url}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      this.logger.error('Failed to download cover image', error);
      return null;
    }
  }

  /**
   * Map IGDB region codes to database region names
   * IGDB Region Codes:
   * 1 = Europe
   * 2 = North America
   * 3 = Australia
   * 4 = New Zealand
   * 5 = Japan
   * 6 = China
   * 7 = Asia
   * 8 = Worldwide
   */
  mapRegion(regionCode?: number): 'japon' | 'usa' | 'europe' | 'worldwide' | null {
    if (!regionCode) return null;

    switch (regionCode) {
      case 1: // Europe
        return 'europe';
      case 2: // North America
        return 'usa';
      case 5: // Japan (fixed from 4)
        return 'japon';
      case 8: // Worldwide
        return 'worldwide';
      default:
        return null;
    }
  }

  /**
   * Import a game from IGDB to local database
   */
  async importGame(igdbId: number) {
    // Fetch game data from IGDB
    const igdbGame = await this.getGameById(igdbId);
    if (!igdbGame) {
      throw new NotFoundException(`Game with IGDB ID ${igdbId} not found`);
    }

    this.logger.log(`Importing game: ${igdbGame.name} (IGDB ID: ${igdbId})`);

    // Check if game already exists
    const existing = await this.prisma.$queryRaw<Array<{ idJeu: number }>>`
      SELECT id_jeu as "idJeu" FROM ak_jeux_video WHERE igdb_id = ${igdbId}
    `;

    if (existing && existing.length > 0) {
      this.logger.warn(`Game already exists with ID ${existing[0].idJeu}`);
      return this.prisma.akJeuxVideo.findUnique({
        where: { idJeu: existing[0].idJeu },
      });
    }

    // Build cover URL from IGDB image ID
    const coverUrl = igdbGame.cover?.image_id
      ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${igdbGame.cover.image_id}.jpg`
      : null;

    // Extract first release date
    const firstReleaseYear = igdbGame.first_release_date
      ? new Date(igdbGame.first_release_date * 1000).getFullYear()
      : 0;

    // Extract release dates by region
    let dateSortieJapon: Date | null = null;
    let dateSortieUsa: Date | null = null;
    let dateSortieEurope: Date | null = null;
    let dateSortieWorldwide: Date | null = null;

    if (igdbGame.release_dates) {
      for (const releaseDate of igdbGame.release_dates) {
        if (releaseDate.date) {
          const date = new Date(releaseDate.date * 1000);
          const region = this.mapRegion(releaseDate.region);

          switch (region) {
            case 'japon':
              if (!dateSortieJapon) dateSortieJapon = date;
              break;
            case 'usa':
              if (!dateSortieUsa) dateSortieUsa = date;
              break;
            case 'europe':
              if (!dateSortieEurope) dateSortieEurope = date;
              break;
            case 'worldwide':
              if (!dateSortieWorldwide) dateSortieWorldwide = date;
              break;
          }
        }
      }
    }

    // Extract developers and publishers
    const developers: string[] = [];
    const publishers: string[] = [];

    if (igdbGame.involved_companies) {
      for (const company of igdbGame.involved_companies) {
        if (company.developer && company.company?.name) {
          developers.push(company.company.name);
        }
        if (company.publisher && company.company?.name) {
          publishers.push(company.company.name);
        }
      }
    }

    // Create nice URL from title
    const niceUrl = igdbGame.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Create game in database
    const game = await this.prisma.akJeuxVideo.create({
      data: {
        titre: igdbGame.name,
        niceUrl,
        image: coverUrl,
        annee: firstReleaseYear,
        dateSortieJapon,
        dateSortieUsa,
        dateSortieEurope,
        dateSortieWorldwide,
        developpeur: developers.length > 0 ? developers.join(', ') : null,
        editeur: publishers.length > 0 ? publishers.join(', ') : null,
        plateforme: igdbGame.platforms?.map(p => p.abbreviation || p.name).join(', ') || null,
        presentation: igdbGame.summary || null,
        statut: 1, // Published
        nbClicsDay: 0,
        nbClicsWeek: 0,
        nbClicsMonth: 0,
        dateModification: Math.floor(Date.now() / 1000),
        igdbId: igdbId,
      },
    });

    this.logger.log(`Game imported successfully: ${game.titre} (ID: ${game.idJeu})`);

    return game;
  }
}
