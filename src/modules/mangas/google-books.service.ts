import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface GoogleBooksVolume {
  id: string;
  volumeInfo: {
    title: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    industryIdentifiers?: Array<{
      type: string;
      identifier: string;
    }>;
    pageCount?: number;
    categories?: string[];
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
    language?: string;
    infoLink?: string;
  };
}

interface GoogleBooksResponse {
  items?: GoogleBooksVolume[];
  totalItems: number;
}

@Injectable()
export class GoogleBooksService {
  private readonly logger = new Logger(GoogleBooksService.name);
  private readonly GOOGLE_BOOKS_API_URL = 'https://www.googleapis.com/books/v1/volumes';

  constructor(private readonly httpService: HttpService) {}

  /**
   * Check if a book is likely a real manga based on various criteria
   * STRICT mode: only returns true if we're confident it's manga
   */
  private isLikelyManga(item: any, language: 'fr' | 'en' = 'fr'): boolean {
    const volumeInfo = item.volumeInfo;
    const publisher = (volumeInfo.publisher || '').toLowerCase();
    const title = (volumeInfo.title || '').toLowerCase();
    const categories = (volumeInfo.categories || []).join(' ').toLowerCase();
    const description = (volumeInfo.description || '').toLowerCase();

    // ===== EXCLUSION LIST (check first) =====
    // Non-manga publishers (romance, general fiction, etc.)
    const nonMangaPublishers = [
      'harper', 'harpercollins', 'scholastic', 'random house', 'penguin',
      'harlequin', 'j\'ai lu', 'milady', 'pocket', 'fleuve', 'bragelonne',
      'hugo roman', 'city editions', 'archipoche', 'le livre de poche',
      'folio', 'gallimard', 'albin michel', 'robert laffont', 'flammarion',
      'editions addictives', 'collection infinity', 'new romance',
    ];
    if (nonMangaPublishers.some(pub => publisher.includes(pub))) {
      return false;
    }

    // Non-manga title/description patterns (romance, fiction, etc.)
    const nonMangaPatterns = [
      'séductrice', 'seductrice', 'romance', 'love story', 'milliardaire',
      'billionaire', 'dark romance', 'new romance', 'warriors', 'warrior cats',
      'survivors', 'diary of a wimpy', 'cinquante nuances', 'fifty shades',
      'after', 'twilight', 'bad boy', 'alpha', 'new adult',
    ];
    const textToCheck = `${title} ${description}`;
    if (nonMangaPatterns.some(pattern => textToCheck.includes(pattern))) {
      return false;
    }

    // ===== INCLUSION LIST (manga publishers) =====
    if (language === 'fr') {
      // Common French manga publishers
      const frenchMangaPublishers = [
        'glénat', 'glenat', 'pika', 'kana', 'kurokawa', 'ki-oon', 'kioon',
        'delcourt', 'tonkam', 'akata', 'casterman', 'doki-doki', 'dokidoki',
        'komikku', 'panini manga', 'soleil manga', 'mangetsu', 'isan manga',
        'taifu', 'vega', 'black box', 'ankama', 'ototo', 'meian', 'crunchyroll',
        'kazé', 'kaze', 'nobi nobi', 'le lézard noir', 'imho', 'omaké',
      ];

      // Check if publisher is a known French manga publisher
      if (frenchMangaPublishers.some(pub => publisher.includes(pub))) {
        return true;
      }

      // Check categories for manga
      if (categories.includes('manga') || categories.includes('comics & graphic novels')) {
        return true;
      }
    } else {
      // English/International manga publishers
      const englishMangaPublishers = [
        'viz media', 'viz', 'kodansha', 'seven seas', 'yen press',
        'dark horse manga', 'vertical', 'tokyopop', 'del rey manga',
        'square enix', 'digital manga', 'one peace books', 'j-novel club',
        'denpa', 'ablaze', 'ghost ship', 'airship', 'udon entertainment',
      ];

      // Check if publisher is a known English manga publisher
      if (englishMangaPublishers.some(pub => publisher.includes(pub))) {
        return true;
      }

      // Check for manga-related categories
      if (categories.includes('manga') || categories.includes('comics & graphic novels')) {
        return true;
      }
    }

    // ===== DEFAULT: REJECT if not from known manga publisher =====
    // This is strict mode - we only accept books from known manga publishers
    // Having "Tome" in title is NOT enough (many romance novels use this)
    return false;
  }

  /**
   * Search manga releases by year
   * @param year Year (e.g., 2024)
   * @param maxResults Maximum number of results (default 200)
   * @param language Language filter: 'fr' for French, 'en' for English/International
   */
  async searchMangaByYear(year: number, maxResults = 200, language: 'fr' | 'en' = 'fr') {
    this.logger.log(`Searching Google Books for manga: year ${year} (lang: ${language}, maxResults: ${maxResults})`);

    const allMangas: any[] = [];

    // Search month by month for better coverage
    for (let month = 1; month <= 12; month++) {
      try {
        const monthResults = await this.searchMangaByMonth(year, month, Math.ceil(maxResults / 12), language);
        allMangas.push(...monthResults.mangas);
        this.logger.log(`Month ${month}: Found ${monthResults.mangas.length} mangas`);
      } catch (error) {
        this.logger.error(`Error searching month ${month}:`, error.message);
      }
    }

    // Remove duplicates based on ISBN or title
    const uniqueMangas = this.removeDuplicates(allMangas);

    this.logger.log(`Total unique mangas found for ${year}: ${uniqueMangas.length}`);

    return {
      mangas: uniqueMangas,
      totalItems: uniqueMangas.length,
      year,
      language,
    };
  }

  /**
   * Remove duplicate manga entries
   */
  private removeDuplicates(mangas: any[]): any[] {
    const seen = new Set<string>();
    const unique: any[] = [];

    for (const manga of mangas) {
      // Use ISBN-13 as primary identifier, fallback to title
      const identifier = manga.isbn13 || manga.isbn10 || manga.title.toLowerCase();

      if (!seen.has(identifier)) {
        seen.add(identifier);
        unique.push(manga);
      }
    }

    return unique;
  }

  /**
   * Search manga releases by month
   * @param year Year (e.g., 2024)
   * @param month Month (1-12)
   * @param maxResults Maximum number of results (default 40)
   * @param language Language filter: 'fr' for French, 'en' for English/International
   */
  async searchMangaByMonth(year: number, month: number, maxResults = 40, language: 'fr' | 'en' = 'fr') {
    try {
      // Format dates for the search query
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      // Broader Google Books query to get more results
      // Just search for manga in the specified language
      const query = `subject:manga`;

      const params = {
        q: query,
        langRestrict: language, // 'fr' or 'en'
        printType: 'books',
        orderBy: 'newest',
        maxResults: Math.min(maxResults, 40), // Google Books API limit
      };

      this.logger.log(`Searching Google Books for manga: ${year}-${month} (lang: ${language}, maxResults: ${maxResults})`);

      // Fetch multiple pages if maxResults > 40
      const allItems: GoogleBooksVolume[] = [];
      const requestsNeeded = Math.ceil(maxResults / 40);

      for (let i = 0; i < requestsNeeded; i++) {
        const startIndex = i * 40;
        const currentMaxResults = Math.min(40, maxResults - startIndex);

        if (currentMaxResults <= 0) break;

        try {
          const response = await firstValueFrom(
            this.httpService.get<GoogleBooksResponse>(this.GOOGLE_BOOKS_API_URL, {
              params: { ...params, startIndex, maxResults: currentMaxResults }
            }),
          );

          const items = response.data.items || [];
          allItems.push(...items);

          this.logger.log(`Fetched ${items.length} items (page ${i + 1}/${requestsNeeded})`);

          // If we got fewer items than requested, no point in continuing
          if (items.length < currentMaxResults) break;
        } catch (error) {
          this.logger.error(`Error fetching page ${i + 1}: ${error.message}`);
          break;
        }
      }

      this.logger.log(`Total items fetched from Google Books: ${allItems.length}`);

      // Filter and transform results
      const mangas = allItems
        .filter((item) => this.isLikelyManga(item, language)) // Filter out non-manga first with language context
        .map((item) => this.transformGoogleBooksItem(item))
        .filter((manga) => {
          // Additional filtering to ensure it's a manga and has valid data
          if (!manga.title) return false;

          // Check if published date is in the requested month
          if (manga.publishedDate) {
            // Handle different date formats from Google Books
            const dateStr = manga.publishedDate;

            // Try to parse the date
            // Google Books returns dates in various formats: "2024", "2024-01", "2024-01-15"
            if (dateStr.startsWith(`${year}-${String(month).padStart(2, '0')}`)) {
              return true;
            }

            // Try full date parsing
            const pubDate = new Date(dateStr);
            if (!isNaN(pubDate.getTime())) {
              const pubYear = pubDate.getFullYear();
              const pubMonth = pubDate.getMonth() + 1;

              if (pubYear === year && pubMonth === month) {
                return true;
              }
            }

            // If we only have year, don't filter it out completely
            if (dateStr === `${year}`) {
              return true;
            }

            return false;
          }

          // Keep items without publication date for manual review
          return true;
        });

      this.logger.log(`Found ${mangas.length} mangas matching ${year}-${month} criteria`);

      return {
        mangas,
        totalItems: allItems.length,
        filteredCount: mangas.length,
        query,
        language,
        dateRange: {
          start: startDate,
          end: endDate,
        },
      };
    } catch (error) {
      this.logger.error(`Error searching Google Books: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Transform Google Books item to our manga format
   */
  private transformGoogleBooksItem(item: GoogleBooksVolume) {
    const { volumeInfo } = item;

    // Extract ISBN-13 and ISBN-10
    const isbn13 = volumeInfo.industryIdentifiers?.find((id) => id.type === 'ISBN_13')?.identifier;
    const isbn10 = volumeInfo.industryIdentifiers?.find((id) => id.type === 'ISBN_10')?.identifier;

    return {
      googleBooksId: item.id,
      title: volumeInfo.title,
      subtitle: volumeInfo.subtitle,
      authors: volumeInfo.authors || [],
      publisher: volumeInfo.publisher,
      publishedDate: volumeInfo.publishedDate,
      description: volumeInfo.description,
      isbn13,
      isbn10,
      pageCount: volumeInfo.pageCount,
      categories: volumeInfo.categories || [],
      imageUrl: volumeInfo.imageLinks?.thumbnail?.replace('http://', 'https://'),
      language: volumeInfo.language,
      infoLink: volumeInfo.infoLink,
    };
  }

  /**
   * Get volume details by ISBN
   */
  async getByISBN(isbn: string) {
    try {
      const params = {
        q: `isbn:${isbn}`,
      };

      const response = await firstValueFrom(
        this.httpService.get<GoogleBooksResponse>(this.GOOGLE_BOOKS_API_URL, { params }),
      );

      const items = response.data.items || [];
      if (items.length === 0) {
        return null;
      }

      return this.transformGoogleBooksItem(items[0]);
    } catch (error) {
      this.logger.error(`Error fetching ISBN ${isbn}: ${error.message}`);
      return null;
    }
  }

  /**
   * Search for a specific manga volume by title and volume number
   * Optimized for French editions (Tome X format)
   * @param query Search query (e.g., "Death Note Tome 1")
   * @param volumeNumber Expected volume number for validation
   * @param language Language filter: 'fr' for French (default)
   */
  async searchVolumeByTitle(
    query: string,
    volumeNumber: number,
    language: 'fr' | 'en' = 'fr',
  ): Promise<{
    volumeNumber: number;
    title?: string;
    isbn?: string;
    releaseDate?: string;
    coverUrl?: string;
    description?: string;
    publisher?: string;
  } | null> {
    try {
      // Add "manga" to the query to filter results better
      const mangaQuery = `${query} manga`;

      const params = {
        q: mangaQuery,
        langRestrict: language,
        printType: 'books',
        maxResults: 15,
      };

      this.logger.debug(`Searching Google Books: "${mangaQuery}"`);

      const response = await firstValueFrom(
        this.httpService.get<GoogleBooksResponse>(this.GOOGLE_BOOKS_API_URL, { params }),
      );

      const items = response.data.items || [];
      if (items.length === 0) {
        this.logger.debug(`No results for "${mangaQuery}"`);
        return null;
      }

      this.logger.debug(`Found ${items.length} results, filtering for manga...`);

      // Filter for likely manga and matching volume number
      const mangaItems = items.filter(item => {
        const isManga = this.isLikelyManga(item, language);
        if (!isManga) {
          this.logger.debug(`Filtered out: "${item.volumeInfo.title}" (publisher: ${item.volumeInfo.publisher || 'N/A'})`);
        }
        return isManga;
      });

      if (mangaItems.length === 0) {
        this.logger.debug(`No manga items found after filtering`);
        return null;
      }

      this.logger.debug(`${mangaItems.length} manga items after filtering`);

      // Find the best match based on volume number in title
      let bestMatch = mangaItems[0];
      let bestScore = 0;

      for (const item of mangaItems) {
        let score = 0;
        const extractedVol = this.extractVolumeNumberFromTitle(item.volumeInfo.title);

        // Volume number match is most important
        if (extractedVol === volumeNumber) {
          score += 100;
        }

        // Prefer items with ISBN
        if (item.volumeInfo.industryIdentifiers?.length) {
          score += 20;
        }

        // Prefer items with cover images
        if (item.volumeInfo.imageLinks?.thumbnail) {
          score += 10;
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = item;
        }
      }

      const volumeInfo = bestMatch.volumeInfo;
      const isbn13 = volumeInfo.industryIdentifiers?.find(id => id.type === 'ISBN_13')?.identifier;
      const isbn10 = volumeInfo.industryIdentifiers?.find(id => id.type === 'ISBN_10')?.identifier;

      this.logger.debug(`Best match: "${volumeInfo.title}" (ISBN: ${isbn13 || isbn10 || 'N/A'}, publisher: ${volumeInfo.publisher || 'N/A'})`);

      // Get higher quality cover image
      let coverUrl = volumeInfo.imageLinks?.thumbnail;
      if (coverUrl) {
        // Google Books returns small thumbnails by default
        // Replace zoom parameter to get larger image
        coverUrl = coverUrl
          .replace('http://', 'https://')
          .replace('zoom=1', 'zoom=2')
          .replace('&edge=curl', '');
      }

      return {
        volumeNumber,
        title: volumeInfo.title,
        isbn: isbn13 || isbn10,
        releaseDate: volumeInfo.publishedDate,
        coverUrl,
        description: volumeInfo.description,
        publisher: volumeInfo.publisher,
      };
    } catch (error) {
      this.logger.error(`Error searching volume "${query}": ${error.message}`);
      return null;
    }
  }

  /**
   * Extract volume number from a title string
   */
  private extractVolumeNumberFromTitle(title: string): number | null {
    if (!title) return null;

    const patterns = [
      /tome\s*(\d+)/i,
      /vol\.?\s*(\d+)/i,
      /volume\s*(\d+)/i,
      /t\.?\s*(\d+)(?:\s|$)/i,
      /(\d+)巻/,
      /#(\d+)/,
    ];

    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    return null;
  }
}
