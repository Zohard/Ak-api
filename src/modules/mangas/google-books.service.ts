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
   * Search manga releases in France by month
   * @param year Year (e.g., 2024)
   * @param month Month (1-12)
   * @param maxResults Maximum number of results (default 40)
   */
  async searchMangaByMonth(year: number, month: number, maxResults = 40) {
    try {
      // Format dates for the search query
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      // Broader Google Books query to get more results
      // Just search for manga in French, don't restrict to first volumes
      const query = `subject:manga`;

      const params = {
        q: query,
        langRestrict: 'fr', // French language
        printType: 'books',
        orderBy: 'newest',
        maxResults: Math.min(maxResults, 40), // Google Books API limit
      };

      this.logger.log(`Searching Google Books for manga: ${year}-${month} (maxResults: ${maxResults})`);

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
}
