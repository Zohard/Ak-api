import { Injectable, Logger } from '@nestjs/common';
import { load, CheerioAPI } from 'cheerio';

export interface NautiljonVolumeInfo {
  volumeNumber: number;
  title?: string;
  isbn?: string;
  releaseDate?: string;
  coverUrl?: string;
  description?: string;
  publisher?: string;
  pageCount?: number;
  source: string;
  sourceUrl?: string;
}

export interface NautiljonMangaInfo {
  title: string;
  originalTitle?: string;
  volumes?: number;
  url: string;
}

@Injectable()
export class NautiljonService {
  private readonly logger = new Logger(NautiljonService.name);
  private readonly BASE_URL = 'https://www.nautiljon.com';
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes
  private requestCache = new Map<string, { data: string; timestamp: number }>();
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_DELAY = 1500; // 1.5 seconds between requests (be nice to Nautiljon)

  /**
   * Fetch HTML with rate limiting and caching
   */
  private async fetchHtml(url: string): Promise<CheerioAPI> {
    // Check cache
    const cached = this.requestCache.get(url);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      this.logger.debug(`Cache hit for ${url}`);
      return load(cached.data);
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.MIN_REQUEST_DELAY) {
      await new Promise(resolve => setTimeout(resolve, this.MIN_REQUEST_DELAY - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();

    // Fetch with retries
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          if (res.status === 429 && attempt < 3) {
            const delay = 3000 * attempt;
            this.logger.warn(`Rate limited by Nautiljon, waiting ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw new Error(`HTTP ${res.status}`);
        }

        const html = await res.text();

        // Cache the result
        this.requestCache.set(url, { data: html, timestamp: Date.now() });

        // Clear old cache entries
        if (this.requestCache.size > 100) {
          const keysToDelete: string[] = [];
          this.requestCache.forEach((value, key) => {
            if (Date.now() - value.timestamp > this.CACHE_TTL) {
              keysToDelete.push(key);
            }
          });
          keysToDelete.forEach(key => this.requestCache.delete(key));
        }

        return load(html);
      } catch (error: any) {
        lastError = error;
        if (attempt < 3) {
          const delay = 2000 * attempt;
          this.logger.warn(`Nautiljon fetch attempt ${attempt} failed: ${error.message}, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Failed to fetch from Nautiljon');
  }

  /**
   * Format manga name for Nautiljon URL
   */
  private formatUrlSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '+') // Replace spaces with +
      .replace(/\++/g, '+') // Collapse multiple +
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing -
  }

  /**
   * Search for a manga on Nautiljon
   */
  async searchManga(query: string): Promise<NautiljonMangaInfo | null> {
    try {
      const searchUrl = `${this.BASE_URL}/mangas/?q=${encodeURIComponent(query)}`;
      this.logger.debug(`Searching Nautiljon: ${searchUrl}`);

      const $ = await this.fetchHtml(searchUrl);

      // Get first result from search
      const firstResult = $('div.search_list div.search_item').first();
      if (!firstResult.length) {
        // Try direct URL
        const directUrl = `${this.BASE_URL}/mangas/${this.formatUrlSlug(query)}.html`;
        try {
          const $direct = await this.fetchHtml(directUrl);
          const title = $direct('h1.h1titre').first().text().trim();
          if (title) {
            return {
              title,
              url: directUrl,
            };
          }
        } catch {
          return null;
        }
        return null;
      }

      const link = firstResult.find('a').first();
      const href = link.attr('href');
      const title = link.text().trim();

      if (!href) return null;

      return {
        title,
        url: href.startsWith('http') ? href : `${this.BASE_URL}${href}`,
      };
    } catch (error: any) {
      this.logger.error(`Error searching Nautiljon for "${query}": ${error.message}`);
      return null;
    }
  }

  /**
   * Get manga page and extract volume list URL
   */
  async getMangaVolumesPageUrl(mangaTitle: string): Promise<string | null> {
    try {
      // Try direct manga URL first
      const mangaSlug = this.formatUrlSlug(mangaTitle);
      const mangaUrl = `${this.BASE_URL}/mangas/${mangaSlug}.html`;

      this.logger.debug(`Trying direct manga URL: ${mangaUrl}`);

      try {
        const $ = await this.fetchHtml(mangaUrl);

        // Check if we're on the right page
        const pageTitle = $('h1.h1titre').first().text().trim();
        if (pageTitle) {
          // Found the manga page, return its base URL for volume construction
          return mangaUrl.replace('.html', '');
        }
      } catch {
        this.logger.debug(`Direct URL failed, trying search...`);
      }

      // Fallback to search
      const manga = await this.searchManga(mangaTitle);
      if (!manga) return null;

      return manga.url.replace('.html', '');
    } catch (error: any) {
      this.logger.error(`Error getting manga volumes page: ${error.message}`);
      return null;
    }
  }

  /**
   * Get volume info from Nautiljon
   * URL format: /mangas/{manga-name}/volume-{number},{id}.html
   * Or we can try to find via the volumes listing page
   */
  async getVolumeInfo(mangaTitle: string, volumeNumber: number): Promise<NautiljonVolumeInfo | null> {
    try {
      // Find the correct manga base URL (tries direct slug, then search)
      const mangaBaseUrl = await this.getMangaVolumesPageUrl(mangaTitle);
      if (!mangaBaseUrl) {
        this.logger.debug(`Could not find manga "${mangaTitle}" on Nautiljon`);
        return null;
      }

      // Try to access the volumes listing
      const volumesListUrl = `${mangaBaseUrl}/volumes.html`;
      this.logger.debug(`Fetching volumes list: ${volumesListUrl}`);

      let volumeUrl: string | null = null;

      try {
        const $ = await this.fetchHtml(volumesListUrl);

        // Look for the specific volume link
        // Nautiljon volume links are typically like: /mangas/bleach/volume-21,129.html
        $('a').each((_, el) => {
          const href = $(el).attr('href');
          if (href) {
            // Match pattern: volume-{number}, where number matches our volumeNumber
            const match = href.match(/volume-(\d+),\d+\.html$/);
            if (match && parseInt(match[1], 10) === volumeNumber) {
              volumeUrl = href.startsWith('http') ? href : `${this.BASE_URL}${href}`;
              return false; // Break out of each loop
            }
          }
        });
      } catch (error) {
        this.logger.debug(`Volumes list not accessible: ${error.message}`);
      }

      // If we didn't find the volume URL, try alternative patterns
      if (!volumeUrl) {
        const patterns = [
          `${mangaBaseUrl}/volume-${volumeNumber}.html`,
        ];

        for (const pattern of patterns) {
          try {
            const $ = await this.fetchHtml(pattern);
            const title = $('h1.h1titre').text().trim();
            if (title) {
              volumeUrl = pattern;
              break;
            }
          } catch {
            continue;
          }
        }
      }

      if (!volumeUrl) {
        this.logger.debug(`Could not find volume ${volumeNumber} for "${mangaTitle}" on Nautiljon`);
        return null;
      }

      return this.scrapeVolumePage(volumeUrl, volumeNumber);
    } catch (error: any) {
      this.logger.error(`Error getting volume info from Nautiljon: ${error.message}`);
      return null;
    }
  }

  /**
   * Scrape volume details from a Nautiljon volume page
   */
  public async scrapeVolumePage(url: string, expectedVolumeNumber: number): Promise<NautiljonVolumeInfo | null> {
    try {
      this.logger.debug(`Scraping volume page: ${url}`);
      const $ = await this.fetchHtml(url);

      // Extract title
      const h1 = $('h1.h1titre').first();
      h1.find('a.buttonlike').remove();
      const title = h1.text().trim();

      if (!title) {
        this.logger.debug(`No title found on volume page: ${url}`);
        return null;
      }

      // Extract volume number from title if needed
      let volumeNumber = expectedVolumeNumber;
      const volMatch = title.match(/vol\.?\s*(\d+)|tome\s*(\d+)|#(\d+)/i);
      if (volMatch) {
        volumeNumber = parseInt(volMatch[1] || volMatch[2] || volMatch[3], 10);
      }

      // Extract info from the info box (usually in a table or div.info_fiche)
      const infoBox = $('div.info_fiche, table.info_fiche').first();

      // ISBN - look for ISBN-13, ISBN or Code EAN
      let isbn: string | undefined;

      // Try reliable itemprop first
      const isbnItemProp = $('[itemprop="isbn"]').text().trim();
      if (isbnItemProp) {
        isbn = isbnItemProp.replace(/[-\s]/g, '');
      } else {
        // Fallback to text matching
        const infoText = infoBox.text() + $('body').text();
        const isbnMatch = infoText.match(/(?:ISBN(?:-13)?|Code\s+EAN)[\s:]*(\d[\d\s-]{10,16})/i);
        if (isbnMatch) {
          isbn = isbnMatch[1].replace(/[-\s]/g, '');
        }
      }

      // Release date - look for "Date de sortie", "Date de parution" or "Sortie"
      let releaseDate: string | undefined;

      // For date, we prefer the VF date if available. VO date often has itemprop="datePublished" but we want VF.
      // Search specifically for "Date de parution VF" or "Date de sortie"
      const bodyText = $('body').text();
      const datePatterns = [
        /Date\s+de\s+parution\s+VF\s*:\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
        /Date\s+de\s+sortie\s*:\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
        /Sortie\s*:\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
        // Fallback to any date format if strictly found in the details list?
        // Be careful not to pick up unrelated dates.
      ];

      for (const pattern of datePatterns) {
        const dateMatch = bodyText.match(pattern);
        if (dateMatch) {
          // Convert DD/MM/YYYY to YYYY-MM-DD
          const parts = dateMatch[1].split(/[\/\-]/);
          if (parts.length === 3) {
            const [day, month, year] = parts;
            releaseDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            break;
          }
        }
      }

      // If no VF date found, fallback to simple date finder in specific areas if possible, or general fallback
      if (!releaseDate) {
        const generalDateMatch = bodyText.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/);
        if (generalDateMatch) {
          const parts = generalDateMatch[1].split(/[\/\-]/);
          if (parts.length === 3) {
            const [day, month, year] = parts;
            releaseDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
        }
      }

      // Cover image
      let coverUrl: string | undefined;
      // Image fiche usually has class image_fiche
      const imageElement = $('.image_fiche img').first();
      if (imageElement.length) {
        let imgSrc = imageElement.attr('src') || imageElement.attr('data-src');
        if (imgSrc) {
          // Convert mini to full size
          imgSrc = imgSrc.replace('/mini/', '/').replace(/\?.*$/, '');
          coverUrl = imgSrc.startsWith('http') ? imgSrc : `${this.BASE_URL}${imgSrc}`;
        }
      }

      // Fallback for cover if not found in image_fiche (sometimes just in a div)
      if (!coverUrl) {
        // Try to look for an image that looks like a cover (often in the stats/info area)
        // The user snippet showed an image in li.nav_vols but that's a small one. 
        // Use the `href` of the link around it if possible, or the image itself
        const probableCover = $('[itemprop="image"]').attr('src') || $('.cover img').attr('src');
        if (probableCover) {
          let imgSrc = probableCover;
          imgSrc = imgSrc.replace('/mini/', '/').replace(/\?.*$/, '');
          coverUrl = imgSrc.startsWith('http') ? imgSrc : `${this.BASE_URL}${imgSrc}`;
        }
      }

      // Description extraction disabled by user request
      let description: string | undefined;
      // const descElement = $('div.description').first().clone();
      // descElement.find('div.fader').remove();
      // const descText = descElement.text().trim();
      // if (descText && descText.length > 10) {
      //   description = descText;
      // }

      // Publisher
      let publisher: string | undefined;
      // Try itemprop="publisher"
      const publisherItemProp = $('[itemprop="publisher"] [itemprop="legalName"]').first().text().trim();
      if (publisherItemProp) {
        publisher = publisherItemProp;
      } else {
        const publisherMatch = bodyText.match(/[eé]diteur(?:\s+VF)?[\s:]*([^\n\r,]+)/i);
        if (publisherMatch) {
          publisher = publisherMatch[1].trim();
        }
      }

      // Page count
      let pageCount: number | undefined;
      const pageMatch = bodyText.match(/(\d+)\s*pages?/i) || $('[itemprop="numberOfPages"]').text().match(/(\d+)/);
      if (pageMatch) {
        pageCount = parseInt(pageMatch[1], 10);
      }

      this.logger.log(`Found volume on Nautiljon: ${title} (ISBN: ${isbn || 'N/A'}, Date: ${releaseDate || 'N/A'})`);

      return {
        volumeNumber,
        title,
        isbn,
        releaseDate,
        coverUrl,
        description,
        publisher,
        pageCount,
        source: 'nautiljon',
        sourceUrl: url,
      };
    } catch (error: any) {
      this.logger.error(`Error scraping volume page ${url}: ${error.message}`);
      return null;
    }
  }

  /**
   * Search for volume by title and number (for fallback usage)
   * Tries multiple search strategies
   */
  async searchVolume(mangaTitle: string, volumeNumber: number): Promise<NautiljonVolumeInfo | null> {
    // Strategy 1: Direct volume page access
    const directResult = await this.getVolumeInfo(mangaTitle, volumeNumber);
    if (directResult?.isbn || directResult?.releaseDate) {
      return directResult;
    }

    // Strategy 2: Search with volume in query
    try {
      const searchQueries = [
        `${mangaTitle} Tome ${volumeNumber}`,
        `${mangaTitle} Vol ${volumeNumber}`,
        `${mangaTitle} T${volumeNumber}`,
      ];

      for (const query of searchQueries) {
        const searchUrl = `${this.BASE_URL}/mangas/?q=${encodeURIComponent(query)}`;

        try {
          const $ = await this.fetchHtml(searchUrl);

          // Look for volume links in search results
          let volumePageUrl: string | null = null;
          $('a').each((_, el) => {
            const href = $(el).attr('href');
            if (href && href.includes('/volume-') && href.includes(`-${volumeNumber},`)) {
              volumePageUrl = href.startsWith('http') ? href : `${this.BASE_URL}${href}`;
              return false;
            }
          });

          if (volumePageUrl) {
            return this.scrapeVolumePage(volumePageUrl, volumeNumber);
          }
        } catch {
          continue;
        }
      }
    } catch (error: any) {
      this.logger.debug(`Search strategy failed: ${error.message}`);
    }

    return directResult; // Return whatever we found, even if incomplete
  }

  /**
   * Scrape the volumes list page to get all volumes at once
   * URL: /mangas/{slug}/volumes.html
   */
  async scrapeVolumeList(mangaTitle: string): Promise<NautiljonVolumeInfo[]> {
    try {
      // Find the correct manga base URL (tries direct slug, then search)
      const mangaBaseUrl = await this.getMangaVolumesPageUrl(mangaTitle);
      if (!mangaBaseUrl) {
        this.logger.warn(`Could not find manga "${mangaTitle}" on Nautiljon for volume list`);
        return [];
      }

      const url = `${mangaBaseUrl}/volumes.html`;
      this.logger.debug(`Scraping volumes list: ${url}`);

      // We might need to handle 404 if the volumes page doesn't exist (e.g. one-shot)
      // fetchHtml will throw, so we catch it
      let $;
      try {
        $ = await this.fetchHtml(url);
      } catch (e) {
        this.logger.warn(`Could not fetch volumes list for ${mangaTitle}: ${e.message}`);
        return [];
      }

      const volumes: NautiljonVolumeInfo[] = [];

      // Structure 1: div.unBook (common for volumes list)
      if ($('.unBook').length > 0) {
        $('.unBook').each((_, el) => {
          const $el = $(el);

          // Title/Link
          const link = $el.find('h3 a, .titre_vol a').first();
          const href = link.attr('href');
          const fullTitle = link.text().trim();

          if (!href) return;

          // Extract volume number
          // Titles are usually "Naruto 1" or "Naruto Vol. 1"
          let volumeNumber = 0;
          const volMatch = fullTitle.match(/(\d+)$/);
          if (volMatch) {
            volumeNumber = parseInt(volMatch[1], 10);
          }

          if (volumeNumber === 0) return;

          // Release date is often in a text node or span
          // Structure can vary, look for date pattern in the element text
          const text = $el.text();
          let releaseDate: string | undefined;
          const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);
          if (dateMatch) {
            const [day, month, year] = dateMatch[1].split('/');
            releaseDate = `${year}-${month}-${day}`;
          }

          // Cover image
          let coverUrl: string | undefined;
          const img = $el.find('img').first();
          let imgSrc = img.attr('src') || img.attr('data-src');
          if (imgSrc) {
            imgSrc = imgSrc.replace('/mini/', '/').replace(/\?.*$/, '');
            coverUrl = imgSrc.startsWith('http') ? imgSrc : `${this.BASE_URL}${imgSrc}`;
          }

          volumes.push({
            volumeNumber,
            title: fullTitle,
            releaseDate,
            coverUrl,
            source: 'nautiljon',
            sourceUrl: href.startsWith('http') ? href : `${this.BASE_URL}${href}`,
          });
        });
      }
      // Structure 2: Table list (older layout)
      else if ($('table.liste_volumes').length > 0) {
        $('table.liste_volumes tr').each((_, el) => {
          // Implementation depends on specific table structure
          // Let's assume standard table rows
        });
      }

      this.logger.log(`Found ${volumes.length} volumes in list for ${mangaTitle}`);
      return volumes;
    } catch (error) {
      this.logger.error(`Error scraping volume list for ${mangaTitle}: ${error.message}`);
      return [];
    }
  }
}
