import { Injectable, Logger } from '@nestjs/common';

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

  constructor() {
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
          fields name, summary, first_release_date, cover.url, cover.image_id,
                 screenshots.image_id,
                 videos.video_id, videos.name,
                 genres.name, platforms.name, platforms.abbreviation,
                 involved_companies.company.name, involved_companies.publisher, involved_companies.developer,
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
                 involved_companies.company.name, involved_companies.publisher, involved_companies.developer,
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
}
