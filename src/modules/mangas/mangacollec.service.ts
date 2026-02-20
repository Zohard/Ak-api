import { Injectable, Logger } from '@nestjs/common';
import { NautiljonVolumeInfo } from './nautiljon.service';

interface MangaCollecToken {
  access_token: string;
  expires_at: number;
}

interface MangaCollecSeries {
  id: number;
  title: string;
  title_original?: string;
}

interface MangaCollecVolume {
  id: number;
  number: number;
  isbn?: string;
  release_date?: string;
  image_url?: string;
  asin?: string;
}

@Injectable()
export class MangaCollecService {
  private readonly logger = new Logger(MangaCollecService.name);
  private readonly BASE_URL = 'https://api.mangacollec.com';
  private readonly CLIENT_ID = '9b0ab8e2-08bd-4e2e-9516-2266e1e68632';
  private readonly CLIENT_SECRET = 'glDsUcgazNsIgJVq2geGW9gKPJbWMTzCXEnoPlKu';

  private token: MangaCollecToken | null = null;
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_DELAY = 1500;
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes
  private responseCache = new Map<string, { data: any; timestamp: number }>();

  private async authenticate(): Promise<string> {
    if (this.token && Date.now() < this.token.expires_at) {
      return this.token.access_token;
    }

    const email = process.env.MANGACOLLEC_EMAIL;
    const password = process.env.MANGACOLLEC_PASSWORD;

    if (!email || !password) {
      throw new Error('MANGACOLLEC_EMAIL and MANGACOLLEC_PASSWORD must be set');
    }

    this.logger.debug('Authenticating with MangaCollec API...');

    const res = await fetch(`${this.BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.CLIENT_ID,
        client_secret: this.CLIENT_SECRET,
        grant_type: 'password',
        username: email,
        password: password,
      }),
    });

    if (!res.ok) {
      throw new Error(`MangaCollec auth failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    this.token = {
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in - 60) * 1000, // refresh 60s before expiry
    };

    this.logger.log('MangaCollec authentication successful');
    return this.token.access_token;
  }

  private async apiGet<T>(path: string): Promise<T> {
    // Check cache
    const cached = this.responseCache.get(path);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data as T;
    }

    // Rate limiting
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.MIN_REQUEST_DELAY) {
      await new Promise(resolve => setTimeout(resolve, this.MIN_REQUEST_DELAY - elapsed));
    }
    this.lastRequestTime = Date.now();

    let token: string;
    try {
      token = await this.authenticate();
    } catch (e) {
      throw e;
    }

    const url = `${this.BASE_URL}${path}`;
    this.logger.debug(`GET ${url}`);

    let res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Auto-refresh on 401
    if (res.status === 401) {
      this.token = null;
      token = await this.authenticate();
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    if (!res.ok) {
      throw new Error(`MangaCollec API error: HTTP ${res.status} for ${path}`);
    }

    const data = await res.json();

    // Cache response
    this.responseCache.set(path, { data, timestamp: Date.now() });

    // Prune old cache entries
    if (this.responseCache.size > 200) {
      for (const [key, val] of this.responseCache) {
        if (Date.now() - val.timestamp > this.CACHE_TTL) {
          this.responseCache.delete(key);
        }
      }
    }

    return data as T;
  }

  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  private findBestSeries(series: MangaCollecSeries[], query: string): MangaCollecSeries | null {
    if (!series.length) return null;

    const normalizedQuery = this.normalizeTitle(query);

    // Exact match
    const exact = series.find(s => this.normalizeTitle(s.title) === normalizedQuery);
    if (exact) return exact;

    // Contains match
    const contains = series.find(s => this.normalizeTitle(s.title).includes(normalizedQuery));
    if (contains) return contains;

    // Reverse contains
    const reverseContains = series.find(s => normalizedQuery.includes(this.normalizeTitle(s.title)));
    if (reverseContains) return reverseContains;

    // Fallback to first result
    return series[0];
  }

  /**
   * Search for a specific volume on MangaCollec
   * Returns data in NautiljonVolumeInfo format for compatibility
   */
  async searchVolume(mangaTitle: string, volumeNumber: number): Promise<NautiljonVolumeInfo | null> {
    try {
      const searchPath = `/v2/series?search=${encodeURIComponent(mangaTitle)}`;
      const searchResult = await this.apiGet<any>(searchPath);

      const seriesList: MangaCollecSeries[] = searchResult?.data || searchResult || [];
      const bestSeries = this.findBestSeries(
        Array.isArray(seriesList) ? seriesList : [],
        mangaTitle,
      );

      if (!bestSeries) {
        this.logger.debug(`No series found on MangaCollec for "${mangaTitle}"`);
        return null;
      }

      this.logger.debug(`Found series on MangaCollec: "${bestSeries.title}" (id: ${bestSeries.id})`);

      // Get series details with volumes
      const details = await this.apiGet<any>(`/v2/series/${bestSeries.id}`);
      const volumes: MangaCollecVolume[] = details?.volumes || [];
      const publishers: Array<{ title: string }> = details?.publishers || [];
      const publisher = publishers[0]?.title;

      // Find matching volume
      const volume = volumes.find(v => v.number === volumeNumber);

      if (!volume) {
        this.logger.debug(`Volume ${volumeNumber} not found in series "${bestSeries.title}" (has ${volumes.length} volumes)`);
        return null;
      }

      // Format release date to YYYY-MM-DD
      let releaseDate: string | undefined;
      if (volume.release_date) {
        const d = new Date(volume.release_date);
        if (!isNaN(d.getTime())) {
          releaseDate = d.toISOString().split('T')[0];
        }
      }

      // Build cover URL
      let coverUrl: string | undefined;
      if (volume.image_url) {
        coverUrl = volume.image_url.startsWith('http')
          ? volume.image_url
          : `https://api.mangacollec.com${volume.image_url}`;
      }

      this.logger.log(
        `Found volume on MangaCollec: ${bestSeries.title} #${volumeNumber} ` +
        `(ISBN: ${volume.isbn || 'N/A'}, Date: ${releaseDate || 'N/A'})`,
      );

      return {
        volumeNumber,
        title: `${bestSeries.title} Tome ${volumeNumber}`,
        isbn: volume.isbn?.replace(/[-\s]/g, '') || undefined,
        releaseDate,
        coverUrl,
        publisher,
        source: 'mangacollec',
        sourceUrl: `https://www.mangacollec.com/manga/${bestSeries.id}`,
      };
    } catch (error: any) {
      this.logger.error(`MangaCollec searchVolume failed for "${mangaTitle}" #${volumeNumber}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all volumes for a series on MangaCollec
   * Returns data in NautiljonVolumeInfo[] format for compatibility
   */
  async getSeriesVolumes(mangaTitle: string): Promise<NautiljonVolumeInfo[]> {
    try {
      const searchPath = `/v2/series?search=${encodeURIComponent(mangaTitle)}`;
      const searchResult = await this.apiGet<any>(searchPath);

      const seriesList: MangaCollecSeries[] = searchResult?.data || searchResult || [];
      const bestSeries = this.findBestSeries(
        Array.isArray(seriesList) ? seriesList : [],
        mangaTitle,
      );

      if (!bestSeries) {
        this.logger.debug(`No series found on MangaCollec for "${mangaTitle}"`);
        return [];
      }

      const details = await this.apiGet<any>(`/v2/series/${bestSeries.id}`);
      const volumes: MangaCollecVolume[] = details?.volumes || [];
      const publishers: Array<{ title: string }> = details?.publishers || [];
      const publisher = publishers[0]?.title;

      return volumes
        .filter(v => v.number > 0)
        .map(v => {
          let releaseDate: string | undefined;
          if (v.release_date) {
            const d = new Date(v.release_date);
            if (!isNaN(d.getTime())) {
              releaseDate = d.toISOString().split('T')[0];
            }
          }

          let coverUrl: string | undefined;
          if (v.image_url) {
            coverUrl = v.image_url.startsWith('http')
              ? v.image_url
              : `https://api.mangacollec.com${v.image_url}`;
          }

          return {
            volumeNumber: v.number,
            title: `${bestSeries.title} Tome ${v.number}`,
            isbn: v.isbn?.replace(/[-\s]/g, '') || undefined,
            releaseDate,
            coverUrl,
            publisher,
            source: 'mangacollec' as string,
            sourceUrl: `https://www.mangacollec.com/manga/${bestSeries.id}`,
          };
        })
        .sort((a, b) => a.volumeNumber - b.volumeNumber);
    } catch (error: any) {
      this.logger.error(`MangaCollec getSeriesVolumes failed for "${mangaTitle}": ${error.message}`);
      return [];
    }
  }
}
